import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Archive, Tag } from 'lucide-react';
import type { Company } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { scoped } from '../../services/metrics';
import { companies as companySvc } from '../../services/crm';
import { PageHeader, UserChip, Money, useLookups } from '../../components/common';
import { RecordList, FilterDef } from '../../components/RecordList';
import { Avatar, Badge, Button, Column, Empty, Tabs, TagChip } from '../../components/ui';
import { CompanyForm } from '../../components/forms';
import { LIFECYCLE, SEGMENTS, UF } from '../../config/labels';
import { confirm, prompt, toast } from '../../store/ui';
import { fmtDate, num } from '../../lib/utils';

export default function Companies() {
  const d = useTenant(); const { user, can } = useSession(); const nav = useNavigate(); const L = useLookups();
  const [tab, setTab] = useState<'all' | 'cliente' | 'prospect' | 'parceiro' | 'fornecedor'>('all');
  const [form, setForm] = useState(false);
  const base = useMemo(() => scoped(d, user, d.companies).filter(c => !c.archivedAt), [d, user]);
  const peopleCount = useMemo(() => { const m = new Map<string, number>(); d.people.forEach(p => p.companyId && m.set(p.companyId, (m.get(p.companyId) ?? 0) + 1)); return m; }, [d.people]);
  const pipeline = useMemo(() => { const m = new Map<string, number>(); d.deals.filter(x => x.status === 'open').forEach(x => x.companyId && m.set(x.companyId, (m.get(x.companyId) ?? 0) + x.value)); return m; }, [d.deals]);
  const rows = base.filter(c => tab === 'all' || c.category === tab);
  const columns: Column<Company>[] = [
    { key: 'name', label: 'Empresa', hideable: false, sort: c => c.tradeName, render: c => <div className="cell-main"><Avatar name={c.tradeName} square /><div style={{ minWidth: 0 }}><div className="t ellipsis">{c.tradeName}</div><div className="s ellipsis">{c.legalName}</div></div></div> },
    { key: 'segment', label: 'Segmento', sort: c => c.segment, render: c => <span className="small">{c.segment}</span> },
    { key: 'category', label: 'Categoria', sort: c => c.category, render: c => <Badge tone={LIFECYCLE[c.category].tone}>{LIFECYCLE[c.category].label}</Badge> },
    { key: 'size', label: 'Porte', sort: c => ['MEI', 'Micro', 'Pequena', 'Média', 'Grande'].indexOf(c.size), render: c => <span className="small">{c.size}</span> },
    { key: 'people', label: 'Pessoas', align: 'right', sort: c => peopleCount.get(c.id) ?? 0, render: c => <span className="num">{peopleCount.get(c.id) ?? 0}</span> },
    { key: 'pipeline', label: 'Em negociação', align: 'right', sort: c => pipeline.get(c.id) ?? 0, render: c => <Money v={pipeline.get(c.id) ?? 0} compact /> },
    { key: 'owner', label: 'Responsável', sort: c => L.users.get(c.ownerId)?.name, render: c => <UserChip id={c.ownerId} /> },
    { key: 'city', label: 'Cidade', sort: c => c.city, render: c => <span className="small">{c.city ? `${c.city}/${c.state}` : '—'}</span> },
    { key: 'cnpj', label: 'CNPJ', render: c => <span className="small num">{c.cnpj ?? '—'}</span> },
    { key: 'employees', label: 'Funcionários', sort: c => c.employees, render: c => <span className="small num">{c.employees ? num(c.employees) : '—'}</span> },
    { key: 'tags', label: 'Tags', render: c => <div className="tags">{c.tags.slice(0, 2).map(t => <TagChip key={t} name={t} color={L.tagColor(t)} />)}</div> },
    { key: 'created', label: 'Criada em', sort: c => c.createdAt, render: c => <span className="small muted">{fmtDate(c.createdAt)}</span> },
  ];
  const filters: FilterDef<Company>[] = [
    { key: 'segment', label: 'Segmento', kind: 'select', options: SEGMENTS.map(s => ({ value: s, label: s })), get: c => c.segment },
    { key: 'category', label: 'Categoria', kind: 'select', options: Object.entries(LIFECYCLE).map(([k, x]) => ({ value: k, label: x.label })), get: c => c.category },
    { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'ativo', label: 'Ativo' }, { value: 'em_negociacao', label: 'Em negociação' }, { value: 'inativo', label: 'Inativo' }], get: c => c.status },
    { key: 'size', label: 'Porte', kind: 'select', options: ['MEI', 'Micro', 'Pequena', 'Média', 'Grande'].map(s => ({ value: s, label: s })), get: c => c.size },
    { key: 'ownerId', label: 'Responsável', kind: 'select', options: d.users.map(u => ({ value: u.id, label: u.name })), get: c => c.ownerId },
    { key: 'source', label: 'Origem', kind: 'select', options: d.org.sources.map(s => ({ value: s, label: s })), get: c => c.source },
    { key: 'state', label: 'Estado', kind: 'select', options: UF.map(u => ({ value: u, label: u })), get: c => c.state },
    { key: 'tag', label: 'Tag', kind: 'tag', options: d.tags.map(t => ({ value: t.name, label: t.name })), get: c => c.tags },
    { key: 'minRevenue', label: 'Faturamento mínimo', kind: 'min', get: c => c.revenue },
    { key: 'createdFrom', label: 'Criada a partir de', kind: 'dateFrom', get: c => c.createdAt },
  ];
  return (
    <div>
      <PageHeader title="Empresas" desc="Contas com dados cadastrais, pessoas vinculadas, oportunidades e timeline completa." crumbs={[{ label: 'Início', to: '/' }, { label: 'Empresas' }]}
        actions={can('create') && <Button variant="primary" onClick={() => setForm(true)}><Plus />Nova empresa</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Todas', count: base.length }, ...(['cliente', 'prospect', 'parceiro', 'fornecedor'] as const).map(k => ({ value: k, label: LIFECYCLE[k].label + 's', count: base.filter(c => c.category === k).length }))]} />
      <RecordList entity="companies" rows={rows} columns={columns} filters={filters} defaultCols={['name', 'segment', 'category', 'people', 'pipeline', 'owner', 'city']}
        search={c => [c.tradeName, c.legalName, c.cnpj, c.segment, c.city, c.state, c.email, c.website, ...c.tags]}
        onOpen={c => nav(`/companies/${c.id}`)}
        bulk={(ids, clear) => can('edit') ? <>
          <Button size="xs" onClick={async () => { const t = await prompt({ title: 'Adicionar tag', label: 'Tag', options: d.tags.map(x => x.name), required: true }); if (t) { ids.forEach(id => { const c = d.companies.find(x => x.id === id)!; if (!c.tags.includes(t)) companySvc.update(id, { tags: [...c.tags, t] }); }); toast('success', 'Tag adicionada'); clear(); } }}><Tag />Tag</Button>
          <Button size="xs" variant="danger" onClick={async () => { if (await confirm({ title: `Arquivar ${ids.length} empresa(s)?`, body: 'Pessoas vinculadas e histórico são mantidos. Restaure em Arquivados.', danger: true, confirmLabel: 'Arquivar' })) { ids.forEach(id => companySvc.archive(id)); toast('success', 'Empresas arquivadas'); clear(); } }}><Archive />Arquivar</Button>
        </> : null}
        exportRow={c => ({ nome_fantasia: c.tradeName, razao_social: c.legalName, cnpj: c.cnpj, segmento: c.segment, porte: c.size, categoria: LIFECYCLE[c.category].label, cidade: c.city, uf: c.state, site: c.website, email: c.email, telefone: c.phone, responsavel: L.users.get(c.ownerId)?.name, pessoas: peopleCount.get(c.id) ?? 0 })}
        card={c => <>
          <div className="row"><Avatar name={c.tradeName} square /><div style={{ minWidth: 0 }}><div className="strong ellipsis">{c.tradeName}</div><div className="xs muted ellipsis">{c.segment} · {c.size}</div></div></div>
          <div className="row wrap" style={{ gap: 6 }}><Badge tone={LIFECYCLE[c.category].tone}>{LIFECYCLE[c.category].label}</Badge><Badge>{peopleCount.get(c.id) ?? 0} pessoas</Badge></div>
          <div className="row between small"><span className="muted">{c.city}/{c.state}</span><strong><Money v={pipeline.get(c.id) ?? 0} compact /></strong></div>
          <UserChip id={c.ownerId} />
        </>}
        empty={<div className="card"><Empty icon={<Building2 size={22} />} title="Nenhuma empresa" text="Cadastre empresas para relacionar pessoas e oportunidades." action={can('create') && <Button variant="primary" onClick={() => setForm(true)}><Plus />Nova empresa</Button>} /></div>} />
      {form && <CompanyForm open onClose={() => setForm(false)} />}
    </div>
  );
}
