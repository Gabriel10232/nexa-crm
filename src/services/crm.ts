/* Domain service: every write goes through here so audit trail, timeline
 * entries and automations are applied consistently. Swap `updateTenant`
 * for API calls when a backend is connected. */
import type {
  Activity, ActivityType, Automation, CalEvent, Company, Deal, Lead, Person, Proposal, Refs, Task, TenantData,
  DashboardLayout, Appearance, Conversation, Goal, User, Pipeline, AutomationRun,
} from '../types';
import { store, updateTenant, currentTenant } from '../store/store';
import { currentUserId } from './auth';
import { fire, executeAutomation, runScheduled, sampleContext, nextSeller } from './automation';
import { deepClone, digits, normalize, uid } from '../lib/utils';
import { LEAD_STATUS } from '../config/labels';

const nowIso = () => new Date().toISOString();
const me = () => currentUserId();
const tenant = () => currentTenant(store.get()).data;

function audit(d: TenantData, action: string, entity: string, detail: string, entityId?: string) {
  d.audit = [{ id: uid('au'), at: nowIso(), userId: me(), action, entity, entityId, detail }, ...d.audit].slice(0, 400);
}
function act(d: TenantData, type: ActivityType, title: string, refs: Refs, body?: string, meta?: Record<string, unknown>) {
  d.activities = [{ id: uid('ac'), type, title, body, at: nowIso(), userId: me(), refs, meta }, ...d.activities];
}
const replace = <T extends { id: string }>(arr: T[], id: string, patch: Partial<T>) => arr.map(x => (x.id === id ? { ...x, ...patch } : x));

