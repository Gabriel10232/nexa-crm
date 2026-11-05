/* Record forms (dynamic by type), duplicate detection, conversion and activity logging. */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, UserPlus, Target, Briefcase, AlertTriangle, Link2 } from 'lucide-react';
import type { CalEvent, Company, CompanySize, ContactType, Deal, EventType, Lead, LeadKind, Lifecycle, Person, Refs, Task, TaskType, ActivityType } from '../types';
import { Button, Field, Input, Modal, Notice, Select, Textarea, Badge } from './ui';
import { TagInput, UserSelect, useLookups } from './common';
import { useTenant } from '../store/store';
import { useSession } from '../services/auth';
import { leads as leadSvc, people as peopleSvc, companies as companySvc, deals as dealSvc, tasks as taskSvc, events as eventSvc, logActivity, findDuplicates, DupHit } from '../services/crm';
import { toast } from '../store/ui';
import { CONTACT_TYPES, EVENT_TYPES, LEAD_STATUS, LIFECYCLE, SEGMENTS, TASK_TYPES, TEMPERATURE, UF } from '../config/labels';
import { fromInputDate, isCNPJ, isCPF, isEmail, isPhone, maskCEP, maskCNPJ, maskCPF, maskPhone, toInputDate, toInputDateTime, money } from '../lib/utils';

/* ---------- tiny form state helper ---------- */
type Errors = Record<string, string | undefined>;
function useForm<T extends Record<string, unknown>>(init: T) {
  const [v, setV] = useState<T>(init);
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof T>(k: K, val: T[K]) => { setV(s => ({ ...s, [k]: val })); if (errors[k as string]) setErrors(e => ({ ...e, [k as string]: undefined })); };
  const bind = (k: keyof T, mask?: (s: string) => string) => ({ value: (v[k] as string | number | undefined) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, (mask ? mask(e.target.value) : e.target.value) as T[keyof T]) });
  return { v, setV, set, bind, errors, setErrors };
}
function validate(rules: [boolean, string, string][]) {
  const e: Errors = {}; rules.forEach(([bad, k, msg]) => { if (bad && !e[k]) e[k] = msg; }); return e;
}
const focusFirstError = () => setTimeout(() => (document.querySelector('.modal .field.error input, .modal .field.error select, .modal .field.error textarea') as HTMLElement | null)?.focus(), 30);

/* ---------- Duplicate alert ---------- */
export function DuplicateAlert({ hits, onIgnore, onMerge }: { hits: DupHit[]; onIgnore: () => void; onMerge?: (h: DupHit) => void }) {
  const nav = useNavigate();
  if (!hits.length) return null;
  const path = (h: DupHit) => (h.kind === 'lead' ? `/leads/${h.id}` : h.kind === 'person' ? `/people/${h.id}` : `/companies/${h.id}`);
  return (
    <Notice tone="warning" icon={<AlertTriangle />}>
      <strong>Possível duplicidade encontrada</strong>
      <div className="stack-sm" style={{ marginTop: 8, gap: 6 }}>
        {hits.map(h => (
          <div key={h.kind + h.id} className="row wrap" style={{ gap: 6 }}>
            <Badge tone="warning">{h.kind === 'lead' ? 'Lead' : h.kind === 'person' ? 'Pessoa' : 'Empresa'}</Badge>
            <span className="strong">{h.label}</span><span className="muted xs">({h.reason})</span>
            <span className="flex1" />
            <Button size="xs" onClick={() => nav(path(h))}>Abrir existente</Button>
            {onMerge && h.kind === 'lead' && <Button size="xs" onClick={() => onMerge(h)}>Mesclar</Button>}
          </div>
        ))}
        <div className="row" style={{ gap: 6 }}><Button size="xs" variant="ghost" onClick={onIgnore}>Manter os dois</Button><Button size="xs" variant="ghost" onClick={onIgnore}>Ignorar alerta</Button></div>
      </div>
    </Notice>
  );
}

/* ---------- New record chooser ---------- */
export type RecordKind = 'person' | 'company' | 'linked_person' | 'lead_individual' | 'lead_business';
const KINDS: { k: RecordKind; label: string; desc: string; icon: React.ReactNode }[] = [
  { k: 'person', label: 'Pessoa física', desc: 'Contato independente, com CPF.', icon: <User /> },
  { k: 'company', label: 'Empresa', desc: 'Conta com CNPJ e várias pessoas.', icon: <Building2 /> },
  { k: 'linked_person', label: 'Pessoa vinculada', desc: 'Contato que trabalha numa empresa.', icon: <UserPlus /> },
  { k: 'lead_individual', label: 'Lead individual', desc: 'Oportunidade de pessoa física.', icon: <Target /> },
  { k: 'lead_business', label: 'Lead empresarial', desc: 'Oportunidade B2B, com empresa.', icon: <Briefcase /> },
];

export function NewRecordModal({ open, onClose, initial, companyId }: { open: boolean; onClose: () => void; initial?: RecordKind; companyId?: string }) {
  const [kind, setKind] = useState<RecordKind | null>(initial ?? null);
  useEffect(() => { if (open) setKind(initial ?? null); }, [open, initial]);
  if (!open) return null;
  if (!kind) return (
    <Modal open onClose={onClose} title="Novo registro" description="Escolha o tipo — o formulário se adapta automaticamente.">
      <div className="choice-grid">
        {KINDS.map(k => <button key={k.k} className="choice" onClick={() => setKind(k.k)}><span className="icon-bubble">{k.icon}</span><span className="t">{k.label}</span><span className="s">{k.desc}</span></button>)}
      </div>
    </Modal>
  );
  if (kind === 'company') return <CompanyForm open onClose={onClose} />;
  if (kind === 'person' || kind === 'linked_person') return <PersonForm open onClose={onClose} linked={kind === 'linked_person'} companyId={companyId} />;
  return <LeadForm open onClose={onClose} kind={kind === 'lead_business' ? 'business' : 'individual'} />;
}

