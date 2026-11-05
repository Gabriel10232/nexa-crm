import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Search } from 'lucide-react';
import type { Proposal } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { proposalTotals } from '../../services/crm';
import { PageHeader, UserChip, Money, useLookups } from '../../components/common';
import { Badge, Button, Column, DataTable, Empty, Input, Tabs, SkeletonRows, useLoading } from '../../components/ui';
import { PROPOSAL_STATUS } from '../../config/labels';
import { fmtDate, normalize } from '../../lib/utils';

export default function Proposals() {
  const d = useTenant(); const { can } = useSession(); const nav = useNavigate(); const L = useLookups();
  const loading = useLoading(250);
  const [tab, setTab] = useState<'all' | Proposal['status']>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => d.proposals.filter(p => (tab === 'all' || p.status === tab) && (!q || normalize(`${p.number} ${p.title} ${L.companies.get(p.companyId ?? '')?.tradeName ?? ''}`).includes(normalize(q)))), [d.proposals, tab, q, L]);
  const columns: Column<Proposal>[] = [
    { key: 'n', label: 'Proposta', sort: p => p.number, render: p => <div className="cell-main"><span className="icon-bubble"><FileText /></span><div style={{ minWidth: 0 }}><div className="t ellipsis">{p.number}</div><div className="s ellipsis">{p.title}</div></div></div> },
    { key: 'client', label: 'Cliente', render: p => <span className="small">{L.companies.get(p.companyId ?? '')?.tradeName ?? L.people.get(p.personId ?? '')?.name ?? '—'}</span> },
    { key: 'status', label: 'Status', sort: p => p.status, render: p => <Badge tone={PROPOSAL_STATUS[p.status].tone} dot>{PROPOSAL_STATUS[p.status].label}</Badge> },
    { key: 'total', label: 'Total', align: 'right', sort: p => proposalTotals(p).total, render: p => <strong><Money v={proposalTotals(p).total} /></strong> },
    { key: 'valid', label: 'Validade', sort: p => p.validUntil, render: p => <span className="small" style={{ color: new Date(p.validUntil) < new Date() && !['aceita', 'recusada'].includes(p.status) ? 'var(--danger)' : undefined }}>{fmtDate(p.validUntil)}</span> },
    { key: 'owner', label: 'Responsável', render: p => <UserChip id={p.ownerId} /> },
    { key: 'created', label: 'Criada', sort: p => p.createdAt, render: p => <span className="small muted">{fmtDate(p.createdAt)}</span> },
  ];
  const count = (s: Proposal['status']) => d.proposals.filter(p => p.status === s).length;
  return (
    <div>
      <PageHeader title="Propostas comerciais" desc="Templates, itens, descontos, impostos e acompanhamento de status." crumbs={[{ label: 'Início', to: '/' }, { label: 'Propostas' }]}
        actions={can('create') && <Button variant="primary" onClick={() => nav('/proposals/new')}><Plus />Nova proposta</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Todas', count: d.proposals.length }, ...(Object.keys(PROPOSAL_STATUS) as Proposal['status'][]).map(s => ({ value: s, label: PROPOSAL_STATUS[s].label, count: count(s) }))]} />
      <div className="toolbar"><div className="input-icon"><Search /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por número, título ou cliente…" aria-label="Buscar propostas" /></div></div>
      <div className="card" style={{ padding: 6 }}>
        {loading ? <SkeletonRows /> : <DataTable rows={rows} columns={columns} onRowClick={p => nav(`/proposals/${p.id}`)} initialSort={{ key: 'created', dir: 'desc' }}
          empty={<Empty icon={<FileText size={22} />} title="Nenhuma proposta" text="Crie propostas a partir de uma oportunidade ou do zero." action={can('create') && <Button variant="primary" onClick={() => nav('/proposals/new')}><Plus />Nova proposta</Button>} />} />}
      </div>
    </div>
  );
}