/* ============================ LEADS ============================ */
export const leads = {
  create(input: Omit<Lead, 'id' | 'createdAt' | 'score'> & { score?: number }) {
    const l: Lead = { ...input, id: uid('ld'), createdAt: nowIso(), score: input.score ?? 40 };
    let runs: AutomationRun[] = [];
    updateTenant(d => {
      d.leads = [l, ...d.leads];
      act(d, 'system', 'Lead criado', { leadId: l.id }, `Origem: ${l.source}`);
      audit(d, 'create', 'Lead', `Criou o lead ${l.name}`, l.id);
      runs = fire(d, 'lead.created', { lead: l }, me());
    });
    return { lead: l, runs };
  },
  update(id: string, patch: Partial<Lead>) {
    updateTenant(d => {
      const prev = d.leads.find(x => x.id === id); if (!prev) return;
      d.leads = replace(d.leads, id, patch);
      if (patch.status && patch.status !== prev.status) act(d, 'status', `Status: ${LEAD_STATUS[prev.status].label} → ${LEAD_STATUS[patch.status].label}`, { leadId: id }, patch.lostReason ? `Motivo: ${patch.lostReason}` : undefined);
      if (patch.ownerId && patch.ownerId !== prev.ownerId) act(d, 'change', `Responsável alterado para ${d.users.find(u => u.id === patch.ownerId)?.name}`, { leadId: id });
      const changed = Object.keys(patch).filter(k => JSON.stringify((prev as never)[k]) !== JSON.stringify((patch as never)[k]));
      if (changed.length) audit(d, 'update', 'Lead', `Editou ${prev.name}: ${changed.join(', ')}`, id);
    });
  },
  bulk(ids: string[], patch: Partial<Lead> | ((l: Lead) => Partial<Lead>), label: string) {
    updateTenant(d => {
      d.leads = d.leads.map(l => (ids.includes(l.id) ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l));
      ids.forEach(id => act(d, 'change', label, { leadId: id }));
      audit(d, 'bulk', 'Lead', `${label} em ${ids.length} lead(s)`);
    });
  },
  archive(ids: string[]) {
    updateTenant(d => { d.leads = d.leads.map(l => (ids.includes(l.id) ? { ...l, archivedAt: nowIso() } : l)); audit(d, 'archive', 'Lead', `Arquivou ${ids.length} lead(s)`); });
  },
  restore(ids: string[]) {
    updateTenant(d => { d.leads = d.leads.map(l => (ids.includes(l.id) ? { ...l, archivedAt: undefined } : l)); audit(d, 'restore', 'Lead', `Restaurou ${ids.length} lead(s)`); });
  },
  hardDelete(ids: string[]) {
    updateTenant(d => {
      const names = d.leads.filter(l => ids.includes(l.id)).map(l => l.name).join(', ');
      d.leads = d.leads.filter(l => !ids.includes(l.id));
      d.activities = d.activities.filter(a => !a.refs.leadId || !ids.includes(a.refs.leadId) || !!a.refs.personId || !!a.refs.companyId);
      audit(d, 'hard_delete', 'Lead', `Excluiu definitivamente: ${names}`);
    });
  },
  clone(id: string) {
    const src = tenant().leads.find(l => l.id === id); if (!src) return;
    const copy: Lead = { ...deepClone(src), id: uid('ld'), name: `${src.name} (cópia)`, createdAt: nowIso(), status: 'novo', archivedAt: undefined, converted: undefined, convertedAt: undefined };
    updateTenant(d => { d.leads = [copy, ...d.leads]; audit(d, 'clone', 'Lead', `Clonou ${src.name}`, copy.id); });
    return copy;
  },
  reopen(id: string) { leads.update(id, { status: 'em_contato', lostReason: undefined }); },
  /** Round-robin by current load, recomputed after each assignment. */
  distribute(ids: string[]) {
    let changed = 0;
    updateTenant(d => {
      ids.forEach(id => {
        const l = d.leads.find(x => x.id === id); if (!l) return;
        const u = d.org.distribution === 'by_team' ? nextSeller(d, l.teamId) : nextSeller(d);
        if (u && u.id !== l.ownerId) { d.leads = replace(d.leads, id, { ownerId: u.id, teamId: u.teamId }); act(d, 'change', `Distribuído para ${u.name}`, { leadId: id }); changed++; }
      });
      audit(d, 'distribute', 'Lead', `Distribuiu ${changed} lead(s)`);
    });
    return changed;
  },
  /** Merge `dupId` into `keepId`, preserving history, tags and filling blank fields. */
  merge(keepId: string, dupId: string) {
    updateTenant(d => {
      const keep = d.leads.find(l => l.id === keepId)!, dup = d.leads.find(l => l.id === dupId)!;
      const merged: Lead = { ...dup, ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined && v !== '')) as Lead, tags: Array.from(new Set([...keep.tags, ...dup.tags])), notes: [keep.notes, dup.notes].filter(Boolean).join('\n---\n') || undefined, value: Math.max(keep.value, dup.value) };
      d.leads = d.leads.filter(l => l.id !== dupId).map(l => (l.id === keepId ? merged : l));
      d.activities = d.activities.map(a => (a.refs.leadId === dupId ? { ...a, refs: { ...a.refs, leadId: keepId } } : a));
      act(d, 'change', `Mesclado com ${dup.name}`, { leadId: keepId }, 'Histórico, tags e notas preservados.');
      audit(d, 'merge', 'Lead', `Mesclou ${dup.name} em ${keep.name}`, keepId);
    });
  },
  /** Conversion flow: preserves history, notes, tags, source, owner, files and creation date. Reuses existing records. */
  convert(id: string, opt: { mode: 'person' | 'company' | 'linked_person' | 'customer' | 'deal' | 'customer_deal'; existingCompanyId?: string; existingPersonId?: string; deal?: { name: string; value: number; pipelineId: string; stageId: string; expectedClose: string } }) {
    const out: { personId?: string; companyId?: string; dealId?: string } = {};
    updateTenant(d => {
      const l = d.leads.find(x => x.id === id); if (!l) return;
      const needPerson = ['person', 'linked_person', 'customer', 'customer_deal', 'deal'].includes(opt.mode) && opt.mode !== 'company';
      const needCompany = opt.mode === 'company' || opt.mode === 'linked_person' || ((opt.mode === 'customer' || opt.mode === 'customer_deal' || opt.mode === 'deal') && l.kind === 'business');
      const customer = opt.mode === 'customer' || opt.mode === 'customer_deal';
      // Company
      if (needCompany) {
        const existing = opt.existingCompanyId ? d.companies.find(c => c.id === opt.existingCompanyId) : l.companyId ? d.companies.find(c => c.id === l.companyId) : undefined;
        if (existing) { out.companyId = existing.id; if (customer) d.companies = replace(d.companies, existing.id, { category: 'cliente' }); }
        else {
          const co: Company = { id: uid('co'), tradeName: l.companyName || l.name, legalName: l.companyName || l.name, cnpj: l.cnpj, segment: 'Serviços', size: 'Pequena', website: l.website, email: l.email, phone: l.phone, whatsapp: l.whatsapp, city: l.city, state: l.state, source: l.source, ownerId: l.ownerId, status: 'ativo', category: customer ? 'cliente' : 'prospect', tags: [...l.tags], notes: l.notes, createdAt: l.createdAt };
          d.companies = [co, ...d.companies]; out.companyId = co.id;
        }
      }
      // Person
      if (needPerson || opt.mode === 'linked_person') {
        const existing = opt.existingPersonId ? d.people.find(p => p.id === opt.existingPersonId) : l.personId ? d.people.find(p => p.id === l.personId) : undefined;
        if (existing) {
          out.personId = existing.id;
          d.people = replace(d.people, existing.id, { lifecycle: customer ? 'cliente' : existing.lifecycle, tags: Array.from(new Set([...existing.tags, ...l.tags])) });
        } else {
          const p: Person = { id: uid('pe'), name: l.name, cpf: l.cpf, email: l.email, phone: l.phone, whatsapp: l.whatsapp, city: l.city, state: l.state, jobTitle: l.jobTitle, companyId: out.companyId, lifecycle: customer ? 'cliente' : 'prospect', source: l.source, product: l.product, value: l.value, ownerId: l.ownerId, tags: [...l.tags], notes: l.notes, createdAt: l.createdAt, companyHistory: out.companyId ? [{ companyId: out.companyId, from: nowIso() }] : [] };
          d.people = [p, ...d.people]; out.personId = p.id;
        }
      }
      // Deal
      if (opt.mode === 'deal' || opt.mode === 'customer_deal') {
        const pipe = d.pipelines.find(p => p.id === opt.deal?.pipelineId) ?? d.pipelines[0];
        const stage = pipe.stages.find(s => s.id === opt.deal?.stageId) ?? pipe.stages[0];
        const deal: Deal = { id: uid('dl'), name: opt.deal?.name || `${l.product ?? 'Oportunidade'} — ${l.companyName ?? l.name}`, personId: out.personId, companyId: out.companyId, leadId: l.id, product: l.product ?? '—', value: opt.deal?.value ?? l.value, probability: stage.probability, pipelineId: pipe.id, stageId: stage.id, status: 'open', ownerId: l.ownerId, openedAt: nowIso(), expectedClose: opt.deal?.expectedClose ?? new Date(Date.now() + 30 * 86400000).toISOString(), stageEnteredAt: nowIso(), source: l.source, priority: l.temperature === 'quente' ? 'alta' : 'media', files: [], notes: l.notes };
        d.deals = [deal, ...d.deals]; out.dealId = deal.id;
        fire(d, 'deal.value_above', { deal }, me());
      }
      // Re-point lead history to the new records (history preserved, nothing duplicated)
      d.activities = d.activities.map(a => (a.refs.leadId === id ? { ...a, refs: { ...a.refs, personId: a.refs.personId ?? out.personId, companyId: a.refs.companyId ?? out.companyId, dealId: a.refs.dealId ?? out.dealId } } : a));
      d.leads = replace(d.leads, id, { status: 'convertido', convertedAt: nowIso(), converted: { ...out, customer }, personId: out.personId, companyId: out.companyId });
      act(d, 'status', 'Lead convertido', { leadId: id, ...out }, `Modo: ${opt.mode}`);
      audit(d, 'convert', 'Lead', `Converteu ${l.name}`, id);
    });
    return out;
  },
};