/* ---------- Lead form ---------- */
export function LeadForm({ open, onClose, lead, kind: kind0 = 'business' }: { open: boolean; onClose: () => void; lead?: Lead; kind?: LeadKind }) {
  const d = useTenant(); const { user } = useSession(); const nav = useNavigate();
  const f = useForm<Record<string, unknown>>({
    kind: lead?.kind ?? kind0, name: lead?.name ?? '', companyName: lead?.companyName ?? '', companyId: lead?.companyId ?? '', newCompany: false,
    jobTitle: lead?.jobTitle ?? '', email: lead?.email ?? '', phone: lead?.phone ?? '', whatsapp: lead?.whatsapp ?? '', city: lead?.city ?? '', state: lead?.state ?? '',
    website: lead?.website ?? '', cpf: lead?.cpf ?? '', cnpj: lead?.cnpj ?? '', source: lead?.source ?? '', campaign: lead?.campaign ?? '', product: lead?.product ?? '',
    value: lead?.value ?? '', temperature: lead?.temperature ?? 'morno', ownerId: lead?.ownerId ?? user.id, status: lead?.status ?? 'novo', tags: lead?.tags ?? [],
    nextContactAt: toInputDate(lead?.nextContactAt), score: lead?.score ?? 40, notes: lead?.notes ?? '', custom: lead?.custom ?? {},
  });
  const { v, bind, set, errors, setErrors } = f;
  const [ignoreDup, setIgnoreDup] = useState(false);
  const business = v.kind === 'business';
  const dups = useMemo(() => ignoreDup ? [] : findDuplicates(d, { name: v.name as string, email: v.email as string, phone: v.phone as string, cpf: v.cpf as string, cnpj: v.cnpj as string }, lead?.id), [d, v.name, v.email, v.phone, v.cpf, v.cnpj, ignoreDup, lead?.id]);
  const customFields = d.customFields.filter(c => c.entity === 'lead');

  const save = () => {
    const e = validate([
      [!(v.name as string).trim(), 'name', 'Informe o nome do contato.'],
      [business && !(v.companyName as string).trim() && !v.companyId, 'companyName', 'Informe a empresa ou vincule uma existente.'],
      [!isEmail(v.email as string), 'email', 'E-mail inválido.'],
      [!isPhone(v.phone as string), 'phone', 'Telefone deve ter DDD + número.'],
      [!isPhone(v.whatsapp as string), 'whatsapp', 'WhatsApp deve ter DDD + número.'],
      [!business && !isCPF(v.cpf as string), 'cpf', 'CPF inválido.'],
      [business && !isCNPJ(v.cnpj as string), 'cnpj', 'CNPJ inválido.'],
      [!v.source, 'source', 'Selecione a origem.'],
      [!(v.email as string) && !(v.phone as string) && !(v.whatsapp as string), 'email', 'Informe ao menos um meio de contato (e-mail, telefone ou WhatsApp).'],
      [Number(v.value) < 0, 'value', 'Valor não pode ser negativo.'],
      ...customFields.filter(c => c.required).map(c => [!(v.custom as Record<string, string>)[c.id], `cf_${c.id}`, 'Campo obrigatório.'] as [boolean, string, string]),
    ]);
    setErrors(e); if (Object.keys(e).length) { focusFirstError(); return; }
    let companyId = (v.companyId as string) || undefined;
    if (business && !companyId && v.newCompany) {
      const co = companySvc.create({ tradeName: v.companyName as string, legalName: v.companyName as string, cnpj: (v.cnpj as string) || undefined, segment: 'Serviços', size: 'Pequena', website: v.website as string, ownerId: v.ownerId as string, status: 'ativo', category: 'prospect', tags: [], source: v.source as string, city: v.city as string, state: v.state as string });
      companyId = co.id;
    }
    const owner = d.users.find(u => u.id === v.ownerId)!;
    const payload = {
      kind: v.kind as LeadKind, name: (v.name as string).trim(), companyName: business ? (companyId ? d.companies.find(c => c.id === companyId)?.tradeName : v.companyName as string) : undefined, companyId,
      jobTitle: (v.jobTitle as string) || undefined, email: (v.email as string) || undefined, phone: (v.phone as string) || undefined, whatsapp: (v.whatsapp as string) || undefined,
      city: (v.city as string) || undefined, state: (v.state as string) || undefined, website: (v.website as string) || undefined, cpf: business ? undefined : (v.cpf as string) || undefined,
      cnpj: business ? (v.cnpj as string) || undefined : undefined, source: v.source as string, campaign: (v.campaign as string) || undefined, product: (v.product as string) || undefined,
      value: Number(v.value) || 0, temperature: v.temperature as Lead['temperature'], ownerId: owner.id, teamId: owner.teamId, status: v.status as Lead['status'], tags: v.tags as string[],
      nextContactAt: fromInputDate(v.nextContactAt as string), score: Number(v.score) || 0, notes: (v.notes as string) || undefined, custom: v.custom as Record<string, string>,
    };
    if (lead) { leadSvc.update(lead.id, payload); toast('success', 'Lead atualizado'); onClose(); }
    else {
      const { lead: l, runs } = leadSvc.create(payload);
      toast('success', 'Lead criado', runs.length ? `${runs.length} automação(ões) executada(s): ${runs.map(r => r.steps.slice(1).map(s => s.detail).filter(Boolean).join(', ')).join(' · ')}` : undefined, { label: 'Abrir lead', run: () => nav(`/leads/${l.id}`) });
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={lead ? `Editar lead` : business ? 'Novo lead empresarial' : 'Novo lead individual'} description="Campos com * são obrigatórios."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{lead ? 'Salvar alterações' : 'Criar lead'}</Button></>}>
      <div className="stack">
        {!lead && <div className="row wrap"><span className="label">Tipo:</span>
          <div className="pill-seg"><button aria-pressed={!business} onClick={() => set('kind', 'individual')}>Pessoa física</button><button aria-pressed={business} onClick={() => set('kind', 'business')}>Empresa</button></div></div>}
        <DuplicateAlert hits={dups} onIgnore={() => setIgnoreDup(true)} onMerge={lead ? h => { leadSvc.merge(lead.id, h.id); toast('success', 'Registros mesclados', 'Histórico preservado.'); onClose(); } : undefined} />
        <div className="form-grid">
          <div className="form-section">Identificação</div>
          <Field label="Nome do contato" required error={errors.name}><Input {...bind('name')} autoFocus placeholder="Ex.: Ana Souza" /></Field>
          {business ? <Field label="Cargo"><Input {...bind('jobTitle')} placeholder="Ex.: Diretora comercial" /></Field>
            : <Field label="CPF" error={errors.cpf}><Input {...bind('cpf', maskCPF)} placeholder="000.000.000-00" inputMode="numeric" /></Field>}
          {business && <>
            <Field label="Vincular a empresa existente" hint="Ou deixe vazio e informe o nome abaixo"><Select value={v.companyId as string} onChange={e => set('companyId', e.target.value)} placeholder="— Nenhuma —" options={d.companies.filter(c => !c.archivedAt).map(c => ({ value: c.id, label: c.tradeName }))} /></Field>
            {!v.companyId ? <Field label="Nome da empresa" required error={errors.companyName}><Input {...bind('companyName')} placeholder="Empresa do lead" /></Field> : <div />}
            {!v.companyId && <label className="check full"><input type="checkbox" checked={!!v.newCompany} onChange={e => set('newCompany', e.target.checked)} /> Criar também o cadastro da empresa agora</label>}
            <Field label="CNPJ" error={errors.cnpj}><Input {...bind('cnpj', maskCNPJ)} placeholder="00.000.000/0000-00" inputMode="numeric" /></Field>
            <Field label="Site"><Input {...bind('website')} placeholder="https://" /></Field>
          </>}
          <div className="form-section">Contato</div>
          <Field label="E-mail" error={errors.email}><Input {...bind('email')} type="email" placeholder="nome@empresa.com" /></Field>
          <Field label="Telefone" error={errors.phone}><Input {...bind('phone', maskPhone)} placeholder="(00) 00000-0000" inputMode="tel" /></Field>
          <Field label="WhatsApp" error={errors.whatsapp}><Input {...bind('whatsapp', maskPhone)} placeholder="(00) 00000-0000" inputMode="tel" /></Field>
          <div className="row" style={{ gap: 10 }}>
            <Field label="Cidade" className="flex1"><Input {...bind('city')} /></Field>
            <Field label="UF"><Select {...bind('state')} options={UF} placeholder="—" style={{ width: 84 }} /></Field>
          </div>
          <div className="form-section">Comercial</div>
          <Field label="Origem" required error={errors.source}><Select {...bind('source')} options={d.org.sources} placeholder="Selecione…" /></Field>
          <Field label="Campanha"><Input {...bind('campaign')} /></Field>
          <Field label="Produto de interesse"><Select {...bind('product')} options={d.org.products} placeholder="—" /></Field>
          <Field label="Valor estimado (R$)" error={errors.value}><Input {...bind('value')} type="number" min={0} step={100} /></Field>
          <Field label="Temperatura"><Select {...bind('temperature')} options={Object.entries(TEMPERATURE).map(([k, x]) => ({ value: k, label: x.label }))} /></Field>
          <Field label="Status"><Select {...bind('status')} options={Object.entries(LEAD_STATUS).map(([k, x]) => ({ value: k, label: x.label }))} /></Field>
          <Field label="Responsável" required><UserSelect value={v.ownerId as string} onChange={x => set('ownerId', x)} /></Field>
          <Field label="Próximo contato"><Input {...bind('nextContactAt')} type="date" /></Field>
          <Field label={`Pontuação (${v.score})`}><input className="range" type="range" min={0} max={100} value={v.score as number} onChange={e => set('score', Number(e.target.value))} /></Field>
          <div className="field full"><span className="label">Tags</span><TagInput value={v.tags as string[]} onChange={t => set('tags', t)} /></div>
          {customFields.length > 0 && <div className="form-section">Campos personalizados</div>}
          {customFields.map(c => (
            <Field key={c.id} label={c.label} required={c.required} error={errors[`cf_${c.id}`]}>
              {c.type === 'select' ? <Select value={(v.custom as Record<string, string>)[c.id] ?? ''} onChange={e => set('custom', { ...(v.custom as object), [c.id]: e.target.value })} options={c.options ?? []} placeholder="—" />
                : <Input type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'} value={(v.custom as Record<string, string>)[c.id] ?? ''} onChange={e => set('custom', { ...(v.custom as object), [c.id]: e.target.value })} />}
            </Field>
          ))}
          <Field label="Observações" className="full"><Textarea {...bind('notes')} rows={3} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Person form ---------- */
export function PersonForm({ open, onClose, person, linked, companyId }: { open: boolean; onClose: () => void; person?: Person; linked?: boolean; companyId?: string }) {
  const d = useTenant(); const { user } = useSession(); const nav = useNavigate();
  const isLinked = linked || !!person?.companyId || !!companyId;
  const f = useForm<Record<string, unknown>>({
    name: person?.name ?? '', cpf: person?.cpf ?? '', birthDate: person?.birthDate ?? '', email: person?.email ?? '', personalEmail: person?.personalEmail ?? '',
    phone: person?.phone ?? '', whatsapp: person?.whatsapp ?? '', linkedin: person?.linkedin ?? '', address: person?.address ?? '', city: person?.city ?? '', state: person?.state ?? '', cep: person?.cep ?? '',
    companyId: person?.companyId ?? companyId ?? '', newCompanyName: '', jobTitle: person?.jobTitle ?? '', department: person?.department ?? '', contactType: person?.contactType ?? '',
    influence: person?.influence ?? 3, decisionMaker: person?.decisionMaker ?? false, relationship: person?.relationship ?? 'novo', preference: person?.preference ?? 'email',
    lifecycle: person?.lifecycle ?? 'lead', source: person?.source ?? '', product: person?.product ?? '', value: person?.value ?? '', ownerId: person?.ownerId ?? user.id,
    tags: person?.tags ?? [], notes: person?.notes ?? '', nextContactAt: toInputDate(person?.nextContactAt), status: person?.status ?? '',
  });
  const { v, bind, set, errors, setErrors } = f;
  const [ignoreDup, setIgnoreDup] = useState(false);
  const dups = useMemo(() => ignoreDup ? [] : findDuplicates(d, { name: v.name as string, email: v.email as string, phone: v.phone as string, cpf: v.cpf as string }, person?.id), [d, v.name, v.email, v.phone, v.cpf, ignoreDup, person?.id]);

  const save = () => {
    const e = validate([
      [!(v.name as string).trim(), 'name', 'Informe o nome completo.'],
      [!isCPF(v.cpf as string), 'cpf', 'CPF inválido.'],
      [!isEmail(v.email as string), 'email', 'E-mail inválido.'],
      [!isEmail(v.personalEmail as string), 'personalEmail', 'E-mail inválido.'],
      [!isPhone(v.phone as string), 'phone', 'Telefone inválido.'],
      [!isPhone(v.whatsapp as string), 'whatsapp', 'WhatsApp inválido.'],
      [isLinked && !v.companyId && !(v.newCompanyName as string).trim(), 'companyId', 'Selecione a empresa ou crie uma nova.'],
    ]);
    setErrors(e); if (Object.keys(e).length) { focusFirstError(); return; }
    let coId = (v.companyId as string) || undefined;
    if (isLinked && !coId && (v.newCompanyName as string).trim()) {
      coId = companySvc.create({ tradeName: v.newCompanyName as string, legalName: v.newCompanyName as string, segment: 'Serviços', size: 'Pequena', ownerId: v.ownerId as string, status: 'ativo', category: 'prospect', tags: [] }).id;
    }
    const payload: Partial<Person> = {
      name: (v.name as string).trim(), cpf: (v.cpf as string) || undefined, birthDate: (v.birthDate as string) || undefined, email: (v.email as string) || undefined, personalEmail: (v.personalEmail as string) || undefined,
      phone: (v.phone as string) || undefined, whatsapp: (v.whatsapp as string) || undefined, linkedin: (v.linkedin as string) || undefined, address: (v.address as string) || undefined,
      city: (v.city as string) || undefined, state: (v.state as string) || undefined, cep: (v.cep as string) || undefined, jobTitle: (v.jobTitle as string) || undefined, department: (v.department as string) || undefined,
      contactType: (v.contactType as ContactType) || undefined, influence: Number(v.influence) as Person['influence'], decisionMaker: !!v.decisionMaker, relationship: v.relationship as Person['relationship'],
      preference: v.preference as Person['preference'], lifecycle: v.lifecycle as Lifecycle, source: (v.source as string) || undefined, product: (v.product as string) || undefined,
      value: Number(v.value) || undefined, ownerId: v.ownerId as string, tags: v.tags as string[], notes: (v.notes as string) || undefined, nextContactAt: fromInputDate(v.nextContactAt as string), status: (v.status as string) || undefined,
    };
    if (person) {
      peopleSvc.update(person.id, payload);
      if ((person.companyId ?? undefined) !== coId) peopleSvc.transfer(person.id, coId);
      toast('success', 'Pessoa atualizada'); onClose();
    } else {
      const p = peopleSvc.create({ ...(payload as Person), companyId: isLinked ? coId : undefined });
      toast('success', 'Pessoa cadastrada', undefined, { label: 'Abrir', run: () => nav(`/people/${p.id}`) }); onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={person ? 'Editar pessoa' : isLinked ? 'Nova pessoa vinculada à empresa' : 'Nova pessoa física'} description="Campos com * são obrigatórios."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{person ? 'Salvar' : 'Cadastrar'}</Button></>}>
      <div className="stack">
        <DuplicateAlert hits={dups} onIgnore={() => setIgnoreDup(true)} />
        <div className="form-grid">
          <div className="form-section">Identificação</div>
          <Field label="Nome completo" required error={errors.name}><Input {...bind('name')} autoFocus /></Field>
          {isLinked ? <Field label="Cargo"><Input {...bind('jobTitle')} /></Field> : <Field label="CPF" error={errors.cpf}><Input {...bind('cpf', maskCPF)} placeholder="000.000.000-00" inputMode="numeric" /></Field>}
          {isLinked ? <>
            <Field label="Empresa" required error={errors.companyId}><Select value={v.companyId as string} onChange={e => set('companyId', e.target.value)} placeholder="— Criar nova empresa —" options={d.companies.filter(c => !c.archivedAt).map(c => ({ value: c.id, label: c.tradeName }))} /></Field>
            {!v.companyId ? <Field label="Nome da nova empresa"><Input {...bind('newCompanyName')} placeholder="Será criada ao salvar" /></Field> : <Field label="Departamento"><Input {...bind('department')} /></Field>}
            <Field label="Tipo de contato"><Select {...bind('contactType')} options={Object.entries(CONTACT_TYPES).map(([k, l]) => ({ value: k, label: l }))} placeholder="—" /></Field>
            <Field label={`Nível de influência (${v.influence}/5)`}><input className="range" type="range" min={1} max={5} value={v.influence as number} onChange={e => set('influence', Number(e.target.value))} /></Field>
            <label className="check"><input type="checkbox" checked={!!v.decisionMaker} onChange={e => set('decisionMaker', e.target.checked)} /> Tem poder de decisão</label>
            <Field label="Status do relacionamento"><Select {...bind('relationship')} options={[{ value: 'novo', label: 'Novo' }, { value: 'ativo', label: 'Ativo' }, { value: 'frio', label: 'Frio' }, { value: 'promotor', label: 'Promotor' }, { value: 'detrator', label: 'Detrator' }]} /></Field>
          </> : <>
            <Field label="Data de nascimento"><Input {...bind('birthDate')} type="date" /></Field>
            <Field label="Categoria"><Select {...bind('lifecycle')} options={Object.entries(LIFECYCLE).map(([k, x]) => ({ value: k, label: x.label }))} /></Field>
          </>}
          <div className="form-section">Contato</div>
          <Field label={isLinked ? 'E-mail profissional' : 'E-mail'} error={errors.email}><Input {...bind('email')} type="email" /></Field>
          {isLinked && <Field label="E-mail pessoal" error={errors.personalEmail}><Input {...bind('personalEmail')} type="email" /></Field>}
          <Field label="Telefone" error={errors.phone}><Input {...bind('phone', maskPhone)} inputMode="tel" /></Field>
          <Field label="WhatsApp" error={errors.whatsapp}><Input {...bind('whatsapp', maskPhone)} inputMode="tel" /></Field>
          {isLinked && <Field label="LinkedIn"><Input {...bind('linkedin')} placeholder="linkedin.com/in/…" /></Field>}
          <Field label="Preferência de contato"><Select {...bind('preference')} options={[{ value: 'email', label: 'E-mail' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'telefone', label: 'Telefone' }, { value: 'reuniao', label: 'Reunião' }]} /></Field>
          {!isLinked && <>
            <Field label="Endereço" className="full"><Input {...bind('address')} /></Field>
            <Field label="Cidade"><Input {...bind('city')} /></Field>
            <div className="row" style={{ gap: 10 }}><Field label="UF"><Select {...bind('state')} options={UF} placeholder="—" style={{ width: 84 }} /></Field><Field label="CEP" className="flex1"><Input {...bind('cep', maskCEP)} inputMode="numeric" /></Field></div>
            <div className="form-section">Comercial</div>
            <Field label="Origem do lead"><Select {...bind('source')} options={d.org.sources} placeholder="—" /></Field>
            <Field label="Produto ou serviço de interesse"><Select {...bind('product')} options={d.org.products} placeholder="—" /></Field>
            <Field label="Valor estimado (R$)"><Input {...bind('value')} type="number" min={0} /></Field>
            <Field label="Status"><Input {...bind('status')} placeholder="Ex.: Em negociação" /></Field>
            <Field label="Próximo contato"><Input {...bind('nextContactAt')} type="date" /></Field>
          </>}
          <Field label={isLinked ? 'Responsável pelo relacionamento' : 'Responsável'} required><UserSelect value={v.ownerId as string} onChange={x => set('ownerId', x)} /></Field>
          <div className="field full"><span className="label">Tags</span><TagInput value={v.tags as string[]} onChange={t => set('tags', t)} /></div>
          <Field label="Observações" className="full"><Textarea {...bind('notes')} rows={3} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Company form ---------- */
export function CompanyForm({ open, onClose, company }: { open: boolean; onClose: () => void; company?: Company }) {
  const d = useTenant(); const { user } = useSession(); const nav = useNavigate();
  const f = useForm<Record<string, unknown>>({
    legalName: company?.legalName ?? '', tradeName: company?.tradeName ?? '', cnpj: company?.cnpj ?? '', segment: company?.segment ?? '', size: company?.size ?? 'Pequena',
    website: company?.website ?? '', email: company?.email ?? '', phone: company?.phone ?? '', whatsapp: company?.whatsapp ?? '', address: company?.address ?? '', city: company?.city ?? '',
    state: company?.state ?? '', cep: company?.cep ?? '', revenue: company?.revenue ?? '', employees: company?.employees ?? '', source: company?.source ?? '', ownerId: company?.ownerId ?? user.id,
    status: company?.status ?? 'ativo', category: company?.category ?? 'prospect', tags: company?.tags ?? [], notes: company?.notes ?? '',
  });
  const { v, bind, set, errors, setErrors } = f;
  const [ignoreDup, setIgnoreDup] = useState(false);
  const dups = useMemo(() => ignoreDup ? [] : findDuplicates(d, { cnpj: v.cnpj as string, email: v.email as string, legalName: v.legalName as string, name: v.tradeName as string }, company?.id), [d, v.cnpj, v.email, v.legalName, v.tradeName, ignoreDup, company?.id]);
  const save = () => {
    const e = validate([
      [!(v.legalName as string).trim(), 'legalName', 'Informe a razão social.'],
      [!(v.tradeName as string).trim(), 'tradeName', 'Informe o nome fantasia.'],
      [!isCNPJ(v.cnpj as string), 'cnpj', 'CNPJ inválido.'],
      [!isEmail(v.email as string), 'email', 'E-mail inválido.'],
      [!isPhone(v.phone as string), 'phone', 'Telefone inválido.'],
      [!v.segment, 'segment', 'Selecione o segmento.'],
    ]);
    setErrors(e); if (Object.keys(e).length) { focusFirstError(); return; }
    const payload = {
      legalName: (v.legalName as string).trim(), tradeName: (v.tradeName as string).trim(), cnpj: (v.cnpj as string) || undefined, segment: v.segment as string, size: v.size as CompanySize,
      website: (v.website as string) || undefined, email: (v.email as string) || undefined, phone: (v.phone as string) || undefined, whatsapp: (v.whatsapp as string) || undefined,
      address: (v.address as string) || undefined, city: (v.city as string) || undefined, state: (v.state as string) || undefined, cep: (v.cep as string) || undefined,
      revenue: Number(v.revenue) || undefined, employees: Number(v.employees) || undefined, source: (v.source as string) || undefined, ownerId: v.ownerId as string,
      status: v.status as Company['status'], category: v.category as Lifecycle, tags: v.tags as string[], notes: (v.notes as string) || undefined,
    };
    if (company) { companySvc.update(company.id, payload); toast('success', 'Empresa atualizada'); onClose(); }
    else { const c = companySvc.create(payload); toast('success', 'Empresa cadastrada', undefined, { label: 'Abrir', run: () => nav(`/companies/${c.id}`) }); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={company ? 'Editar empresa' : 'Nova empresa'} description="Campos com * são obrigatórios."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{company ? 'Salvar' : 'Cadastrar empresa'}</Button></>}>
      <div className="stack">
        <DuplicateAlert hits={dups} onIgnore={() => setIgnoreDup(true)} />
        <div className="form-grid">
          <div className="form-section">Dados cadastrais</div>
          <Field label="Razão social" required error={errors.legalName}><Input {...bind('legalName')} autoFocus /></Field>
          <Field label="Nome fantasia" required error={errors.tradeName}><Input {...bind('tradeName')} /></Field>
          <Field label="CNPJ" error={errors.cnpj}><Input {...bind('cnpj', maskCNPJ)} inputMode="numeric" placeholder="00.000.000/0000-00" /></Field>
          <Field label="Segmento" required error={errors.segment}><Select {...bind('segment')} options={SEGMENTS} placeholder="Selecione…" /></Field>
          <Field label="Porte"><Select {...bind('size')} options={['MEI', 'Micro', 'Pequena', 'Média', 'Grande']} /></Field>
          <Field label="Categoria"><Select {...bind('category')} options={Object.entries(LIFECYCLE).map(([k, x]) => ({ value: k, label: x.label }))} /></Field>
          <Field label="Faturamento estimado (R$/ano)"><Input {...bind('revenue')} type="number" min={0} /></Field>
          <Field label="Nº de funcionários"><Input {...bind('employees')} type="number" min={0} /></Field>
          <div className="form-section">Contato e endereço</div>
          <Field label="Site"><Input {...bind('website')} placeholder="https://" /></Field>
          <Field label="E-mail corporativo" error={errors.email}><Input {...bind('email')} type="email" /></Field>
          <Field label="Telefone principal" error={errors.phone}><Input {...bind('phone', maskPhone)} inputMode="tel" /></Field>
          <Field label="WhatsApp"><Input {...bind('whatsapp', maskPhone)} inputMode="tel" /></Field>
          <Field label="Endereço" className="full"><Input {...bind('address')} /></Field>
          <Field label="Cidade"><Input {...bind('city')} /></Field>
          <div className="row" style={{ gap: 10 }}><Field label="UF"><Select {...bind('state')} options={UF} placeholder="—" style={{ width: 84 }} /></Field><Field label="CEP" className="flex1"><Input {...bind('cep', maskCEP)} inputMode="numeric" /></Field></div>
          <div className="form-section">Comercial</div>
          <Field label="Origem do lead"><Select {...bind('source')} options={d.org.sources} placeholder="—" /></Field>
          <Field label="Responsável comercial" required><UserSelect value={v.ownerId as string} onChange={x => set('ownerId', x)} /></Field>
          <Field label="Status"><Select {...bind('status')} options={[{ value: 'ativo', label: 'Ativo' }, { value: 'em_negociacao', label: 'Em negociação' }, { value: 'inativo', label: 'Inativo' }]} /></Field>
          <div className="field full"><span className="label">Tags</span><TagInput value={v.tags as string[]} onChange={t => set('tags', t)} /></div>
          <Field label="Observações" className="full"><Textarea {...bind('notes')} rows={3} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Deal form ---------- */
export function DealForm({ open, onClose, deal, preset }: { open: boolean; onClose: () => void; deal?: Deal; preset?: Partial<Deal> }) {
  const d = useTenant(); const { user } = useSession(); const nav = useNavigate();
  const base = deal ?? preset;
  const pipe0 = d.pipelines.find(p => p.id === base?.pipelineId) ?? d.pipelines[0];
  const f = useForm<Record<string, unknown>>({
    name: base?.name ?? '', personId: base?.personId ?? '', companyId: base?.companyId ?? '', product: base?.product ?? '', value: base?.value ?? '',
    pipelineId: pipe0.id, stageId: base?.stageId ?? pipe0.stages[0].id, ownerId: base?.ownerId ?? user.id, expectedClose: toInputDate(base?.expectedClose ?? new Date(Date.now() + 30 * 864e5).toISOString()),
    source: base?.source ?? '', priority: base?.priority ?? 'media', notes: base?.notes ?? '', probability: base?.probability ?? '',
  });
  const { v, bind, set, errors, setErrors } = f;
  const pipe = d.pipelines.find(p => p.id === v.pipelineId) ?? pipe0;
  const save = () => {
    const e = validate([
      [!(v.name as string).trim(), 'name', 'Dê um nome à oportunidade.'],
      [!v.personId && !v.companyId, 'companyId', 'Vincule a uma empresa ou pessoa.'],
      [!(Number(v.value) > 0), 'value', 'Informe um valor maior que zero.'],
      [!v.expectedClose, 'expectedClose', 'Informe a previsão de fechamento.'],
    ]);
    setErrors(e); if (Object.keys(e).length) { focusFirstError(); return; }
    const st = pipe.stages.find(s => s.id === v.stageId)!;
    const payload = { name: (v.name as string).trim(), personId: (v.personId as string) || undefined, companyId: (v.companyId as string) || undefined, product: (v.product as string) || '—', value: Number(v.value), pipelineId: pipe.id, stageId: st.id, probability: v.probability !== '' ? Number(v.probability) : st.probability, ownerId: v.ownerId as string, expectedClose: fromInputDate(v.expectedClose as string)!, source: (v.source as string) || 'Manual', priority: v.priority as Deal['priority'], notes: (v.notes as string) || undefined, leadId: base?.leadId };
    if (deal) {
      dealSvc.update(deal.id, { ...payload, stageId: deal.stageId });
      if (deal.stageId !== st.id) dealSvc.move(deal.id, st.id);
      toast('success', 'Oportunidade atualizada'); onClose();
    } else { const x = dealSvc.create(payload); toast('success', 'Oportunidade criada', undefined, { label: 'Abrir', run: () => nav(`/opportunities/${x.id}`) }); onClose(); }
  };
  const companyPeople = d.people.filter(p => !v.companyId || p.companyId === v.companyId);
  return (
    <Modal open={open} onClose={onClose} size="lg" title={deal ? 'Editar oportunidade' : 'Nova oportunidade'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>{deal ? 'Salvar' : 'Criar oportunidade'}</Button></>}>
      <div className="form-grid">
        <Field label="Nome da oportunidade" required error={errors.name} className="full"><Input {...bind('name')} autoFocus placeholder="Ex.: Plano Enterprise — Lumen" /></Field>
        <Field label="Empresa" error={errors.companyId}><Select value={v.companyId as string} onChange={e => { set('companyId', e.target.value); set('personId', ''); }} placeholder="— Nenhuma (pessoa física) —" options={d.companies.filter(c => !c.archivedAt).map(c => ({ value: c.id, label: c.tradeName }))} /></Field>
        <Field label="Cliente (pessoa)"><Select {...bind('personId')} placeholder="—" options={companyPeople.map(p => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Produto ou serviço"><Select {...bind('product')} options={d.org.products} placeholder="—" /></Field>
        <Field label="Valor (R$)" required error={errors.value}><Input {...bind('value')} type="number" min={0} step={100} /></Field>
        <Field label="Pipeline"><Select value={v.pipelineId as string} onChange={e => { const p = d.pipelines.find(x => x.id === e.target.value)!; set('pipelineId', p.id); set('stageId', p.stages[0].id); }} options={d.pipelines.map(p => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Etapa"><Select {...bind('stageId')} options={pipe.stages.filter(s => s.kind === 'open').map(s => ({ value: s.id, label: `${s.name} (${s.probability}%)` }))} /></Field>
        <Field label="Probabilidade (%)" hint="Vazio = probabilidade da etapa"><Input {...bind('probability')} type="number" min={0} max={100} /></Field>
        <Field label="Previsão de fechamento" required error={errors.expectedClose}><Input {...bind('expectedClose')} type="date" /></Field>
        <Field label="Responsável"><UserSelect value={v.ownerId as string} onChange={x => set('ownerId', x)} /></Field>
        <Field label="Origem"><Select {...bind('source')} options={d.org.sources} placeholder="—" /></Field>
        <Field label="Prioridade"><Select {...bind('priority')} options={[{ value: 'baixa', label: 'Baixa' }, { value: 'media', label: 'Média' }, { value: 'alta', label: 'Alta' }]} /></Field>
        <Field label="Observações" className="full"><Textarea {...bind('notes')} rows={3} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- Task form ---------- */
export function TaskForm({ open, onClose, task, refs }: { open: boolean; onClose: () => void; task?: Task; refs?: Refs }) {
  const { user } = useSession();
  const f = useForm<Record<string, unknown>>({ title: task?.title ?? '', type: task?.type ?? 'tarefa', due: toInputDateTime(task?.due ?? new Date(Date.now() + 864e5).toISOString()), ownerId: task?.ownerId ?? user.id, priority: task?.priority ?? 'media', notes: task?.notes ?? '' });
  const { v, bind, set, errors, setErrors } = f;
  const save = () => {
    const e = validate([[!(v.title as string).trim(), 'title', 'Descreva a tarefa.'], [!v.due, 'due', 'Informe o prazo.']]);
    setErrors(e); if (Object.keys(e).length) { focusFirstError(); return; }
    taskSvc.save({ id: task?.id, title: (v.title as string).trim(), type: v.type as TaskType, due: new Date(v.due as string).toISOString(), ownerId: v.ownerId as string, priority: v.priority as Task['priority'], notes: (v.notes as string) || undefined, refs: task?.refs ?? refs ?? {} });
    toast('success', task ? 'Tarefa atualizada' : 'Tarefa criada'); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Editar tarefa' : 'Nova tarefa'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Título" required error={errors.title} className="full"><Input {...bind('title')} autoFocus /></Field>
        <Field label="Tipo"><Select {...bind('type')} options={Object.entries(TASK_TYPES).map(([k, l]) => ({ value: k, label: l }))} /></Field>
        <Field label="Prioridade"><Select {...bind('priority')} options={[{ value: 'baixa', label: 'Baixa' }, { value: 'media', label: 'Média' }, { value: 'alta', label: 'Alta' }]} /></Field>
        <Field label="Prazo" required error={errors.due}><Input {...bind('due')} type="datetime-local" /></Field>
        <Field label="Responsável"><UserSelect value={v.ownerId as string} onChange={x => set('ownerId', x)} /></Field>
        <Field label="Notas" className="full"><Textarea {...bind('notes')} rows={2} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- Event form ---------- */
export function EventForm({ open, onClose, event, refs, start }: { open: boolean; onClose: () => void; event?: CalEvent; refs?: Refs; start?: Date }) {
  const d = useTenant(); const { user } = useSession();
  const s0 = event ? new Date(event.start) : start ?? (() => { const x = new Date(Date.now() + 864e5); x.setHours(10, 0, 0, 0); return x; })();
  const e0 = event ? new Date(event.end) : new Date(s0.getTime() + 60 * 60000);
  const f = useForm<Record<string, unknown>>({
    title: event?.title ?? '', type: event?.type ?? 'reuniao', start: toInputDateTime(s0.toISOString()), end: toInputDateTime(e0.toISOString()),
    participants: event?.participants ?? [user.id], reminderMin: event?.reminderMin ?? 15, location: event?.location ?? '', notes: event?.notes ?? '',
    personId: event?.refs.personId ?? refs?.personId ?? '', companyId: event?.refs.companyId ?? refs?.companyId ?? '', dealId: event?.refs.dealId ?? refs?.dealId ?? '',
  });
  const { v, bind, set, errors, setErrors } = f;
  const save = () => {
    const e = validate([[!(v.title as string).trim(), 'title', 'Informe o título.'], [!v.start, 'start', 'Informe o início.'], [new Date(v.end as string) <= new Date(v.start as string), 'end', 'O término deve ser após o início.']]);
    setErrors(e); if (Object.keys(e).length) { focusFirstError(); return; }
    eventSvc.save({ id: event?.id, title: (v.title as string).trim(), type: v.type as EventType, start: new Date(v.start as string).toISOString(), end: new Date(v.end as string).toISOString(), participants: v.participants as string[], ownerId: event?.ownerId ?? user.id, reminderMin: Number(v.reminderMin), location: (v.location as string) || undefined, notes: (v.notes as string) || undefined, refs: { personId: (v.personId as string) || undefined, companyId: (v.companyId as string) || undefined, dealId: (v.dealId as string) || undefined } });
    toast('success', event ? 'Evento atualizado' : 'Evento criado', 'Sincronização com Google/Outlook: não conectada.'); onClose();
  };
  const parts = v.participants as string[];
  return (
    <Modal open={open} onClose={onClose} size="lg" title={event ? 'Editar evento' : 'Novo evento'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Título" required error={errors.title} className="full"><Input {...bind('title')} autoFocus /></Field>
        <Field label="Tipo"><Select {...bind('type')} options={Object.entries(EVENT_TYPES).map(([k, x]) => ({ value: k, label: x.label }))} /></Field>
        <Field label="Lembrete"><Select {...bind('reminderMin')} options={[{ value: '0', label: 'Sem lembrete' }, { value: '10', label: '10 min antes' }, { value: '15', label: '15 min antes' }, { value: '30', label: '30 min antes' }, { value: '60', label: '1 hora antes' }, { value: '1440', label: '1 dia antes' }]} /></Field>
        <Field label="Início" required error={errors.start}><Input {...bind('start')} type="datetime-local" /></Field>
        <Field label="Término" error={errors.end}><Input {...bind('end')} type="datetime-local" /></Field>
        <Field label="Empresa"><Select {...bind('companyId')} placeholder="—" options={d.companies.map(c => ({ value: c.id, label: c.tradeName }))} /></Field>
        <Field label="Pessoa"><Select {...bind('personId')} placeholder="—" options={d.people.filter(p => !v.companyId || p.companyId === v.companyId).map(p => ({ value: p.id, label: p.name }))} /></Field>
        <Field label="Oportunidade"><Select {...bind('dealId')} placeholder="—" options={d.deals.filter(x => x.status === 'open' && (!v.companyId || x.companyId === v.companyId)).map(x => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Local / link"><Input {...bind('location')} /></Field>
        <div className="field full"><span className="label">Participantes</span>
          <div className="row wrap" style={{ gap: 6 }}>{d.users.filter(u => u.active).map(u => (
            <label key={u.id} className="tag" style={{ cursor: 'pointer', height: 28 }}><input type="checkbox" checked={parts.includes(u.id)} onChange={e => set('participants', e.target.checked ? [...parts, u.id] : parts.filter(x => x !== u.id))} />{u.name}</label>
          ))}</div>
        </div>
        <Field label="Notas" className="full"><Textarea {...bind('notes')} rows={2} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- Log activity (choose exactly who the interaction was with) ---------- */
export function LogActivityModal({ open, onClose, refs, defaultType = 'call', people: initialPeople }: { open: boolean; onClose: () => void; refs: Refs; defaultType?: ActivityType; people?: string[] }) {
  const L = useLookups(); const d = useTenant();
  const company = refs.companyId ? L.companies.get(refs.companyId) : refs.personId ? L.companies.get(L.people.get(refs.personId)?.companyId ?? '') : undefined;
  const companyPeople = company ? d.people.filter(p => p.companyId === company.id) : [];
  const [type, setType] = useState<ActivityType>(defaultType);
  const [target, setTarget] = useState<'company' | 'person' | 'deal' | 'both' | 'lead'>(refs.leadId ? 'lead' : initialPeople && initialPeople.length > 1 ? 'both' : refs.personId && company ? 'both' : refs.personId ? 'person' : refs.dealId ? 'deal' : 'company');
  const [personIds, setPersonIds] = useState<string[]>(initialPeople ?? (refs.personId ? [refs.personId] : []));
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [err, setErr] = useState('');
  const deal = refs.dealId ? L.deals.get(refs.dealId) : undefined;
  const save = () => {
    if (!title.trim()) { setErr('Descreva a interação.'); return; }
    if ((target === 'person' || target === 'both') && !personIds.length) { setErr('Selecione ao menos uma pessoa.'); return; }
    const base = { type, title: title.trim(), body: body.trim() || undefined };
    if (target === 'lead') logActivity({ ...base, refs: { leadId: refs.leadId } });
    else if (target === 'company') logActivity({ ...base, refs: { companyId: company?.id, dealId: refs.dealId }, meta: { includeCompany: true } });
    else if (target === 'deal') logActivity({ ...base, refs: { dealId: refs.dealId, companyId: deal?.companyId, personId: deal?.personId } });
    else personIds.forEach(pid => logActivity({ ...base, refs: { personId: pid, companyId: target === 'both' ? company?.id : undefined, dealId: refs.dealId }, meta: { includeCompany: target === 'both' } }));
    toast('success', 'Interação registrada', target === 'both' ? 'Aparece na timeline da pessoa e da empresa.' : undefined); onClose();
  };
  const types: { k: ActivityType; l: string }[] = [{ k: 'call', l: 'Ligação' }, { k: 'email', l: 'E-mail' }, { k: 'whatsapp', l: 'WhatsApp' }, { k: 'meeting', l: 'Reunião' }, { k: 'note', l: 'Nota' }];
  return (
    <Modal open={open} onClose={onClose} title="Registrar contato" description="Indique exatamente com quem a interação foi realizada." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Registrar</Button></>}>
      <div className="stack">
        <div className="pill-seg">{types.map(t => <button key={t.k} aria-pressed={type === t.k} onClick={() => setType(t.k)}>{t.l}</button>)}</div>
        {!refs.leadId && <div className="field"><span className="label">A atividade pertence a <span className="req">*</span></span>
          <div className="pill-seg">
            {company && <button aria-pressed={target === 'company'} onClick={() => setTarget('company')}>Empresa</button>}
            <button aria-pressed={target === 'person'} onClick={() => setTarget('person')} disabled={!companyPeople.length && !refs.personId}>Pessoa específica</button>
            {company && <button aria-pressed={target === 'both'} onClick={() => setTarget('both')}>Empresa + pessoa</button>}
            {refs.dealId && <button aria-pressed={target === 'deal'} onClick={() => setTarget('deal')}>Oportunidade</button>}
          </div>
        </div>}
        {(target === 'person' || target === 'both') && (
          <div className="field"><span className="label">Com quem? (pode selecionar várias pessoas)</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {(companyPeople.length ? companyPeople : refs.personId ? [L.people.get(refs.personId)!] : []).map(p => (
                <label key={p.id} className="tag" style={{ height: 30, cursor: 'pointer' }}><input type="checkbox" checked={personIds.includes(p.id)} onChange={e => setPersonIds(e.target.checked ? [...personIds, p.id] : personIds.filter(x => x !== p.id))} />{p.name}{p.jobTitle && <span className="muted xs"> · {p.jobTitle}</span>}</label>
              ))}
            </div>
          </div>
        )}
        <Field label="Resumo" required error={err}><Input value={title} onChange={e => { setTitle(e.target.value); setErr(''); }} autoFocus placeholder="Ex.: Ligação de alinhamento sobre proposta" /></Field>
        <Field label="Detalhes"><Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} /></Field>
        {target === 'both' && <Notice><Link2 size={14} style={{ display: 'none' }} />Será exibido na timeline da pessoa, da empresa{refs.dealId ? ' e da oportunidade' : ''}.</Notice>}
      </div>
    </Modal>
  );
}

/* ---------- Convert lead ---------- */
export function ConvertLeadModal({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: Lead }) {
  const d = useTenant(); const nav = useNavigate();
  type Mode = 'person' | 'company' | 'linked_person' | 'customer' | 'deal' | 'customer_deal';
  const [mode, setMode] = useState<Mode>(lead.kind === 'business' ? 'customer_deal' : 'deal');
  const dupPeople = findDuplicates(d, { email: lead.email, phone: lead.phone, cpf: lead.cpf, name: lead.name }, lead.id).filter(h => h.kind === 'person');
  const dupCompanies = lead.kind === 'business' ? findDuplicates(d, { cnpj: lead.cnpj, legalName: lead.companyName, name: lead.companyName }, lead.id).filter(h => h.kind === 'company') : [];
  const [personId, setPersonId] = useState(lead.personId ?? dupPeople[0]?.id ?? '');
  const [companyId, setCompanyId] = useState(lead.companyId ?? dupCompanies[0]?.id ?? '');
  const pipe = d.pipelines[0];
  const [deal, setDeal] = useState({ name: `${lead.product ?? 'Oportunidade'} — ${lead.companyName ?? lead.name}`, value: lead.value, pipelineId: pipe.id, stageId: pipe.stages[1]?.id ?? pipe.stages[0].id, expectedClose: toInputDate(new Date(Date.now() + 30 * 864e5).toISOString()) });
  const modes: { k: Mode; l: string; s: string }[] = [
    { k: 'person', l: 'Pessoa física', s: 'Cria/atualiza o contato' },
    { k: 'company', l: 'Empresa', s: 'Cria/atualiza a conta' },
    { k: 'linked_person', l: 'Pessoa vinculada', s: 'Pessoa + empresa' },
    { k: 'customer', l: 'Cliente', s: 'Marca como cliente' },
    { k: 'deal', l: 'Oportunidade', s: 'Abre no pipeline' },
    { k: 'customer_deal', l: 'Cliente + oportunidade', s: 'Fluxo completo' },
  ];
  const withDeal = mode === 'deal' || mode === 'customer_deal';
  const submit = () => {
    if (withDeal && (!deal.name.trim() || !(deal.value > 0))) { toast('error', 'Preencha nome e valor da oportunidade.'); return; }
    const out = leadSvc.convert(lead.id, { mode, existingCompanyId: companyId || undefined, existingPersonId: personId || undefined, deal: withDeal ? { ...deal, expectedClose: fromInputDate(deal.expectedClose)! } : undefined });
    toast('success', 'Lead convertido', 'Histórico, notas, tags, origem e responsável preservados.', out.dealId ? { label: 'Ver oportunidade', run: () => nav(`/opportunities/${out.dealId}`) } : out.companyId ? { label: 'Ver empresa', run: () => nav(`/companies/${out.companyId}`) } : out.personId ? { label: 'Ver pessoa', run: () => nav(`/people/${out.personId}`) } : undefined);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title={`Converter lead · ${lead.name}`} description="Nada é duplicado: se a pessoa ou empresa já existir, o lead é vinculado ao registro existente."
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Converter</Button></>}>
      <div className="stack">
        <div className="choice-grid">{modes.map(m => <button key={m.k} className="choice" aria-pressed={mode === m.k} onClick={() => setMode(m.k)}><span className="t">{m.l}</span><span className="s">{m.s}</span></button>)}</div>
        {mode !== 'company' && (
          <Field label="Pessoa" hint={dupPeople.length ? `Encontramos ${dupPeople.length} pessoa(s) compatível(is) (${dupPeople.map(x => x.reason).join('; ')})` : 'Nenhuma pessoa existente encontrada — será criada.'}>
            <Select value={personId} onChange={e => setPersonId(e.target.value)} placeholder="— Criar nova pessoa —" options={d.people.map(p => ({ value: p.id, label: `${p.name}${dupPeople.some(x => x.id === p.id) ? ' ⚠ compatível' : ''}` }))} />
          </Field>
        )}
        {(mode === 'company' || mode === 'linked_person' || lead.kind === 'business') && (
          <Field label="Empresa" hint={dupCompanies.length ? `Empresa existente compatível: ${dupCompanies.map(x => x.label).join(', ')}` : `Será criada: ${lead.companyName ?? lead.name}`}>
            <Select value={companyId} onChange={e => setCompanyId(e.target.value)} placeholder="— Criar nova empresa —" options={d.companies.map(c => ({ value: c.id, label: c.tradeName }))} />
          </Field>
        )}
        {withDeal && (
          <div className="form-grid">
            <div className="form-section">Oportunidade</div>
            <Field label="Nome" required className="full"><Input value={deal.name} onChange={e => setDeal({ ...deal, name: e.target.value })} /></Field>
            <Field label="Valor (R$)" required><Input type="number" value={deal.value} onChange={e => setDeal({ ...deal, value: Number(e.target.value) })} /></Field>
            <Field label="Previsão de fechamento"><Input type="date" value={deal.expectedClose} onChange={e => setDeal({ ...deal, expectedClose: e.target.value })} /></Field>
            <Field label="Pipeline"><Select value={deal.pipelineId} onChange={e => { const p = d.pipelines.find(x => x.id === e.target.value)!; setDeal({ ...deal, pipelineId: p.id, stageId: p.stages[0].id }); }} options={d.pipelines.map(p => ({ value: p.id, label: p.name }))} /></Field>
            <Field label="Etapa inicial"><Select value={deal.stageId} onChange={e => setDeal({ ...deal, stageId: e.target.value })} options={(d.pipelines.find(p => p.id === deal.pipelineId) ?? pipe).stages.filter(s => s.kind === 'open').map(s => ({ value: s.id, label: s.name }))} /></Field>
          </div>
        )}
        <Notice tone="success">Serão preservados: histórico ({d.activities.filter(a => a.refs.leadId === lead.id).length} atividades), notas, tags ({lead.tags.length}), origem ({lead.source}), responsável e data de criação. Valor estimado: {money(lead.value)}.</Notice>
      </div>
    </Modal>
  );
}
