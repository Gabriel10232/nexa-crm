import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Handshake, Columns3, Archive, UserCheck, ChevronDown } from 'lucide-react';
import type { Deal } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { scoped } from '../../services/metrics';
import { deals as dealSvc } from '../../services/crm';
import { PageHeader, UserChip, Money, useLookups } from '../../components/common';
import { RecordList, FilterDef } from '../../components/RecordList';
import { Badge, Button, Column, Empty, Menu, Tabs } from '../../components/ui';
import { DealForm } from '../../components/forms';
import { confirm, toast } from '../../store/ui';
import { daysBetween, fmtDate } from '../../lib/utils';

export default function Opportunities() {
  const d = useTenant(); const { user, can } = useSession(); const nav = useNavigate(); const L = useLookups();
  const [tab, setTab] = useState<'open' | 'won' | 'lost' | 'all'>('open');
  const [form, setForm] = useState(false);
  const base = useMemo(() => scoped(d, user, d.deals).filter(x => !x.archivedAt), [d, user]);
  const rows = base.filter(x => tab === 'all' || x.status === tab);
  const columns: Column<Deal>[] = [
    { key: 'name', label: 'Oportunidade', hideable: false, sort: x => x.name, render: x => <div className="cell-main"><span className="icon-bubble"><Handshake /></span><div style={{ minWidth: 0 }}><div className="t ellipsis">{x.name}</div><div className="s ellipsis">{L.companies.get(x.companyId ?? '')?.tradeName ?? L.people.get(x.personId ?? '')?.name ?? '—'}</div></div></div> },
    { key: 'stage', label: 'Etapa', sort: x => L.stages.get(x.stageId)?.probability, render: x => <Badge tone={x.status === 'won' ? 'success' : x.status === 'lost' ? 'danger' : 'neutral'}><span className="dot" style={{ background: L.stages.get(x.stageId)?.color }} />{L.stages.get(x.stageId)?.name}</Badge> },
    { key: 'value', label: 'Valor', align: 'right', sort: x => x.value, render: x => <strong><Money v={x.value} /></strong> },
    { key: 'prob', label: 'Prob.', sort: x => x.probability, render: x => <span className="num">{x.probability}%</span> },
    { key: 'product', label: 'Produto', sort: x => x.product, render: x => <span className="small">{x.product}</span> },
    { key: 'close', label: 'Fechamento', sort: x => x.closedAt ?? x.expectedClose, render: x => <span className="small" style={{ color: x.status === 'open' && new Date(x.expectedClose) < new Date() ? 'var(--danger)' : undefined }}>{fmtDate(x.closedAt ?? x.expectedClose)}</span> },
    { key: 'stale', label: 'Dias na etapa', sort: x => daysBetween(x.stageEnteredAt), render: x => x.status === 'open' ? <span style={{ color: daysBetween(x.stageEnteredAt) >= 14 ? 'var(--warning)' : undefined }}>{daysBetween(x.stageEnteredAt)}</span> : '—' },
    { key: 'owner', label: 'Responsável', sort: x => L.users.get(x.ownerId)?.name, render: x => <UserChip id={x.ownerId} /> },
    { key: 'source', label: 'Origem', sort: x => x.source, render: x => <span className="small">{x.source}</span> },
    { key: 'lost', label: 'Motivo da perda', render: x => <span className="small">{x.lostReason ?? '—'}</span> },
    { key: 'pipeline', label: 'Pipeline', render: x => <span className="small">{d.pipelines.find(p => p.id === x.pipelineId)?.name}</span> },
  ];
  const filters: FilterDef<Deal>[] = [
    { key: 'pipelineId', label: 'Pipeline', kind: 'select', options: d.pipelines.map(p => ({ value: p.id, label: p.name })), get: x => x.pipelineId },
    { key: 'stageId', label: 'Etapa', kind: 'select', options: d.pipelines.flatMap(p => p.stages.map(s => ({ value: s.id, label: `${p.name} · ${s.name}` }))), get: x => x.stageId },
    { key: 'ownerId', label: 'Responsável', kind: 'select', options: d.users.map(u => ({ value: u.id, label: u.name })), get: x => x.ownerId },
    { key: 'source', label: 'Origem', kind: 'select', options: d.org.sources.map(s => ({ value: s, label: s })), get: x => x.source },
    { key: 'product', label: 'Produto', kind: 'select', options: d.org.products.map(s => ({ value: s, label: s })), get: x => x.product },
    { key: 'priority', label: 'Prioridade', kind: 'select', options: [{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Média' }, { value: 'baixa', label: 'Baixa' }], get: x => x.priority },
    { key: 'companyId', label: 'Empresa', kind: 'select', options: d.companies.map(c => ({ value: c.id, label: c.tradeName })), get: x => x.companyId },
    { key: 'lostReason', label: 'Motivo da perda', kind: 'select', options: d.org.lostReasons.map(r => ({ value: r, label: r })), get: x => x.lostReason },
    { key: 'min', label: 'Valor mínimo', kind: 'min', get: x => x.value },
    { key: 'max', label: 'Valor máximo', kind: 'max', get: x => x.value },
    { key: 'closeFrom', label: 'Fechamento a partir de', kind: 'dateFrom', get: x => x.closedAt ?? x.expectedClose },
    { key: 'closeTo', label: 'Fechamento até', kind: 'dateTo', get: x => x.closedAt ?? x.expectedClose },
    { key: 'stale', label: 'Parada há (dias)', kind: 'daysSince', get: x => x.stageEnteredAt },
  ];
  const sum = rows.reduce((a, x) => a + x.value, 0);
  return (
    <div>
      <PageHeader title="Oportunidades" desc={<>Total na visão: <strong style={{ color: 'var(--text)' }}><Money v={sum} /></strong> em {rows.length} oportunidade(s).</>} crumbs={[{ label: 'Início', to: '/' }, { label: 'Oportunidades' }]}
        actions={<><Button onClick={() => nav('/pipeline')}><Columns3 />Ver pipeline</Button>{can('create') && <Button variant="primary" onClick={() => setForm(true)}><Plus />Nova oportunidade</Button>}</>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Abertas', count: base.filter(x => x.status === 'open').length }, { value: 'won', label: 'Ganhas', count: base.filter(x => x.status === 'won').length }, { value: 'lost', label: 'Perdidas', count: base.filter(x => x.status === 'lost').length }, { value: 'all', label: 'Todas', count: base.length }]} />
      <RecordList entity="deals" rows={rows} columns={columns} filters={filters} defaultCols={['name', 'stage', 'value', 'prob', 'close', 'stale', 'owner']}
        search={x => [x.name, x.product, x.source, L.companies.get(x.companyId ?? '')?.tradeName, L.people.get(x.personId ?? '')?.name, x.notes, x.lostReason]}
        onOpen={x => nav(`/opportunities/${x.id}`)}
        bulk={(ids, clear) => can('edit') ? <>
          <Menu trigger={p => <Button size="xs" {...p}><UserCheck />Responsável<ChevronDown /></Button>}>{d.users.filter(u => u.active).map(u => <button key={u.id} onClick={() => { ids.forEach(id => dealSvc.update(id, { ownerId: u.id })); toast('success', `Atribuído a ${u.name}`); clear(); }}>{u.name}</button>)}</Menu>
          <Button size="xs" variant="danger" onClick={async () => { if (await confirm({ title: `Arquivar ${ids.length} oportunidade(s)?`, body: 'Saem do pipeline e relatórios, mas podem ser restauradas em Arquivados.', danger: true, confirmLabel: 'Arquivar' })) { ids.forEach(id => dealSvc.archive(id)); toast('success', 'Arquivadas'); clear(); } }}><Archive />Arquivar</Button>
        </> : null}
        exportRow={x => ({ oportunidade: x.name, empresa: L.companies.get(x.companyId ?? '')?.tradeName ?? '', contato: L.people.get(x.personId ?? '')?.name ?? '', etapa: L.stages.get(x.stageId)?.name, status: x.status, valor: can('financial') ? x.value : '', probabilidade: x.probability, previsao: x.expectedClose, fechamento: x.closedAt ?? '', responsavel: L.users.get(x.ownerId)?.name, origem: x.source, motivo_perda: x.lostReason ?? '' })}
        card={x => <>
          <div className="strong">{x.name}</div>
          <div className="xs muted">{L.companies.get(x.companyId ?? '')?.tradeName ?? L.people.get(x.personId ?? '')?.name}</div>
          <div className="row between"><Badge><span className="dot" style={{ background: L.stages.get(x.stageId)?.color }} />{L.stages.get(x.stageId)?.name}</Badge><strong><Money v={x.value} compact /></strong></div>
          <div className="row between xs muted"><UserChip id={x.ownerId} /><span>{x.probability}%</span></div>
        </>}
        empty={<div className="card"><Empty icon={<Handshake size={22} />} title="Nenhuma oportunidade" text="Converta leads ou crie oportunidades diretamente." action={can('create') && <Button variant="primary" onClick={() => setForm(true)}><Plus />Nova oportunidade</Button>} /></div>} />
      {form && <DealForm open onClose={() => setForm(false)} />}
    </div>
  );
}