/* ============================ DUPLICATES ============================ */
export interface DupHit { kind: 'lead' | 'person' | 'company'; id: string; label: string; reason: string }
export function findDuplicates(d: TenantData, q: { name?: string; email?: string; phone?: string; cpf?: string; cnpj?: string; legalName?: string }, excludeId?: string): DupHit[] {
  const hits: DupHit[] = [];
  const e = normalize(q.email), ph = digits(q.phone), cpf = digits(q.cpf), cnpj = digits(q.cnpj), n = normalize(q.name), ln = normalize(q.legalName);
  const check = (kind: DupHit['kind'], id: string, label: string, r: { email?: string; phone?: string; whatsapp?: string; cpf?: string; cnpj?: string; name?: string; legal?: string }) => {
    if (id === excludeId) return;
    const reasons: string[] = [];
    if (cpf && digits(r.cpf) === cpf) reasons.push('CPF');
    if (cnpj && digits(r.cnpj) === cnpj) reasons.push('CNPJ');
    if (e && normalize(r.email) === e) reasons.push('E-mail');
    if (ph.length >= 10 && (digits(r.phone) === ph || digits(r.whatsapp) === ph)) reasons.push('Telefone');
    if (n.length > 4 && normalize(r.name) === n) reasons.push('Nome');
    if (ln.length > 4 && normalize(r.legal) === ln) reasons.push('Razão social');
    if (reasons.length) hits.push({ kind, id, label, reason: reasons.join(', ') });
  };
  d.leads.filter(l => !l.archivedAt).forEach(l => check('lead', l.id, l.name, { ...l, name: l.name }));
  d.people.forEach(p => check('person', p.id, p.name, p));
  d.companies.forEach(c => check('company', c.id, c.tradeName, { ...c, name: c.tradeName, legal: c.legalName }));
  return hits.slice(0, 6);
}

