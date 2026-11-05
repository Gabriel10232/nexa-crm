import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Columns3, List, Table2, Settings2, AlertTriangle, Trash2, GripVertical, ArrowUp, ArrowDown, MoreHorizontal, Building2 } from 'lucide-react';
import type { Deal, Pipeline as PipelineT, Stage } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { scoped } from '../../services/metrics';
import { deals as dealSvc, pipelines as pipeSvc } from '../../services/crm';
import { PageHeader, UserChip, Money, useLookups } from '../../components/common';
import { Avatar, Badge, Button, Column, DataTable, Empty, Field, Input, Menu, Modal, Seg, Select, Notice, useLoading, Skeleton } from '../../components/ui';
import { DealForm } from '../../components/forms';
import { moveDeal } from './dealActions';
import { confirm, toast } from '../../store/ui';
import { cx, daysBetween, fmtDate, money, uid } from '../../lib/utils';

const STALE_DAYS = 14;
const PRIORITY = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;

export default function Pipeline() {
  const d = useTenant(); const { user, can } = useSession(); const nav = useNavigate(); const L = useLookups();
  const loading = useLoading(300);
  const [pipeId, setPipeId] = useState(() => sessionStorage.getItem('nexa:pipe') ?? d.pipelines[0].id);
  const pipe = d.pipelines.find(p => p.id === pipeId) ?? d.pipelines[0];
  const [view, setView] = useState<'kanban' | 'list' | 'table'>(() => (window.innerWidth < 700 ? 'list' : 'kanban'));
  const [sort, setSort] = useState<'value' | 'date' | 'priority' | 'stale'>('value');
  const [owner, setOwner] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [newDeal, setNewDeal] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const all = useMemo(() => scoped(d, user, d.deals).filter(x => x.pipelineId === pipe.id && !x.archivedAt && (!owner || x.ownerId === owner)), [d, user, pipe.id, owner]);
  const recentClosed = (x: Deal) => x.status === 'open' || (x.closedAt && daysBetween(x.closedAt) <= 30);
  const visibleDeals = all.filter(x => showClosed ? recentClosed(x) : x.status === 'open');
  const sorter = (a: Deal, b: Deal) => sort === 'value' ? b.value - a.value : sort === 'date' ? a.expectedClose.localeCompare(b.expectedClose) : sort === 'stale' ? daysBetween(b.stageEnteredAt) - daysBetween(a.stageEnteredAt) : ['alta', 'media', 'baixa'].indexOf(a.priority) - ['alta', 'media', 'baixa'].indexOf(b.priority);
  const stages = pipe.stages.filter(s => showClosed || s.kind === 'open');
  const open = all.filter(x => x.status === 'open');
  const total = open.reduce((a, x) => a + x.value, 0);
  const weighted = open.reduce((a, x) => a + x.value * x.probability / 100, 0);
  const stale = open.filter(x => daysBetween(x.stageEnteredAt) >= STALE_DAYS).length;
  const ro = !can('edit');

  const onDrop = async (stageId: string) => {
    setOver(null);
    const deal = d.deals.find(x => x.id === dragId); setDragId(null);
    if (!deal || deal.stageId === stageId || ro) return;
    await moveDeal(d, deal, stageId);
  };

  const card = (x: Deal) => {
    const days = daysBetween(x.stageEnteredAt);
    const co = L.companies.get(x.companyId ?? ''); const p = L.people.get(x.personId ?? '');
    return (
      <article key={x.id} className={cx('glass kcard', dragId === x.id && 'dragging')} draggable={!ro} aria-label={x.name}
        onDragStart={e => { setDragId(x.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <button className="kc-title" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => nav(`/opportunities/${x.id}`)}>{x.name}</button>
          <Menu width={210} trigger={t => <Button {...t} size="xs" variant="ghost" icon aria-label={`Ações de ${x.name}`}><MoreHorizontal /></Button>}>
            <div className="menu-label">Mover para</div>
            {pipe.stages.filter(s => s.id !== x.stageId).map(s => <button key={s.id} disabled={ro} onClick={() => moveDeal(d, x, s.id)}><span className="dot-status" style={{ background: s.color }} />{s.name}</button>)}
            <hr /><button onClick={() => nav(`/opportunities/${x.id}`)}>Abrir detalhes</button>
          </Menu>
        </div>
        <div className="xs muted row" style={{ gap: 6 }}><Building2 size={12} /><span className="ellipsis">{co?.tradeName ?? p?.name ?? '—'}</span></div>
        <div className="row between">
          {can('financial') && !ro ? (
            <span className="row" style={{ gap: 2 }}><span className="xs muted">R$</span><input className="inline-value" aria-label="Valor da oportunidade" defaultValue={x.value} type="number" min={0} step={500}
              onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== x.value) { dealSvc.update(x.id, { value: v }); toast('success', 'Valor atualizado', money(v)); } else e.target.value = String(x.value); }} /></span>
          ) : <strong className="num"><Money v={x.value} /></strong>}
          <Badge tone={x.priority === 'alta' ? 'danger' : x.priority === 'media' ? 'warning' : 'neutral'}>{PRIORITY[x.priority]}</Badge>
        </div>
        <div className="row between xs muted">
          <span>{x.probability}% · {fmtDate(x.expectedClose, { day: '2-digit', month: 'short' })}</span>
          <Avatar name={L.users.get(x.ownerId)?.name ?? '?'} color={L.users.get(x.ownerId)?.color} size="sm" />
        </div>
        {x.status === 'open' && days >= STALE_DAYS && <span className="stale"><AlertTriangle size={12} />Parada há {days} dias</span>}
        {x.status === 'lost' && x.lostReason && <span className="xs" style={{ color: 'var(--danger)' }}>{x.lostReason}</span>}
      </article>
    );
  };

  const columns: Column<Deal>[] = [
    { key: 'name', label: 'Oportunidade', sort: x => x.name, render: x => <div className="cell-main"><div style={{ minWidth: 0 }}><div className="t ellipsis">{x.name}</div><div className="s">{L.companies.get(x.companyId ?? '')?.tradeName ?? L.people.get(x.personId ?? '')?.name}</div></div></div> },
    { key: 'stage', label: 'Etapa', sort: x => pipe.stages.findIndex(s => s.id === x.stageId), render: x => <Badge><span className="dot" style={{ background: L.stages.get(x.stageId)?.color }} />{L.stages.get(x.stageId)?.name}</Badge> },
    { key: 'value', label: 'Valor', align: 'right', sort: x => x.value, render: x => <Money v={x.value} /> },
    { key: 'prob', label: 'Prob.', sort: x => x.probability, render: x => `${x.probability}%` },
    { key: 'close', label: 'Previsão', sort: x => x.expectedClose, render: x => fmtDate(x.expectedClose) },
    { key: 'stale', label: 'Na etapa', sort: x => daysBetween(x.stageEnteredAt), render: x => <span style={{ color: daysBetween(x.stageEnteredAt) >= STALE_DAYS ? 'var(--warning)' : undefined }}>{daysBetween(x.stageEnteredAt)}d</span> },
    { key: 'owner', label: 'Responsável', render: x => <UserChip id={x.ownerId} /> },
  ];

  return (
    <div>
      <PageHeader title="Pipeline de vendas" crumbs={[{ label: 'Início', to: '/' }, { label: 'Pipeline' }]}
        desc={<span className="row wrap" style={{ gap: 14 }}><span>Total aberto <strong style={{ color: 'var(--text)' }}><Money v={total} compact /></strong></span><span>Previsão ponderada <strong style={{ color: 'var(--text)' }}><Money v={weighted} compact /></strong></span><span>{open.length} oportunidades</span>{stale > 0 && <span style={{ color: 'var(--warning)' }}><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {stale} parada(s)</span>}</span>}
        actions={<>
          {can('settings') && <Button onClick={() => setManage(true)}><Settings2 />Pipelines e etapas</Button>}
          {can('create') && <Button variant="primary" onClick={() => setNewDeal(stages[0]?.id ?? '')}><Plus />Nova oportunidade</Button>}
        </>} />
      <div className="toolbar">
        <Select aria-label="Pipeline" value={pipe.id} onChange={e => { setPipeId(e.target.value); sessionStorage.setItem('nexa:pipe', e.target.value); }} options={d.pipelines.map(p => ({ value: p.id, label: p.name }))} style={{ width: 210, height: 36 }} />
        <Seg label="Visualização" value={view} onChange={setView} options={[{ value: 'kanban', label: 'Kanban', icon: <Columns3 /> }, { value: 'list', label: 'Lista', icon: <List /> }, { value: 'table', label: 'Tabela', icon: <Table2 /> }]} />
        <Select aria-label="Ordenar" value={sort} onChange={e => setSort(e.target.value as 'value')} options={[{ value: 'value', label: 'Ordenar: maior valor' }, { value: 'date', label: 'Ordenar: fechamento' }, { value: 'priority', label: 'Ordenar: prioridade' }, { value: 'stale', label: 'Ordenar: mais paradas' }]} style={{ width: 200, height: 36 }} />
        <Select aria-label="Responsável" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Todos os responsáveis" options={d.users.filter(u => ['seller', 'manager', 'supervisor'].includes(u.role)).map(u => ({ value: u.id, label: u.name }))} style={{ width: 200, height: 36 }} />
        <label className="check small"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />Mostrar ganhas/perdidas (30 dias)</label>
      </div>
      {ro && <div style={{ marginBottom: 12 }}><Notice>Seu perfil é somente leitura: arrastar e editar valores está desativado.</Notice></div>}

      {loading ? <div className="kanban">{stages.slice(0, 5).map(s => <div key={s.id} className="kcol"><Skeleton h={16} w="60%" /><Skeleton h={90} /><Skeleton h={90} /></div>)}</div>
        : view === 'kanban' ? (
          <div className="kanban" role="list" aria-label="Etapas do pipeline">
            {stages.map(s => {
              const items = visibleDeals.filter(x => x.stageId === s.id).sort(sorter);
              const sum = items.reduce((a, x) => a + x.value, 0);
              return (
                <section key={s.id} role="listitem" aria-label={`Etapa ${s.name}`} className={cx('kcol', over === s.id && 'over')}
                  onDragOver={e => { e.preventDefault(); setOver(s.id); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }} onDrop={() => onDrop(s.id)}>
                  <div className="kcol-bar" style={{ background: s.color }} />
                  <div className="kcol-head"><span className="name">{s.name}</span><Badge>{items.length}</Badge><span className="flex1" /><span className="meta">{s.probability}%</span></div>
                  <div className="xs muted" style={{ padding: '0 4px' }}><Money v={sum} compact /> · pond. <Money v={sum * s.probability / 100} compact /></div>
                  {items.map(card)}
                  {!items.length && <div className="xs muted" style={{ textAlign: 'center', padding: 18, border: '1px dashed var(--line)', borderRadius: 12 }}>Arraste oportunidades para cá</div>}
                  {s.kind === 'open' && can('create') && <Button size="sm" variant="ghost" onClick={() => setNewDeal(s.id)}><Plus />Adicionar</Button>}
                </section>
              );
            })}
          </div>
        ) : view === 'list' ? (
          <div className="stack">
            {stages.map(s => {
              const items = visibleDeals.filter(x => x.stageId === s.id).sort(sorter);
              return (
                <div key={s.id} className="card" style={{ padding: 14 }}>
                  <div className="row between" style={{ marginBottom: 6 }}><span className="row"><span className="dot-status" style={{ background: s.color }} /><strong>{s.name}</strong><Badge>{items.length}</Badge></span><span className="small muted"><Money v={items.reduce((a, x) => a + x.value, 0)} compact /></span></div>
                  {items.length === 0 ? <span className="xs muted">Nenhuma oportunidade nesta etapa.</span> : <div className="list">{items.map(x => (
                    <div key={x.id} className="list-item">
                      <div className="flex1" style={{ cursor: 'pointer' }} onClick={() => nav(`/opportunities/${x.id}`)}><div className="small strong ellipsis">{x.name}</div><div className="xs muted">{x.probability}% · {fmtDate(x.expectedClose, { day: '2-digit', month: 'short' })}{daysBetween(x.stageEnteredAt) >= STALE_DAYS && x.status === 'open' ? ` · ⚠ parada ${daysBetween(x.stageEnteredAt)}d` : ''}</div></div>
                      <strong className="small"><Money v={x.value} compact /></strong>
                      <Select aria-label="Mover para etapa" value={x.stageId} disabled={ro} onChange={e => moveDeal(d, x, e.target.value)} options={pipe.stages.map(st => ({ value: st.id, label: st.name }))} style={{ width: 140, height: 32 }} />
                    </div>
                  ))}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card" style={{ padding: 6 }}><DataTable rows={visibleDeals} columns={columns} onRowClick={x => nav(`/opportunities/${x.id}`)} initialSort={{ key: 'value', dir: 'desc' }} empty={<Empty title="Nenhuma oportunidade" />} /></div>
        )}

      {newDeal !== null && <DealForm open onClose={() => setNewDeal(null)} preset={{ pipelineId: pipe.id, stageId: newDeal }} />}
      {manage && <ManagePipelines onClose={() => setManage(false)} current={pipe.id} onSelect={setPipeId} />}
    </div>
  );
}

function ManagePipelines({ onClose, current, onSelect }: { onClose: () => void; current: string; onSelect: (id: string) => void }) {
  const d = useTenant();
  const [pid, setPid] = useState(current);
  const [draft, setDraft] = useState<PipelineT>(() => JSON.parse(JSON.stringify(d.pipelines.find(p => p.id === current)!)));
  const [err, setErr] = useState('');
  const load = (id: string) => { setPid(id); setDraft(JSON.parse(JSON.stringify(d.pipelines.find(p => p.id === id)!))); setErr(''); };
  const openStages = draft.stages.filter(s => s.kind === 'open');
  const setStage = (id: string, p: Partial<Stage>) => setDraft({ ...draft, stages: draft.stages.map(s => (s.id === id ? { ...s, ...p } : s)) });
  const moveStage = (id: string, dir: -1 | 1) => { const st = [...openStages]; const i = st.findIndex(s => s.id === id); const j = i + dir; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; setDraft({ ...draft, stages: [...st, ...draft.stages.filter(s => s.kind !== 'open')] }); };
  const save = () => {
    if (!draft.name.trim()) { setErr('Dê um nome ao pipeline.'); return; }
    if (draft.stages.some(s => !s.name.trim())) { setErr('Todas as etapas precisam de nome.'); return; }
    if (!openStages.length) { setErr('O pipeline precisa de ao menos uma etapa aberta.'); return; }
    pipeSvc.save(draft); toast('success', 'Pipeline salvo'); onSelect(draft.id); onClose();
  };
  const create = () => {
    const id = uid('pipe');
    const p: PipelineT = { id, name: 'Novo pipeline', stages: [{ id: `${id}_s0`, name: 'Entrada', probability: 20, kind: 'open', color: '#86B4C6' }, { id: `${id}_s1`, name: 'Negociação', probability: 60, kind: 'open', color: '#C8B88A' }, { id: `${id}_won`, name: 'Ganho', probability: 100, kind: 'won', color: '#74C69D' }, { id: `${id}_lost`, name: 'Perdido', probability: 0, kind: 'lost', color: '#E88383' }] };
    pipeSvc.save(p); setPid(id); setDraft(p);
  };
  const removeStage = async (s: Stage) => {
    const n = d.deals.filter(x => x.stageId === s.id).length;
    if (n) { toast('error', 'Etapa em uso', `Mova as ${n} oportunidade(s) antes de remover.`); return; }
    setDraft({ ...draft, stages: draft.stages.filter(x => x.id !== s.id) });
  };
  const removePipe = async () => {
    if (d.pipelines.length <= 1) { toast('error', 'É necessário manter ao menos um pipeline.'); return; }
    if (d.deals.some(x => x.pipelineId === pid)) { toast('error', 'Pipeline possui oportunidades', 'Mova ou arquive as oportunidades antes.'); return; }
    if (await confirm({ title: `Excluir pipeline "${draft.name}"?`, danger: true, confirmLabel: 'Excluir' })) { pipeSvc.remove(pid); load(d.pipelines.find(p => p.id !== pid)!.id); }
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Pipelines e etapas" description="Crie múltiplos pipelines e personalize etapas e probabilidades."
      footer={<><Button variant="danger" onClick={removePipe} style={{ marginRight: 'auto' }}><Trash2 />Excluir pipeline</Button><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="stack">
        <div className="row wrap"><Select value={pid} onChange={e => load(e.target.value)} options={d.pipelines.map(p => ({ value: p.id, label: p.name }))} style={{ flex: 1 }} aria-label="Pipeline" /><Button onClick={create}><Plus />Novo pipeline</Button></div>
        <Field label="Nome do pipeline" required><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
        <div className="stack-sm">
          <span className="label">Etapas abertas (ordem do funil)</span>
          {openStages.map((s, i) => (
            <div key={s.id} className="row" style={{ gap: 6 }}>
              <GripVertical size={14} className="muted" />
              <input type="color" className="color-input" value={s.color} onChange={e => setStage(s.id, { color: e.target.value })} aria-label="Cor da etapa" />
              <Input value={s.name} onChange={e => setStage(s.id, { name: e.target.value })} aria-label="Nome da etapa" />
              <Input type="number" min={0} max={100} value={s.probability} onChange={e => setStage(s.id, { probability: Number(e.target.value) })} style={{ width: 80 }} aria-label="Probabilidade" />
              <Button size="sm" icon variant="ghost" onClick={() => moveStage(s.id, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp /></Button>
              <Button size="sm" icon variant="ghost" onClick={() => moveStage(s.id, 1)} disabled={i === openStages.length - 1} aria-label="Descer"><ArrowDown /></Button>
              <Button size="sm" icon variant="ghost" onClick={() => removeStage(s)} aria-label="Remover etapa"><Trash2 /></Button>
            </div>
          ))}
          <Button size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ ...draft, stages: [...openStages, { id: uid('st'), name: 'Nova etapa', probability: 50, kind: 'open', color: '#8C9EC4' }, ...draft.stages.filter(s => s.kind !== 'open')] })}><Plus />Adicionar etapa</Button>
          <span className="xs muted">As etapas "Ganho" e "Perdido" são fixas. Ao mover para "Perdido", o motivo da perda é solicitado.</span>
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
      </div>
    </Modal>
  );
}
