/* Automation engine: Trigger → Conditions → Actions.
 * Runs synchronously inside a tenant update so all side-effects are atomic.
 * External actions (e-mail, webhook) are explicitly SIMULATED and logged as such. */
import type { Automation, AutomationRun, Condition, Deal, Lead, Proposal, TenantData, TriggerType, Person, Company } from '../types';
import { TRIGGERS, ACTIONS } from '../config/labels';
import { DAY, daysBetween, uid } from '../lib/utils';

export interface TriggerCtx { lead?: Lead; deal?: Deal; proposal?: Proposal; person?: Person; company?: Company; stageId?: string }

function fieldValue(ctx: TriggerCtx, field: string): unknown {
  const rec = (ctx.lead ?? ctx.deal ?? ctx.proposal ?? ctx.person ?? ctx.company) as unknown as Record<string, unknown> | undefined;
  return rec?.[field];
}

export function evalCondition(ctx: TriggerCtx, c: Condition) {
  const v = fieldValue(ctx, c.field);
  const s = Array.isArray(v) ? v.join(',') : String(v ?? '');
  switch (c.op) {
    case 'eq': return s.toLowerCase() === c.value.toLowerCase();
    case 'neq': return s.toLowerCase() !== c.value.toLowerCase();
    case 'gt': return Number(v) > Number(c.value);
    case 'lt': return Number(v) < Number(c.value);
    case 'contains': return s.toLowerCase().includes(c.value.toLowerCase());
  }
}

function matchesTrigger(a: Automation, type: TriggerType, ctx: TriggerCtx) {
  if (a.trigger.type !== type) return false;
  if (type === 'deal.stage_changed' && a.trigger.params.stage) return ctx.stageId === a.trigger.params.stage;
  if (type === 'deal.value_above') return (ctx.deal?.value ?? 0) > Number(a.trigger.params.amount || 0);
  return true;
}

function targetLabel(ctx: TriggerCtx) {
  return ctx.lead?.name ?? ctx.deal?.name ?? ctx.proposal?.title ?? ctx.person?.name ?? ctx.company?.tradeName ?? 'Registro de teste';
}

/** Picks the next seller with the fewest open leads (round-robin by load). */
export function nextSeller(d: TenantData, teamId?: string) {
  const sellers = d.users.filter(u => u.active && ['seller'].includes(u.role) && (!teamId || u.teamId === teamId));
  const pool = sellers.length ? sellers : d.users.filter(u => u.active);
  const load = (id: string) => d.leads.filter(l => l.ownerId === id && !l.archivedAt && !['convertido', 'perdido', 'desqualificado'].includes(l.status)).length;
  return [...pool].sort((a, b) => load(a.id) - load(b.id))[0];
}

