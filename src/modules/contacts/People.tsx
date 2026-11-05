import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Contact, Tag, UserCheck, Archive, ChevronDown } from 'lucide-react';
import type { Person } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { scoped } from '../../services/metrics';
import { people as peopleSvc } from '../../services/crm';
import { PageHeader, UserChip, useLookups } from '../../components/common';
import { RecordList, FilterDef } from '../../components/RecordList';
import { Avatar, Badge, Button, Column, Empty, Menu, Tabs, TagChip } from '../../components/ui';
import { PersonForm } from '../../components/forms';
import { CONTACT_TYPES, LIFECYCLE, UF } from '../../config/labels';
import { confirm, prompt, toast } from '../../store/ui';
import { fmtDate, relTime } from '../../lib/utils';

export default function People() {
  const d = useTenant(); const { user, can } = useSession(); const nav = useNavigate(); const L = useLookups();
  const [tab, setTab] = useState<'all' | 'individual' | 'linked' | 'cliente' | 'parceiro' | 'fornecedor'>('all');
  const [form, setForm] = useState<null | 'person' | 'linked'>(null);
  const base = useMemo(() => scoped(d, user, d.people).filter(p => !p.archivedAt), [d, user]);
  const lastAct = useMemo(() => { const m = new Map<string, string>(); d.activities.forEach(a => { if (a.refs.personId && (!m.has(a.refs.personId) || m.get(a.refs.personId)! < a.at)) m.set(a.refs.personId, a.at); }); return m; }, [d.activities]);
  const rows = base.filter(p => tab === 'all' ? true : tab === 'individual' ? !p.companyId : tab === 'linked' ? !!p.companyId : p.lifecycle === tab);
  const c = (fn: (p: Person) => boolean) => base.filter(fn).length;

  const columns: Column<Person>[] = [
    { key: 'name', label: 'Nome', hideable: false, sort: p => p.name, render: p => <div className="cell-main"><Avatar name={p.name} /><div style={{ minWidth: 0 }}><div className="t ellipsis">{p.name}</div><div className="s ellipsis">{p.jobTitle ?? (p.companyId ? 'Contato' : 'Pessoa física')}</div></div></div> },
    { key: 'company', label: 'Empresa', sort: p => L.companies.get(p.companyId ?? '')?.tradeName ?? '', render: p => p.companyId ? <span className="small">{L.companies.get(p.companyId)?.tradeName}</span> : <Badge>Pessoa física</Badge> },
    { key: 'lifecycle', label: 'Categoria', sort: p => p.lifecycle, render: p => <Badge tone={LIFECYCLE[p.lifecycle].tone}>{LIFECYCLE[p.lifecycle].label}</Badge> },
    { key: 'type', label: 'Tipo de contato', sort: p => p.contactType, render: p => <span className="small">{p.contactType ? CONTACT_TYPES[p.contactType] : '—'}</span> },
    { key: 'email', label: 'E-mail', sort: p => p.email, render: p => <span className="small ellipsis">{p.email ?? '—'}</span> },
    { key: 'phone', label: 'Telefone', render: p => <span className="small">{p.phone ?? '—'}</span> },
    { key: 'owner', label: 'Responsável', sort: p => L.users.get(p.ownerId)?.name, render: p => <UserChip id={p.ownerId} /> },
    { key: 'last', label: 'Último contato', sort: p => lastAct.get(p.id) ?? '', render: p => <span className="small">{relTime(lastAct.get(p.id))}</span> },
    { key: 'city', label: 'Cidade', sort: p => p.city, render: p => <span className="small">{p.city ? `${p.city}/${p.state}` : '—'}</span> },
    { key: 'tags', label: 'Tags', render: p => <div className="tags">{p.tags.slice(0, 2).map(t => <TagChip key={t} name={t} color={L.tagColor(t)} />)}</div> },
    { key: 'created', label: 'Criado em', sort: p => p.createdAt, render: p => <span className="small muted">{fmtDate(p.createdAt)}</span> },
  ];
  const filters: FilterDef<Person>[] = [
    { key: 'kind', label: 'Pessoa física ou vinculada', kind: 'select', options: [{ value: 'no', label: 'Pessoa física' }, { value: 'yes', label: 'Vinculada a empresa' }], get: p => (p.companyId ? 'yes' : 'no') },
    { key: 'companyId', label: 'Empresa vinculada', kind: 'select', options: d.companies.map(c => ({ value: c.id, label: c.tradeName })), get: p => p.companyId },
    { key: 'lifecycle', label: 'Categoria', kind: 'select', options: Object.entries(LIFECYCLE).map(([k, x]) => ({ value: k, label: x.label })), get: p => p.lifecycle },
    { key: 'ownerId', label: 'Responsável', kind: 'select', options: d.users.map(u => ({ value: u.id, label: u.name })), get: p => p.ownerId },
    { key: 'source', label: 'Origem', kind: 'select', options: d.org.sources.map(s => ({ value: s, label: s })), get: p => p.source },
    { key: 'tag', label: 'Tag', kind: 'tag', options: d.tags.map(t => ({ value: t.name, label: t.name })), get: p => p.tags },
    { key: 'jobTitle', label: 'Cargo', kind: 'select', options: Array.from(new Set(d.people.map(p => p.jobTitle).filter(Boolean))).map(x => ({ value: x!, label: x! })), get: p => p.jobTitle },
    { key: 'state', label: 'Estado', kind: 'select', options: UF.map(u => ({ value: u, label: u })), get: p => p.state },
    { key: 'segment', label: 'Segmento da empresa', kind: 'select', options: Array.from(new Set(d.companies.map(c => c.segment))).map(s => ({ value: s, label: s })), get: p => L.companies.get(p.companyId ?? '')?.segment },
    { key: 'createdFrom', label: 'Criado a partir de', kind: 'dateFrom', get: p => p.createdAt },
    { key: 'nextTo', label: 'Próximo contato até', kind: 'dateTo', get: p => p.nextContactAt },
    { key: 'noContact', label: 'Sem contato há (dias)', kind: 'daysSince', get: p => lastAct.get(p.id) ?? p.createdAt },
  ];
  const bulk = (ids: string[], clear: () => void) => can('edit') ? <>
    <Button size="xs" onClick={async () => { const t = await prompt({ title: 'Adicionar tag', label: 'Tag', options: d.tags.map(x => x.name), required: true }); if (t) { ids.forEach(id => { const p = d.people.find(x => x.id === id)!; if (!p.tags.includes(t)) peopleSvc.update(id, { tags: [...p.tags, t] }); }); toast('success', 'Tag adicionada'); clear(); } }}><Tag />Tag</Button>
    <Menu trigger={p => <Button size="xs" {...p}><UserCheck />Responsável<ChevronDown /></Button>}>{d.users.filter(u => u.active).map(u => <button key={u.id} onClick={() => { ids.forEach(id => peopleSvc.update(id, { ownerId: u.id })); toast('success', `Atribuído a ${u.name}`); clear(); }}>{u.name}</button>)}</Menu>
    <Button size="xs" variant="danger" onClick={async () => { if (await confirm({ title: `Arquivar ${ids.length} pessoa(s)?`, body: 'Ficarão disponíveis em Arquivados para restauração. O histórico é mantido.', danger: true, confirmLabel: 'Arquivar' })) { ids.forEach(id => peopleSvc.archive(id)); toast('success', 'Arquivado(s)'); clear(); } }}><Archive />Arquivar</Button>
  </> : null;

  return (
    <div>
      <PageHeader title="Contatos" desc="Pessoas físicas independentes e pessoas vinculadas a empresas, com timeline individual." crumbs={[{ label: 'Início', to: '/' }, { label: 'Contatos' }]}
        actions={can('create') && <Menu trigger={p => <Button variant="primary" {...p}><Plus />Nova pessoa<ChevronDown /></Button>}>
          <button onClick={() => setForm('person')}>Pessoa física (independente)</button>
          <button onClick={() => setForm('linked')}>Pessoa vinculada a uma empresa</button>
        </Menu>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'all', label: 'Todas', count: base.length }, { value: 'individual', label: 'Pessoas físicas', count: c(p => !p.companyId) }, { value: 'linked', label: 'Vinculadas', count: c(p => !!p.companyId) },
        { value: 'cliente', label: 'Clientes', count: c(p => p.lifecycle === 'cliente') }, { value: 'parceiro', label: 'Parceiros', count: c(p => p.lifecycle === 'parceiro') }, { value: 'fornecedor', label: 'Fornecedores', count: c(p => p.lifecycle === 'fornecedor') },
      ]} />
      <RecordList entity="people" rows={rows} columns={columns} filters={filters} defaultCols={['name', 'company', 'lifecycle', 'type', 'email', 'owner', 'last']}
        search={p => [p.name, p.email, p.personalEmail, p.phone, p.whatsapp, p.cpf, p.jobTitle, p.department, p.city, L.companies.get(p.companyId ?? '')?.tradeName, ...p.tags]}
        onOpen={p => nav(`/people/${p.id}`)} bulk={bulk}
        exportRow={p => ({ nome: p.name, empresa: L.companies.get(p.companyId ?? '')?.tradeName ?? '', cargo: p.jobTitle, email: p.email, telefone: p.phone, whatsapp: p.whatsapp, categoria: LIFECYCLE[p.lifecycle].label, cidade: p.city, uf: p.state, responsavel: L.users.get(p.ownerId)?.name, tags: p.tags.join('|') })}
        card={p => <>
          <div className="row"><Avatar name={p.name} /><div style={{ minWidth: 0 }}><div className="strong ellipsis">{p.name}</div><div className="xs muted ellipsis">{p.jobTitle ?? ''}{p.companyId ? ` · ${L.companies.get(p.companyId)?.tradeName}` : 'Pessoa física'}</div></div></div>
          <div className="row wrap" style={{ gap: 6 }}><Badge tone={LIFECYCLE[p.lifecycle].tone}>{LIFECYCLE[p.lifecycle].label}</Badge>{p.decisionMaker && <Badge tone="accent">Decisor</Badge>}</div>
          <div className="xs muted ellipsis">{p.email ?? p.phone}</div>
          <div className="row between xs muted"><UserChip id={p.ownerId} /><span>{relTime(lastAct.get(p.id))}</span></div>
        </>}
        empty={<div className="card"><Empty icon={<Contact size={22} />} title="Nenhum contato" text="Cadastre pessoas físicas ou pessoas vinculadas a empresas." action={can('create') && <Button variant="primary" onClick={() => setForm('person')}><Plus />Nova pessoa</Button>} /></div>} />
      {form && <PersonForm open onClose={() => setForm(null)} linked={form === 'linked'} />}
    </div>
  );
}
