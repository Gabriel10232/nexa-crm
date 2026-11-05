import React, { useMemo, useState } from 'react';
import { Plus, Trophy, Pencil, Trash2, AlertTriangle, TrendingUp } from 'lucide-react';
import type { Goal, GoalMetric } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { goalProgress, monthlySeries } from '../../services/metrics';
import { team as teamSvc } from '../../services/crm';
import { PageHeader } from '../../components/common';
import { Avatar, Badge, Button, Empty, Field, Input, Modal, Progress, Select, Tabs, Notice } from '../../components/ui';
import { LineChart } from '../../components/charts';
import { GOAL_METRICS } from '../../config/labels';
import { confirm, toast } from '../../store/ui';
import { money, monthKey, num, uid } from '../../lib/utils';

export default function Goals() {
  const d = useTenant(); const { user, can } = useSession();
  const months = Array.from({ length: 6 }, (_, i) => { const x = new Date(); x.setMonth(x.getMonth() - i); return monthKey(x); });
  const [period, setPeriod] = useState(months[0]);
  const [scope, setScope] = useState<Goal['scope']>('user');
  const [edit, setEdit] = useState<Goal | null>(null);
  const manage = ['owner', 'admin', 'manager'].includes(user.role);
  const goals = d.goals.filter(g => g.period === period && g.scope === scope);
  const fmtV = (m: GoalMetric, v: number) => (GOAL_METRICS[m].money ? (can('financial') ? money(v, v > 1e5) : '•••') : num(v));
  const name = (g: Goal) => g.scope === 'company' ? d.org.name : g.scope === 'team' ? d.teams.find(t => t.id === g.targetId)?.name : g.scope === 'department' ? g.targetId : d.users.find(u => u.id === g.targetId)?.name;
  const ranked = goals.map(g => ({ g, p: goalProgress(d, g) })).sort((a, b) => b.p.pct - a.p.pct);
  const alerts = ranked.filter(x => !x.p.onTrack && period === months[0]);
  const series = useMemo(() => monthlySeries(d, user, {}, 6), [d, user]);
  const companyGoal = d.goals.find(g => g.scope === 'company' && g.metric === 'revenue');

  return (
    <div>
      <PageHeader title="Metas e desempenho" desc="Metas de receita, vendas, reuniões e contatos para vendedores, equipes, departamentos e empresa." crumbs={[{ label: 'Início', to: '/' }, { label: 'Metas' }]}
        actions={<>
          <Select aria-label="Mês" value={period} onChange={e => setPeriod(e.target.value)} options={months.map(m => ({ value: m, label: new Date(m + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }))} style={{ width: 190 }} />
          {manage && <Button variant="primary" onClick={() => setEdit({ id: uid('g'), scope, metric: 'revenue', period, target: 50000, targetId: scope === 'user' ? d.users[4]?.id : scope === 'team' ? d.teams[0].id : scope === 'department' ? 'Comercial' : undefined })}><Plus />Nova meta</Button>}
        </>} />
      <Tabs value={scope} onChange={setScope} tabs={[{ value: 'user', label: 'Vendedores' }, { value: 'team', label: 'Equipes' }, { value: 'department', label: 'Departamentos' }, { value: 'company', label: 'Empresa' }]} />
      {alerts.length > 0 && <div style={{ marginBottom: 14 }}><Notice tone="warning" icon={<AlertTriangle />}><strong>{alerts.length} meta(s) abaixo do ritmo esperado</strong> para o dia {new Date().getDate()}: {alerts.slice(0, 4).map(x => name(x.g)).join(', ')}.</Notice></div>}
      <div className="split">
        <div className="card">
          {ranked.length === 0 ? <Empty icon={<Trophy size={22} />} title="Nenhuma meta para este filtro" text="Defina metas para acompanhar progresso e ranking." action={manage && <Button onClick={() => setEdit({ id: uid('g'), scope, metric: 'revenue', period, target: 50000 })}><Plus />Criar meta</Button>} /> : (
            <div className="list">{ranked.map(({ g, p }, i) => (
              <div key={g.id} className="list-item" style={{ flexWrap: 'wrap', gap: 14, padding: '14px 6px' }}>
                <span className="strong num muted" style={{ width: 20 }}>{i + 1}</span>
                {g.scope === 'user' ? <Avatar name={name(g) ?? '?'} color={d.users.find(u => u.id === g.targetId)?.color} /> : <span className="icon-bubble"><Trophy /></span>}
                <div className="flex1" style={{ minWidth: 200 }}>
                  <div className="row between"><strong className="small">{name(g)}</strong><span className="small num">{fmtV(g.metric, p.value)} / {fmtV(g.metric, g.target)}</span></div>
                  <div className="xs muted" style={{ marginBottom: 6 }}>{GOAL_METRICS[g.metric].label}</div>
                  <Progress value={p.pct} tone={p.pct >= 100 ? 'ok' : p.onTrack ? undefined : 'warn'} />
                </div>
                <Badge tone={p.pct >= 100 ? 'success' : p.onTrack ? 'accent' : 'warning'}>{p.pct.toFixed(0)}%</Badge>
                {manage && <><Button size="xs" variant="ghost" icon onClick={() => setEdit(g)} aria-label="Editar meta"><Pencil /></Button>
                  <Button size="xs" variant="ghost" icon aria-label="Excluir meta" onClick={async () => { if (await confirm({ title: 'Excluir esta meta?', danger: true, confirmLabel: 'Excluir' })) { teamSvc.removeGoal(g.id); toast('success', 'Meta excluída'); } }}><Trash2 /></Button></>}
              </div>
            ))}</div>
          )}
        </div>
        <div className="stack">
          <div className="card" style={{ height: 300, display: 'flex', flexDirection: 'column' }}>
            <div className="card-head"><h3 className="row"><TrendingUp size={16} />Evolução da receita</h3></div>
            <div style={{ flex: 1 }}>{can('financial') ? <LineChart money labels={series.map(s => s.label)} series={[{ name: 'Receita', values: series.map(s => s.won) }, ...(companyGoal ? [{ name: 'Meta atual', values: series.map(() => companyGoal.target), dashed: true, color: 'var(--chart-4)' }] : [])]} /> : <Notice>Sem acesso a dados financeiros.</Notice>}</div>
          </div>
          {!manage && <Notice>Somente gestores e administradores podem criar ou editar metas.</Notice>}
        </div>
      </div>
      {edit && <GoalModal g={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function GoalModal({ g: init, onClose }: { g: Goal; onClose: () => void }) {
  const d = useTenant(); const [g, setG] = useState(init); const [err, setErr] = useState('');
  const targets = g.scope === 'user' ? d.users.filter(u => ['seller', 'manager', 'supervisor'].includes(u.role)).map(u => ({ value: u.id, label: u.name })) : g.scope === 'team' ? d.teams.map(t => ({ value: t.id, label: t.name })) : g.scope === 'department' ? Array.from(new Set(d.teams.map(t => t.department))).map(x => ({ value: x, label: x })) : [];
  return (
    <Modal open onClose={onClose} title={d.goals.some(x => x.id === g.id) ? 'Editar meta' : 'Nova meta'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { if (g.scope !== 'company' && !g.targetId) { setErr('Selecione o alvo da meta.'); return; } if (!(g.target > 0)) { setErr('O valor da meta deve ser maior que zero.'); return; } teamSvc.saveGoal(g); toast('success', 'Meta salva'); onClose(); }}>Salvar</Button></>}>
      <div className="form-grid">
        <Field label="Escopo"><Select value={g.scope} onChange={e => setG({ ...g, scope: e.target.value as Goal['scope'], targetId: undefined })} options={[{ value: 'user', label: 'Vendedor' }, { value: 'team', label: 'Equipe' }, { value: 'department', label: 'Departamento' }, { value: 'company', label: 'Empresa' }]} /></Field>
        {g.scope !== 'company' && <Field label="Alvo" required><Select value={g.targetId ?? ''} onChange={e => setG({ ...g, targetId: e.target.value })} placeholder="Selecione…" options={targets} /></Field>}
        <Field label="Métrica"><Select value={g.metric} onChange={e => setG({ ...g, metric: e.target.value as GoalMetric })} options={Object.entries(GOAL_METRICS).map(([k, m]) => ({ value: k, label: m.label }))} /></Field>
        <Field label="Mês"><Input type="month" value={g.period} onChange={e => setG({ ...g, period: e.target.value })} /></Field>
        <Field label={GOAL_METRICS[g.metric].money ? 'Valor alvo (R$)' : 'Quantidade alvo'} required error={err}><Input type="number" min={1} value={g.target} onChange={e => { setG({ ...g, target: Number(e.target.value) }); setErr(''); }} /></Field>
      </div>
    </Modal>
  );
}