/* ============================ PEOPLE & COMPANIES ============================ */
export const people = {
  create(p: Omit<Person, 'id' | 'createdAt' | 'companyHistory'>) {
    const x: Person = { ...p, id: uid('pe'), createdAt: nowIso(), companyHistory: p.companyId ? [{ companyId: p.companyId, from: nowIso() }] : [] };
    updateTenant(d => { d.people = [x, ...d.people]; act(d, 'system', 'Pessoa cadastrada', { personId: x.id, companyId: x.companyId }); audit(d, 'create', 'Pessoa', `Cadastrou ${x.name}`, x.id); });
    return x;
  },
  update(id: string, patch: Partial<Person>) {
    updateTenant(d => {
      const prev = d.people.find(p => p.id === id)!;
      d.people = replace(d.people, id, patch);
      const changed = Object.keys(patch).filter(k => JSON.stringify((prev as never)[k]) !== JSON.stringify((patch as never)[k]));
      if (changed.length) { audit(d, 'update', 'Pessoa', `Editou ${prev.name}: ${changed.join(', ')}`, id); act(d, 'change', `Dados atualizados: ${changed.slice(0, 4).join(', ')}`, { personId: id }); }
    });
  },
  /** Transfer to another company keeping individual history and recording the change. */
  transfer(id: string, toCompanyId: string | undefined) {
    updateTenant(d => {
      const p = d.people.find(x => x.id === id)!;
      const from = d.companies.find(c => c.id === p.companyId); const to = d.companies.find(c => c.id === toCompanyId);
      const hist = p.companyHistory.map(h => (!h.to && h.companyId === p.companyId ? { ...h, to: nowIso() } : h));
      if (toCompanyId) hist.push({ companyId: toCompanyId, from: nowIso() });
      d.people = replace(d.people, id, { companyId: toCompanyId, companyHistory: hist });
      const title = to ? `Transferido(a) de ${from?.tradeName ?? 'pessoa física'} para ${to.tradeName}` : `Desvinculado(a) de ${from?.tradeName}`;
      act(d, 'change', title, { personId: id }, 'Histórico individual preservado.');
      if (from) act(d, 'change', `${p.name} saiu da empresa`, { companyId: from.id });
      if (to) act(d, 'change', `${p.name} entrou na empresa`, { companyId: to.id });
      audit(d, 'transfer', 'Pessoa', title, id);
    });
  },
  archive(id: string, v = true) { updateTenant(d => { d.people = replace(d.people, id, { archivedAt: v ? nowIso() : undefined }); audit(d, v ? 'archive' : 'restore', 'Pessoa', `${v ? 'Arquivou' : 'Restaurou'} ${d.people.find(p => p.id === id)?.name}`, id); }); },
  hardDelete(id: string) { updateTenant(d => { const n = d.people.find(p => p.id === id)?.name; d.people = d.people.filter(p => p.id !== id); audit(d, 'hard_delete', 'Pessoa', `Excluiu definitivamente ${n}`, id); }); },
};