export function executeAutomation(d: TenantData, a: Automation, ctx: TriggerCtx, test: boolean, actorId: string): AutomationRun {
  const steps: AutomationRun['steps'] = [];
  const nowIso = new Date().toISOString();
  steps.push({ label: `Gatilho: ${TRIGGERS[a.trigger.type].label}`, ok: true, detail: targetLabel(ctx) });
  for (const c of a.conditions) {
    const ok = evalCondition(ctx, c);
    steps.push({ label: `Condição: ${c.field} ${c.op} "${c.value}"`, ok, detail: ok ? 'atendida' : 'não atendida — fluxo interrompido' });
    if (!ok) return finish(false);
  }
  const refs = { leadId: ctx.lead?.id, dealId: ctx.deal?.id, personId: ctx.deal?.personId ?? ctx.person?.id ?? ctx.proposal?.personId, companyId: ctx.deal?.companyId ?? ctx.company?.id ?? ctx.proposal?.companyId };
  const owner = ctx.lead?.ownerId ?? ctx.deal?.ownerId ?? ctx.proposal?.ownerId ?? ctx.person?.ownerId ?? actorId;

  for (const act of a.actions) {
    const p = act.params; const label = ACTIONS[act.type].label;
    try {
      switch (act.type) {
        case 'create_task':
          d.tasks = [{ id: uid('tk'), title: p.title || 'Tarefa automática', type: 'followup', due: new Date(Date.now() + Number(p.days || 1) * DAY).toISOString(), done: false, ownerId: owner, priority: 'media', refs, createdBy: `Automação: ${a.name}` }, ...d.tasks];
          steps.push({ label, ok: true, detail: `"${p.title}" em ${p.days || 1} dia(s)` }); break;
        case 'change_status':
          if (ctx.lead) { d.leads = d.leads.map(l => (l.id === ctx.lead!.id ? { ...l, status: p.status as Lead['status'] } : l)); steps.push({ label, ok: true, detail: `→ ${p.status}` }); }
          else steps.push({ label, ok: false, detail: 'Ação aplica-se apenas a leads' });
          break;
        case 'assign_owner': {
          const u = p.userId ? d.users.find(x => x.id === p.userId) : nextSeller(d, ctx.lead?.teamId);
          if (u && ctx.lead) d.leads = d.leads.map(l => (l.id === ctx.lead!.id ? { ...l, ownerId: u.id, teamId: u.teamId } : l));
          if (u && ctx.deal) d.deals = d.deals.map(x => (x.id === ctx.deal!.id ? { ...x, ownerId: u.id } : x));
          steps.push({ label, ok: !!u, detail: u ? `Atribuído a ${u.name}${p.userId ? '' : ' (rodízio por carga)'}` : 'Nenhum usuário disponível' }); break;
        }
        case 'add_tag':
          if (ctx.lead) d.leads = d.leads.map(l => (l.id === ctx.lead!.id && !l.tags.includes(p.tag) ? { ...l, tags: [...l.tags, p.tag] } : l));
          if (ctx.person) d.people = d.people.map(x => (x.id === ctx.person!.id && !x.tags.includes(p.tag) ? { ...x, tags: [...x.tags, p.tag] } : x));
          steps.push({ label, ok: true, detail: p.tag }); break;
        case 'notify':
          d.notifications = [{ id: uid('nt'), at: nowIso, title: p.message || 'Notificação de automação', body: `${a.name} · ${targetLabel(ctx)}`, read: false, kind: 'info' }, ...d.notifications];
          steps.push({ label, ok: true, detail: p.message }); break;
        case 'send_email':
          d.activities = [{ id: uid('ac'), type: 'email', title: `E-mail automático (simulado): ${p.subject}`, body: 'Integração de e-mail não conectada — nenhum e-mail real foi enviado.', at: nowIso, userId: actorId, refs, meta: { simulated: true } }, ...d.activities];
          steps.push({ label, ok: true, detail: `SIMULADO · "${p.subject}"` }); break;
        case 'create_event': {
          const start = new Date(Date.now() + Number(p.days || 1) * DAY); start.setHours(10, 0, 0, 0);
          d.events = [{ id: uid('ev'), title: p.title || 'Evento automático', type: 'followup', start: start.toISOString(), end: new Date(start.getTime() + 30 * 60000).toISOString(), participants: [owner], ownerId: owner, refs, reminderMin: 15, done: false }, ...d.events];
          steps.push({ label, ok: true, detail: `${p.title} em ${p.days || 1} dia(s)` }); break;
        }
        case 'move_deal':
          if (ctx.deal) { d.deals = d.deals.map(x => (x.id === ctx.deal!.id ? { ...x, stageId: p.stage, stageEnteredAt: nowIso } : x)); steps.push({ label, ok: true }); }
          else steps.push({ label, ok: false, detail: 'Ação aplica-se apenas a oportunidades' });
          break;
        case 'update_field':
          if (ctx.lead) d.leads = d.leads.map(l => (l.id === ctx.lead!.id ? { ...l, [p.field]: p.value } : l));
          else if (ctx.deal) d.deals = d.deals.map(x => (x.id === ctx.deal!.id ? { ...x, [p.field]: p.value } : x));
          steps.push({ label, ok: true, detail: `${p.field} = ${p.value}` }); break;
        case 'webhook':
          d.activities = [{ id: uid('ac'), type: 'system', title: 'Webhook disparado (simulado)', body: `POST ${p.url || '(sem URL)'} — nenhuma requisição real foi feita.`, at: nowIso, userId: actorId, refs, meta: { simulated: true } }, ...d.activities];
          steps.push({ label, ok: !!p.url, detail: p.url ? `SIMULADO · POST ${p.url}` : 'URL não configurada' }); break;
        case 'approval': {
          const u = d.users.find(x => x.id === p.userId);
          d.notifications = [{ id: uid('nt'), at: nowIso, title: `Aprovação solicitada${u ? ` a ${u.name}` : ''}`, body: targetLabel(ctx), read: false, kind: 'warning' }, ...d.notifications];
          steps.push({ label, ok: true, detail: u?.name }); break;
        }
      }
    } catch (e) {
      steps.push({ label, ok: false, detail: String(e) });
    }
  }
  return finish(true);

  function finish(ok: boolean): AutomationRun {
    const run: AutomationRun = { id: uid('run'), automationId: a.id, at: nowIso, test, ok, target: targetLabel(ctx), steps };
    if (!test) d.automations = d.automations.map(x => (x.id === a.id ? { ...x, runs: x.runs + 1, lastRunAt: nowIso } : x));
    d.automationRuns = [run, ...d.automationRuns].slice(0, 60);
    return run;
  }
}

