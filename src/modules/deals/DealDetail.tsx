import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Archive, ArchiveRestore, Trash2, MoreHorizontal, Trophy, XCircle, FileText, Building2, User, AlertTriangle, RotateCcw } from 'lucide-react';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { deals as dealSvc, proposalTotals } from '../../services/crm';
import { PageHeader, Timeline, timelineFor, UserChip, Money, useLookups } from '../../components/common';
import { QuickActions, TasksPanel, ChangeLog, NotesPanel, FilesPanel, addDealFile } from '../../components/detail';
import { Badge, Button, Empty, Menu, Tabs, Progress, Notice } from '../../components/ui';
import { DealForm } from '../../components/forms';
import { PROPOSAL_STATUS } from '../../config/labels';
import { moveDeal } from './dealActions';
import { confirm, toast } from '../../store/ui';
import { daysBetween, fmtDate } from '../../lib/utils';

export default function DealDetail() {
  const { id } = useParams(); const d = useTenant(); const nav = useNavigate(); const { can } = useSession(); const L = useLookups();
  const x = d.deals.find(y => y.id === id);
  const [tab, setTab] = useState<'timeline' | 'tasks' | 'proposals' | 'files' | 'notes' | 'changes'>('timeline');
  const [edit, setEdit] = useState(false);
  if (!x) return <div className="card"><Empty title="Oportunidade não encontrada" action={<Button onClick={() => nav('/opportunities')}>Voltar</Button>} /></div>;
  const pipe = d.pipelines.find(p => p.id === x.pipelineId)!;
  const st = pipe.stages.find(s => s.id === x.stageId);
  const co = L.companies.get(x.companyId ?? ''); const p = L.people.get(x.personId ?? '');
  const refs = { dealId: x.id, companyId: x.companyId, personId: x.personId };
  const tl = timelineFor(d, { dealId: x.id });
  const props = d.proposals.filter(y => y.dealId === x.id);
  const days = daysBetween(x.stageEnteredAt);
  const open = pipe.stages.filter(s => s.kind === 'open');
  const ro = !can('edit');

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Oportunidades', to: '/opportunities' }, { label: x.name }]} title={x.name}
        actions={<>
          {x.status === 'open' && !ro && <>
            <Button variant="primary" onClick={() => moveDeal(d, x, pipe.stages.find(s => s.kind === 'won')!.id)}><Trophy />Ganhar</Button>
            <Button variant="danger" onClick={() => moveDeal(d, x, pipe.stages.find(s => s.kind === 'lost')!.id)}><XCircle />Perder</Button>
          </>}
          {x.status !== 'open' && !ro && <Button onClick={() => moveDeal(d, x, open[open.length - 1].id)}><RotateCcw />Reabrir</Button>}
          {!ro && <Button onClick={() => setEdit(true)}><Pencil />Editar</Button>}
          <Menu trigger={t => <Button {...t} icon aria-label="Mais ações"><MoreHorizontal /></Button>}>
            <button onClick={() => nav(`/proposals/new?deal=${x.id}`)} disabled={!can('create')}><FileText />Criar proposta</button>
            {x.archivedAt ? <button onClick={() => dealSvc.archive(x.id, false)}><ArchiveRestore />Restaurar</button> : <button disabled={ro} onClick={async () => { if (await confirm({ title: `Arquivar "${x.name}"?`, body: 'Sai do pipeline; pode ser restaurada em Arquivados.', danger: true, confirmLabel: 'Arquivar' })) { dealSvc.archive(x.id); toast('success', 'Arquivada'); nav('/pipeline'); } }}><Archive />Arquivar</button>}
            <button className="danger" onClick={async () => { if (!can('hardDelete')) { toast('error', 'Sem permissão para exclusão definitiva'); return; } if (await confirm({ title: 'Excluir oportunidade definitivamente?', typeToConfirm: x.name, danger: true, confirmLabel: 'Excluir' })) { dealSvc.hardDelete(x.id); nav('/opportunities'); } }}><Trash2 />Excluir definitivamente</button>
          </Menu>
        </>}>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <Badge tone={x.status === 'won' ? 'success' : x.status === 'lost' ? 'danger' : 'accent'}>{x.status === 'won' ? 'Ganha' : x.status === 'lost' ? 'Perdida' : 'Aberta'}</Badge>
          <Badge><span className="dot" style={{ background: st?.color }} />{pipe.name} · {st?.name}</Badge>
          <Badge tone={x.priority === 'alta' ? 'danger' : 'neutral'}>Prioridade {({ alta: 'alta', media: 'média', baixa: 'baixa' })[x.priority]}</Badge>
          {x.archivedAt && <Badge tone="warning">Arquivada</Badge>}
        </div>
      </PageHeader>

      <div className="stack">
        {x.status === 'open' && days >= 14 && <Notice tone="warning" icon={<AlertTriangle />}>Oportunidade parada há <strong>{days} dias</strong> nesta etapa. Sugestão: agende um follow-up ou peça ao Copilot o próximo passo.</Notice>}
        {x.status === 'lost' && <Notice tone="danger">Perdida em {fmtDate(x.closedAt)} — motivo: <strong>{x.lostReason ?? 'não informado'}</strong></Notice>}
        {x.status === 'open' && (
          <div className="card" style={{ padding: 12 }}>
            <div className="pill-seg" style={{ width: '100%', display: 'flex' }} role="group" aria-label="Etapas">
              {open.map(s => <button key={s.id} style={{ flex: 1 }} aria-pressed={s.id === x.stageId} disabled={ro} onClick={() => moveDeal(d, x, s.id)}>{s.name}</button>)}
            </div>
          </div>
        )}
        <QuickActions refs={refs} phone={p?.phone ?? co?.phone} whatsapp={p?.whatsapp ?? co?.whatsapp} email={p?.email ?? co?.email} onDeal={() => toast('info', 'Você já está em uma oportunidade')} />
        <div className="split">
          <div className="card">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: 'timeline', label: 'Timeline', count: tl.length }, { value: 'tasks', label: 'Tarefas' }, { value: 'proposals', label: 'Propostas', count: props.length }, { value: 'files', label: 'Arquivos', count: x.files.length }, { value: 'notes', label: 'Notas' }, { value: 'changes', label: 'Alterações' }]} />
            {tab === 'timeline' && <Timeline items={tl} />}
            {tab === 'tasks' && <TasksPanel refs={refs} match={t => t.refs.dealId === x.id} />}
            {tab === 'proposals' && <div className="stack-sm">
              <Button size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => nav(`/proposals/new?deal=${x.id}`)} disabled={!can('create')}><FileText />Nova proposta</Button>
              {props.length ? <div className="list">{props.map(y => <Link key={y.id} to={`/proposals/${y.id}`} className="list-item click"><span className="flex1 small"><strong>{y.number}</strong> · {y.title}</span><Badge tone={PROPOSAL_STATUS[y.status].tone}>{PROPOSAL_STATUS[y.status].label}</Badge><strong className="small"><Money v={proposalTotals(y).total} /></strong></Link>)}</div> : <Empty compact title="Sem propostas" />}
            </div>}
            {tab === 'files' && <FilesPanel files={x.files} onAdd={ro ? undefined : f => addDealFile(x.id, f)} />}
            {tab === 'notes' && <NotesPanel refs={refs} match={a => a.refs.dealId === x.id} />}
            {tab === 'changes' && <ChangeLog entityId={x.id} />}
          </div>
          <div className="stack">
            <div className="card stack-sm">
              <span className="label">Valor</span><span style={{ fontSize: 'var(--fs-num)', fontWeight: 800 }}><Money v={x.value} /></span>
              <div className="row between small"><span>Probabilidade</span><strong>{x.probability}%</strong></div><Progress value={x.probability} />
              <div className="row between small"><span className="muted">Valor ponderado</span><strong><Money v={x.value * x.probability / 100} /></strong></div>
            </div>
            <div className="card">
              <dl className="kv">
                <dt>Empresa</dt><dd>{co ? <Link to={`/companies/${co.id}`} className="row" style={{ gap: 6, textDecoration: 'underline' }}><Building2 size={13} />{co.tradeName}</Link> : '—'}</dd>
                <dt>Cliente</dt><dd>{p ? <Link to={`/people/${p.id}`} className="row" style={{ gap: 6, textDecoration: 'underline' }}><User size={13} />{p.name}</Link> : '—'}</dd>
                <dt>Produto</dt><dd>{x.product}</dd>
                <dt>Responsável</dt><dd><UserChip id={x.ownerId} /></dd>
                <dt>Abertura</dt><dd>{fmtDate(x.openedAt)}</dd>
                <dt>Previsão</dt><dd>{fmtDate(x.expectedClose)}</dd>
                {x.closedAt && <><dt>Fechamento</dt><dd>{fmtDate(x.closedAt)}</dd></>}
                <dt>Origem</dt><dd>{x.source}</dd>
                <dt>Na etapa há</dt><dd>{days} dia(s)</dd>
                {x.leadId && <><dt>Lead de origem</dt><dd><Link to={`/leads/${x.leadId}`} style={{ textDecoration: 'underline' }}>{L.leads.get(x.leadId)?.name ?? 'ver'}</Link></dd></>}
              </dl>
              {x.notes && <><div className="divider" /><div className="label">Observações</div><p className="small">{x.notes}</p></>}
            </div>
          </div>
        </div>
      </div>
      {edit && <DealForm open onClose={() => setEdit(false)} deal={x} />}
    </div>
  );
}