export const companies = {
  create(c: Omit<Company, 'id' | 'createdAt'>) {
    const x: Company = { ...c, id: uid('co'), createdAt: nowIso() };
    updateTenant(d => { d.companies = [x, ...d.companies]; act(d, 'system', 'Empresa cadastrada', { companyId: x.id }); audit(d, 'create', 'Empresa', `Cadastrou ${x.tradeName}`, x.id); });
    return x;
  },
  update(id: string, patch: Partial<Company>) {
    updateTenant(d => {
      const prev = d.companies.find(c => c.id === id)!;
      d.companies = replace(d.companies, id, patch);
      const changed = Object.keys(patch).filter(k => JSON.stringify((prev as never)[k]) !== JSON.stringify((patch as never)[k]));
      if (changed.length) { audit(d, 'update', 'Empresa', `Editou ${prev.tradeName}: ${changed.join(', ')}`, id); act(d, 'change', `Dados atualizados: ${changed.slice(0, 4).join(', ')}`, { companyId: id }); }
    });
  },
  archive(id: string, v = true) { updateTenant(d => { d.companies = replace(d.companies, id, { archivedAt: v ? nowIso() : undefined }); audit(d, v ? 'archive' : 'restore', 'Empresa', `${v ? 'Arquivou' : 'Restaurou'} ${d.companies.find(c => c.id === id)?.tradeName}`, id); }); },
  hardDelete(id: string) {
    updateTenant(d => {
      const n = d.companies.find(c => c.id === id)?.tradeName;
      d.companies = d.companies.filter(c => c.id !== id);
      d.people = d.people.map(p => (p.companyId === id ? { ...p, companyId: undefined } : p));
      audit(d, 'hard_delete', 'Empresa', `Excluiu definitivamente ${n}`, id);
    });
  },
};

/* ============================ ACTIVITIES / TIMELINE ============================ */
export function logActivity(a: Omit<Activity, 'id' | 'at' | 'userId'> & { at?: string }) {
  updateTenant(d => {
    // Interactions with a person linked to a company also belong to the company timeline.
    const refs = { ...a.refs };
    if (refs.personId && !refs.companyId && a.meta?.includeCompany !== false) refs.companyId = d.people.find(p => p.id === refs.personId)?.companyId;
    d.activities = [{ ...a, refs, id: uid('ac'), at: a.at ?? nowIso(), userId: me() }, ...d.activities];
    if (refs.leadId && ['call', 'email', 'whatsapp', 'meeting', 'message'].includes(a.type)) d.leads = replace(d.leads, refs.leadId, { lastContactAt: nowIso() });
    audit(d, 'log', 'Atividade', a.title);
  });
}