/** Fires all active automations matching an event. Mutates `d`. */
export function fire(d: TenantData, type: TriggerType, ctx: TriggerCtx, actorId: string) {
  const runs: AutomationRun[] = [];
  for (const a of d.automations.filter(x => x.active)) {
    if (matchesTrigger(a, type, ctx)) runs.push(executeAutomation(d, a, ctx, false, actorId));
  }
  return runs;
}

/** Time-based triggers (no response / inactivity). Would run on a scheduler (cron) in production. */
export function runScheduled(d: TenantData, actorId: string) {
  const runs: AutomationRun[] = [];
  for (const a of d.automations.filter(x => x.active)) {
    if (a.trigger.type === 'lead.no_response') {
      const days = Number(a.trigger.params.days || 3);
      d.leads.filter(l => !l.archivedAt && ['em_contato', 'aguardando', 'novo'].includes(l.status) && daysBetween(l.lastContactAt ?? l.createdAt) >= days && !l.tags.includes('Reativação'))
        .slice(0, 5).forEach(l => runs.push(executeAutomation(d, a, { lead: l }, false, actorId)));
    }
    if (a.trigger.type === 'customer.inactive') {
      const days = Number(a.trigger.params.days || 30);
      d.companies.filter(c => c.category === 'cliente' && !c.archivedAt).filter(c => {
        const last = d.activities.filter(x => x.refs.companyId === c.id).map(x => x.at).sort().pop();
        return !last || daysBetween(last) >= days;
      }).slice(0, 5).forEach(c => runs.push(executeAutomation(d, a, { company: c }, false, actorId)));
    }
  }
  return runs;
}

export function sampleContext(d: TenantData, a: Automation): TriggerCtx {
  switch (a.trigger.type) {
    case 'lead.created': case 'lead.no_response': return { lead: d.leads.find(l => !l.archivedAt) };
    case 'deal.stage_changed': return { deal: d.deals.find(x => x.status === 'open'), stageId: a.trigger.params.stage };
    case 'deal.value_above': return { deal: [...d.deals].sort((x, y) => y.value - x.value)[0] };
    case 'deal.won': return { deal: d.deals.find(x => x.status === 'won') };
    case 'deal.lost': return { deal: d.deals.find(x => x.status === 'lost') };
    case 'proposal.sent': return { proposal: d.proposals.find(p => p.status === 'enviada') ?? d.proposals[0] };
    case 'customer.inactive': return { company: d.companies.find(c => c.category === 'cliente') };
  }
}