/* ============================ DEALS & PIPELINE ============================ */
export const deals = {
  create(x: Omit<Deal, 'id' | 'openedAt' | 'stageEnteredAt' | 'files' | 'status'> & { status?: Deal['status'] }) {
    const deal: Deal = { ...x, status: x.status ?? 'open', id: uid('dl'), openedAt: nowIso(), stageEnteredAt: nowIso(), files: [] };
    updateTenant(d => {
      d.deals = [deal, ...d.deals];
      act(d, 'deal', 'Oportunidade criada', { dealId: deal.id, personId: deal.personId, companyId: deal.companyId }, deal.name);
      audit(d, 'create', 'Oportunidade', `Criou ${deal.name}`, deal.id);
      fire(d, 'deal.value_above', { deal }, me());
    });
    return deal;
  },
  update(id: string, patch: Partial<Deal>) {
    updateTenant(d => {
      const prev = d.deals.find(x => x.id === id)!; d.deals = replace(d.deals, id, patch);
      if (patch.value !== undefined && patch.value !== prev.value) { act(d, 'change', `Valor alterado`, { dealId: id, companyId: prev.companyId, personId: prev.personId }, `${prev.value} → ${patch.value}`); fire(d, 'deal.value_above', { deal: { ...prev, ...patch } }, me()); }
      audit(d, 'update', 'Oportunidade', `Editou ${prev.name}`, id);
    });
  },
  /** Moves a deal to a stage; handles won/lost transitions and fires automations. */
  move(id: string, stageId: string, lostReason?: string) {
    let runs: AutomationRun[] = [];
    updateTenant(d => {
      const prev = d.deals.find(x => x.id === id); if (!prev || prev.stageId === stageId) return;
      const pipe = d.pipelines.find(p => p.id === prev.pipelineId)!;
      const st = pipe.stages.find(s => s.id === stageId)!;
      const status = st.kind === 'won' ? 'won' : st.kind === 'lost' ? 'lost' : 'open';
      const patch: Partial<Deal> = { stageId, stageEnteredAt: nowIso(), probability: st.probability, status, closedAt: status !== 'open' ? nowIso() : undefined, lostReason: status === 'lost' ? lostReason : undefined };
      d.deals = replace(d.deals, id, patch);
      const next = { ...prev, ...patch };
      act(d, 'status', `Movida para ${st.name}`, { dealId: id, companyId: prev.companyId, personId: prev.personId }, lostReason ? `Motivo da perda: ${lostReason}` : undefined);
      audit(d, 'move', 'Oportunidade', `${prev.name} → ${st.name}`, id);
      runs = fire(d, 'deal.stage_changed', { deal: next, stageId }, me());
      if (status === 'won') {
        runs.push(...fire(d, 'deal.won', { deal: next }, me()));
        if (prev.companyId) d.companies = replace(d.companies, prev.companyId, { category: 'cliente' });
        if (prev.personId) d.people = replace(d.people, prev.personId, { lifecycle: 'cliente' });
      }
      if (status === 'lost') runs.push(...fire(d, 'deal.lost', { deal: next }, me()));
    });
    return runs;
  },
  archive(id: string, v = true) { updateTenant(d => { d.deals = replace(d.deals, id, { archivedAt: v ? nowIso() : undefined }); audit(d, v ? 'archive' : 'restore', 'Oportunidade', d.deals.find(x => x.id === id)?.name ?? '', id); }); },
  hardDelete(id: string) { updateTenant(d => { const n = d.deals.find(x => x.id === id)?.name; d.deals = d.deals.filter(x => x.id !== id); audit(d, 'hard_delete', 'Oportunidade', `Excluiu definitivamente ${n}`, id); }); },
  addFile(id: string, name: string, size: number) {
    updateTenant(d => {
      const deal = d.deals.find(x => x.id === id)!;
      d.deals = replace(d.deals, id, { files: [...deal.files, { id: uid('f'), name, size, addedAt: nowIso(), by: me() }] });
      act(d, 'file', `Arquivo anexado: ${name}`, { dealId: id, companyId: deal.companyId, personId: deal.personId }, 'Armazenamento externo não conectado — apenas metadados salvos.');
    });
  },
};

export const pipelines = {
  save(p: Pipeline) { updateTenant(d => { d.pipelines = d.pipelines.some(x => x.id === p.id) ? replace(d.pipelines, p.id, p) : [...d.pipelines, p]; audit(d, 'update', 'Pipeline', `Salvou pipeline ${p.name}`, p.id); }); },
  remove(id: string) { updateTenant(d => { d.pipelines = d.pipelines.filter(p => p.id !== id); audit(d, 'delete', 'Pipeline', `Removeu pipeline`, id); }); },
};

/* ============================ TASKS & EVENTS ============================ */
export const tasks = {
  save(t: Partial<Task> & { title: string }) {
    updateTenant(d => {
      if (t.id && d.tasks.some(x => x.id === t.id)) d.tasks = replace(d.tasks, t.id, t);
      else { const n: Task = { type: 'tarefa', due: nowIso(), done: false, ownerId: me(), priority: 'media', refs: {}, ...t, id: uid('tk') }; d.tasks = [n, ...d.tasks]; act(d, 'task', `Tarefa criada: ${n.title}`, n.refs); }
      audit(d, 'save', 'Tarefa', t.title);
    });
  },
  toggle(id: string) {
    updateTenant(d => {
      const t = d.tasks.find(x => x.id === id)!;
      d.tasks = replace(d.tasks, id, { done: !t.done, doneAt: !t.done ? nowIso() : undefined });
      if (!t.done) act(d, 'task', `Tarefa concluída: ${t.title}`, t.refs);
    });
  },
  remove(id: string) { updateTenant(d => { const t = d.tasks.find(x => x.id === id); d.tasks = d.tasks.filter(x => x.id !== id); audit(d, 'delete', 'Tarefa', t?.title ?? ''); }); },
};

export const events = {
  save(e: Partial<CalEvent> & { title: string; start: string; end: string }) {
    updateTenant(d => {
      if (e.id && d.events.some(x => x.id === e.id)) {
        const prev = d.events.find(x => x.id === e.id)!;
        d.events = replace(d.events, e.id, e);
        if (prev.start !== e.start) act(d, 'change', `Evento reagendado: ${e.title}`, e.refs ?? prev.refs);
      } else {
        const n: CalEvent = { type: 'reuniao', participants: [me()], ownerId: me(), refs: {}, done: false, reminderMin: 15, ...e, id: uid('ev') };
        d.events = [n, ...d.events];
        if (n.type === 'reuniao' || n.type === 'demonstracao') act(d, 'meeting', `Agendado: ${n.title}`, n.refs);
      }
      audit(d, 'save', 'Evento', e.title);
    });
  },
  toggle(id: string) { updateTenant(d => { const e = d.events.find(x => x.id === id)!; d.events = replace(d.events, id, { done: !e.done }); }); },
  remove(id: string) { updateTenant(d => { d.events = d.events.filter(x => x.id !== id); audit(d, 'delete', 'Evento', id); }); },
};

/* ============================ INBOX ============================ */
export const inbox = {
  send(id: string, body: string, kind: 'user' | 'note') {
    updateTenant(d => {
      const c = d.conversations.find(x => x.id === id)!;
      d.conversations = replace(d.conversations, id, { messages: [...c.messages, { id: uid('ms'), from: kind, userId: me(), body, at: nowIso() }], status: kind === 'user' && c.status === 'resolvida' ? 'aberta' : c.status });
      if (kind === 'user') act(d, c.channel === 'whatsapp' ? 'whatsapp' : c.channel === 'email' ? 'email' : 'message', `Mensagem enviada (${c.channel}, simulada)`, { personId: c.personId, companyId: c.companyId }, body.slice(0, 160), { simulated: true });
    });
  },
  update(id: string, patch: Partial<Conversation>) { updateTenant(d => { d.conversations = replace(d.conversations, id, patch); }); },
  create(c: Omit<Conversation, 'id'>) { const x = { ...c, id: uid('cv') }; updateTenant(d => { d.conversations = [x, ...d.conversations]; }); return x; },
};

/* ============================ PROPOSALS ============================ */
export function proposalTotals(p: Pick<Proposal, 'items' | 'discount' | 'tax'>) {
  const subtotal = p.items.reduce((a, i) => a + i.qty * i.price * (1 - i.discount / 100), 0);
  const discount = subtotal * (p.discount / 100);
  const tax = (subtotal - discount) * (p.tax / 100);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}
export const proposals = {
  save(p: Proposal) {
    updateTenant(d => {
      const prev = d.proposals.find(x => x.id === p.id);
      d.proposals = prev ? replace(d.proposals, p.id, p) : [p, ...d.proposals];
      if (!prev) act(d, 'proposal', `Proposta criada: ${p.number}`, { dealId: p.dealId, companyId: p.companyId, personId: p.personId, proposalId: p.id });
      if (prev && prev.status !== p.status) {
        act(d, 'proposal', `Proposta ${p.number}: ${p.status}`, { dealId: p.dealId, companyId: p.companyId, personId: p.personId, proposalId: p.id });
        if (p.status === 'enviada') fire(d, 'proposal.sent', { proposal: p }, me());
      }
      audit(d, prev ? 'update' : 'create', 'Proposta', `${p.number} — ${p.title}`, p.id);
    });
  },
  remove(id: string) { updateTenant(d => { d.proposals = d.proposals.filter(p => p.id !== id); audit(d, 'delete', 'Proposta', id); }); },
};

/* ============================ AUTOMATIONS ============================ */
export const automations = {
  save(a: Automation) { updateTenant(d => { d.automations = d.automations.some(x => x.id === a.id) ? replace(d.automations, a.id, a) : [a, ...d.automations]; audit(d, 'save', 'Automação', a.name, a.id); }); },
  toggle(id: string) { updateTenant(d => { const a = d.automations.find(x => x.id === id)!; d.automations = replace(d.automations, id, { active: !a.active }); audit(d, 'toggle', 'Automação', `${a.name}: ${a.active ? 'desativada' : 'ativada'}`, id); }); },
  remove(id: string) { updateTenant(d => { d.automations = d.automations.filter(x => x.id !== id); audit(d, 'delete', 'Automação', id); }); },
  /** Dry-run on a sandbox copy: no data changes, only the run log is kept. */
  test(a: Automation) {
    let run!: AutomationRun;
    updateTenant(d => {
      const sandbox = deepClone(d);
      run = executeAutomation(sandbox, a, sampleContext(sandbox, a), true, me());
      d.automationRuns = [run, ...d.automationRuns].slice(0, 60);
    });
    return run;
  },
  runScheduled() { let runs: AutomationRun[] = []; updateTenant(d => { runs = runScheduled(d, me()); }); return runs; },
};

/* ============================ TEAM / ORG ============================ */
export const team = {
  saveUser(u: User) { updateTenant(d => { const exists = d.users.some(x => x.id === u.id); d.users = exists ? replace(d.users, u.id, u) : [...d.users, u]; audit(d, exists ? 'update' : 'invite', 'Usuário', `${exists ? 'Atualizou' : 'Convidou'} ${u.name} (${u.role})`, u.id); }); },
  toggleUser(id: string) { updateTenant(d => { const u = d.users.find(x => x.id === id)!; d.users = replace(d.users, id, { active: !u.active }); audit(d, u.active ? 'deactivate' : 'activate', 'Usuário', u.name, id); }); },
  endSession(id: string) { updateTenant(d => { d.sessions = d.sessions.filter(s => s.id !== id); audit(d, 'revoke', 'Sessão', id); }); },
  saveGoal(g: Goal) { updateTenant(d => { d.goals = d.goals.some(x => x.id === g.id) ? replace(d.goals, g.id, g) : [...d.goals, g]; audit(d, 'save', 'Meta', `${g.metric} ${g.period}`); }); },
  removeGoal(id: string) { updateTenant(d => { d.goals = d.goals.filter(g => g.id !== id); }); },
};

export const settings = {
  org(patch: Partial<TenantData['org']>) { updateTenant(d => { d.org = { ...d.org, ...patch }; audit(d, 'update', 'Configurações', Object.keys(patch).join(', ')); }); },
  patch(fn: (d: TenantData) => void, label?: string) { updateTenant(d => { fn(d); if (label) audit(d, 'update', 'Configurações', label); }); },
  appearance(a: Appearance) { updateTenant(d => { d.appearance = a; }); },
  dashboards(list: DashboardLayout[], activeId?: string) { updateTenant(d => { d.dashboards = list; if (activeId) d.activeDashboardId = activeId; }); },
  notifications(fn: (n: TenantData['notifications']) => TenantData['notifications']) { updateTenant(d => { d.notifications = fn(d.notifications); }); },
};
