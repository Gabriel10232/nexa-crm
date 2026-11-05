import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus, CalendarClock, AlertTriangle, PhoneOff, Check, Circle, Plus } from 'lucide-react';
import type { KpiMetric, TenantData, User, Widget, WidgetType, WidgetConfig } from '../../types';
import { KPI_METRICS, WIDGET_CATALOG, newWidget } from '../../config/widgets';
import { LineChart, Donut, Funnel, HBars, Sparkline } from '../../components/charts';
import { CountUp, Avatar, Badge, Button, Empty, Field, Input, Modal, Progress, Select, Switch, Textarea } from '../../components/ui';
import { Money, UserChip } from '../../components/common';
import { computeKpis, customMetric, forecastSeries, funnel, goalProgress, leadsWithoutContact, monthlySeries, ranking, staleDeals, Filters, scoped } from '../../services/metrics';
import { tasks as taskSvc, settings } from '../../services/crm';
import { can } from '../../config/permissions';
import { daysBetween, fmtDate, fmtTime, money, num, pct, relTime, groupCount, sameDay } from '../../lib/utils';
import { LEAD_STATUS, ACTIVITY, CHANNELS } from '../../config/labels';
import { Icon } from '../../components/ui';
import { useTenant } from '../../store/store';

export interface WCtx { d: TenantData; user: User; f: Filters; kpis: Record<KpiMetric, number>; prev: Record<KpiMetric, number> }

const fmtKpi = (m: KpiMetric, v: number) => KPI_METRICS[m].money ? money(v, v >= 1e5) : KPI_METRICS[m].pct ? pct(v) : `${num(v, m === 'avg_cycle' ? 0 : 0)}${KPI_METRICS[m].suffix ?? ''}`;

function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev && !cur) return <span className="delta flat"><Minus size={12} />0%</span>;
  const ch = prev ? ((cur - prev) / Math.abs(prev)) * 100 : 100;
  const good = invert ? ch < 0 : ch > 0;
  if (Math.abs(ch) < 0.5) return <span className="delta flat"><Minus size={12} />estável</span>;
  return <span className={`delta ${good ? 'up' : 'down'}`}>{ch > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(ch).toFixed(0)}%</span>;
}

function periodFilters(w: Widget, f: Filters): Filters {
  return { ...f, period: w.config.period && w.config.period !== 'inherit' ? w.config.period : f.period, ownerId: w.config.ownerId || f.ownerId, teamId: w.config.teamId || f.teamId };
}

export function WidgetBody({ w, ctx }: { w: Widget; ctx: WCtx }) {
  const { d, user } = ctx;
  const nav = useNavigate();
  const fin = can(user.role, 'financial');
  const f = periodFilters(w, ctx.f);
  const overridden = f !== ctx.f && (w.config.period !== 'inherit' || w.config.ownerId || w.config.teamId);
  const kpis = useMemo(() => (overridden ? computeKpis(d, user, f) : ctx.kpis), [overridden, d, user, f.period, f.ownerId, f.teamId, ctx.kpis]); // eslint-disable-line
  const prev = useMemo(() => (overridden ? computeKpis(d, user, f, 1) : ctx.prev), [overridden, d, user, f.period, f.ownerId, f.teamId, ctx.prev]); // eslint-disable-line

  switch (w.type) {
    case 'kpi': {
      const m = w.config.metric ?? 'total_leads';
      if (KPI_METRICS[m].financial && !fin) return <div className="kpi"><div className="label">{w.title}</div><div className="value muted" title="Sem permissão para dados financeiros">•••</div><span className="xs muted">Restrito ao seu perfil</span></div>;
      const v = m === 'custom' && w.config.custom ? customMetric(d, user, w.config.custom) : kpis[m];
      const series = monthlySeries(d, user, f, 8).map(x => x.won);
      return (
        <div className="kpi">
          <div className="label"><span className="ellipsis">{w.title}</span></div>
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div className="value" style={{ color: w.config.color || undefined }}><CountUp value={v} format={n => (m === 'custom' ? num(n) : fmtKpi(m, n))} /></div>
            {w.h > 1 && <Sparkline values={series} color={w.config.color || 'var(--accent)'} />}
          </div>
          {ctx.f.compare && m !== 'custom' ? <span className="xs muted row" style={{ gap: 6 }}><Delta cur={v} prev={prev[m]} invert={m === 'lost_count' || m === 'avg_cycle' || m === 'pending_activities'} /> vs período anterior</span> : <span className="xs muted">{w.description ?? ''}</span>}
        </div>
      );
    }
    case 'chart_sales': {
      const s = monthlySeries(d, user, f, f.period === '7d' || f.period === '30d' ? 6 : 12);
      if (!fin) return <Restricted />;
      const type = w.config.chart === 'bar' ? 'bar' : w.config.chart === 'line' ? 'line' : 'area';
      return <LineChart type={type} money labels={s.map(x => x.label)} series={[{ name: 'Receita ganha', values: s.map(x => x.won), color: w.config.color || undefined }, ...(ctx.f.compare ? [{ name: 'Perdida', values: s.map(x => x.lost), dashed: true, color: 'var(--chart-4)' }] : [])]} />;
    }
    case 'chart_forecast': {
      if (!fin) return <Restricted />;
      const s = forecastSeries(d, user, f);
      return <LineChart type={w.config.chart === 'line' ? 'line' : 'bar'} money labels={s.map(x => x.label)} series={[{ name: 'Ponderada', values: s.map(x => x.weighted) }, { name: 'Total no pipeline', values: s.map(x => x.total), color: 'var(--chart-3)' }]} />;
    }
    case 'chart_funnel': return <Funnel steps={funnel(d, user, f)} />;
    case 'chart_sources': {
      const g = groupCount(scoped(d, user, d.leads).filter(l => !l.archivedAt), l => l.source);
      const data = Object.entries(g).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      return w.config.chart === 'bar' ? <HBars data={data} /> : <Donut data={data.slice(0, 6)} center={<div><div className="strong num">{data.reduce((a, x) => a + x.value, 0)}</div><div className="xs muted">leads</div></div>} size={w.h >= 3 ? 140 : 100} />;
    }
    case 'chart_status': {
      const g = groupCount(scoped(d, user, d.leads).filter(l => !l.archivedAt), l => l.status);
      const data = Object.entries(LEAD_STATUS).map(([k, x]) => ({ label: x.label, value: g[k] ?? 0 })).filter(x => x.value);
      return w.config.chart === 'donut' ? <Donut data={data} size={130} /> : <HBars data={data} />;
    }
    case 'chart_pipeline': {
      const pipe = d.pipelines[0];
      const open = scoped(d, user, d.deals).filter(x => x.status === 'open' && x.pipelineId === pipe.id);
      const data = pipe.stages.filter(s => s.kind === 'open').map(s => ({ label: s.name, value: fin ? open.filter(x => x.stageId === s.id).reduce((a, x) => a + x.value, 0) : open.filter(x => x.stageId === s.id).length }));
      return <HBars data={data} money={fin} />;
    }
    case 'goals': {
      const g = d.goals.filter(x => x.scope === 'company' || x.scope === 'team').slice(0, 4);
      if (!g.length) return <Empty compact title="Sem metas" text="Defina metas em Metas." />;
      return <div className="stack-sm" style={{ gap: 14 }}>{g.map(x => {
        const p = goalProgress(d, x); const label = x.scope === 'company' ? 'Meta da empresa' : d.teams.find(t => t.id === x.targetId)?.name;
        return <div key={x.id} className="stack-sm" style={{ gap: 6 }}>
          <div className="row between small"><span className="strong">{label}</span><span className="num">{fin ? `${money(p.value, true)} / ${money(x.target, true)}` : `${p.pct.toFixed(0)}%`}</span></div>
          <Progress value={p.pct} tone={p.onTrack ? 'ok' : 'warn'} />
          <span className="xs muted">{p.pct.toFixed(0)}% atingido · {p.onTrack ? 'no ritmo' : 'abaixo do ritmo esperado'}</span>
        </div>;
      })}</div>;
    }
    case 'ranking': {
      const r = ranking(d, user, f).slice(0, 6);
      if (!r.length) return <Empty compact title="Sem vendedores" text="Convide vendedores em Equipe para ver o ranking." />;
      return <div className="list">{r.map((x, i) => (
        <div key={x.user.id} className="list-item"><span className="strong muted num" style={{ width: 18 }}>{i + 1}</span><Avatar name={x.user.name} color={x.user.color} size="sm" />
          <span className="flex1 ellipsis">{x.user.name}</span><span className="xs muted">{x.count} venda(s)</span><strong className="num"><Money v={x.revenue} compact /></strong></div>
      ))}</div>;
    }
    case 'meetings': {
      const ev = scoped(d, user, d.events).filter(e => new Date(e.start) > new Date() && !e.done).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
      if (!ev.length) return <Empty compact icon={<CalendarClock size={20} />} title="Agenda livre" text="Nenhuma reunião futura." />;
      return <div className="list">{ev.map(e => (
        <div key={e.id} className="list-item click" onClick={() => nav('/agenda')}>
          <div style={{ width: 48, textAlign: 'center' }}><div className="xs muted">{sameDay(e.start, new Date()) ? 'Hoje' : fmtDate(e.start, { day: '2-digit', month: 'short' })}</div><div className="strong small">{fmtTime(e.start)}</div></div>
          <span className="flex1 ellipsis small">{e.title}</span>
        </div>
      ))}</div>;
    }
    case 'no_contact': {
      const l = leadsWithoutContact(d, user, 7).slice(0, 6);
      if (!l.length) return <Empty compact icon={<Check size={20} />} title="Tudo em dia" text="Nenhum lead parado há mais de 7 dias." />;
      return <div className="list">{l.map(x => (
        <Link key={x.id} to={`/leads/${x.id}`} className="list-item click"><span className="icon-bubble warning"><PhoneOff /></span><span className="flex1 ellipsis small"><span className="strong">{x.name}</span><br /><span className="xs muted">{x.companyName ?? LEAD_STATUS[x.status].label}</span></span><Badge tone="warning">{daysBetween(x.lastContactAt ?? x.createdAt)}d</Badge></Link>
      ))}</div>;
    }
    case 'stale_deals': {
      const s = staleDeals(d, user, 14).slice(0, 6);
      if (!s.length) return <Empty compact icon={<Check size={20} />} title="Pipeline fluindo" text="Nenhuma oportunidade parada." />;
      return <div className="list">{s.map(x => (
        <Link key={x.id} to={`/opportunities/${x.id}`} className="list-item click"><span className="icon-bubble danger"><AlertTriangle /></span><span className="flex1 ellipsis small"><span className="strong">{x.name}</span><br /><span className="xs muted"><Money v={x.value} compact /></span></span><Badge tone="danger">{daysBetween(x.stageEnteredAt)}d</Badge></Link>
      ))}</div>;
    }
    case 'recent_customers': {
      const c = scoped(d, user, d.deals).filter(x => x.status === 'won').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')).slice(0, 6);
      if (!c.length) return <Empty compact title="Nenhum cliente ainda" text="Vendas ganhas aparecerão aqui." />;
      return <div className="list">{c.map(x => {
        const co = d.companies.find(y => y.id === x.companyId); const p = d.people.find(y => y.id === x.personId);
        return <Link key={x.id} to={co ? `/companies/${co.id}` : `/people/${p?.id}`} className="list-item click"><Avatar name={co?.tradeName ?? p?.name ?? '?'} square size="sm" /><span className="flex1 ellipsis small">{co?.tradeName ?? p?.name}</span><span className="xs muted">{relTime(x.closedAt)}</span></Link>;
      })}</div>;
    }
    case 'tasks': {
      const t = d.tasks.filter(x => !x.done && (x.ownerId === user.id || w.config.ownerId === 'all')).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 7);
      if (!t.length) return <Empty compact icon={<Check size={20} />} title="Nenhuma tarefa pendente" text="Aproveite para prospectar." />;
      return <div className="list">{t.map(x => (
        <div key={x.id} className="list-item"><button className="btn ghost xs icon" onClick={() => taskSvc.toggle(x.id)} aria-label={`Concluir ${x.title}`}><Circle /></button>
          <span className="flex1 ellipsis small">{x.title}</span><Badge tone={new Date(x.due) < new Date() ? 'danger' : 'neutral'}>{new Date(x.due) < new Date() ? 'Atrasada' : fmtDate(x.due, { day: '2-digit', month: 'short' })}</Badge></div>
      ))}</div>;
    }
    case 'timeline': {
      const a = d.activities.slice().sort((x, y) => y.at.localeCompare(x.at)).slice(0, 7);
      if (!a.length) return <Empty compact title="Sem atividades" text="Interações registradas aparecerão aqui." />;
      return <div className="list">{a.map(x => <div key={x.id} className="list-item"><span className="icon-bubble neutral"><Icon name={ACTIVITY[x.type].icon} /></span><span className="flex1 ellipsis small">{x.title}<br /><span className="xs muted">{relTime(x.at)} · {d.users.find(u => u.id === x.userId)?.name}</span></span></div>)}</div>;
    }
    case 'inbox': {
      const c = d.conversations.filter(x => x.status !== 'resolvida').sort((a, b) => b.unread - a.unread).slice(0, 6);
      if (!c.length) return <Empty compact title="Caixa vazia" text="Nenhuma conversa em aberto." />;
      return <div className="list">{c.map(x => (
        <Link key={x.id} to={`/inbox?c=${x.id}`} className="list-item click"><span className="icon-bubble"><Icon name={CHANNELS[x.channel].icon} /></span>
          <span className="flex1 ellipsis small"><span className="strong">{d.people.find(p => p.id === x.personId)?.name}</span><br /><span className="xs muted">{x.messages[x.messages.length - 1]?.body}</span></span>{x.unread > 0 && <Badge tone="accent">{x.unread}</Badge>}</Link>
      ))}</div>;
    }
    case 'notes': return <QuickNotes d={d} />;
    case 'section': return null;
  }
}

const Restricted = () => <Empty compact title="Dados financeiros restritos" text="Seu perfil não tem acesso a valores." />;

function QuickNotes({ d }: { d: TenantData }) {
  const [v, setV] = useState(d.quickNotes);
  const [saved, setSaved] = useState(true);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea className="textarea" style={{ flex: 1, minHeight: 60, resize: 'none' }} value={v} aria-label="Anotações rápidas"
        onChange={e => { setV(e.target.value); setSaved(false); }} onBlur={() => { settings.patch(t => { t.quickNotes = v; }); setSaved(true); }} placeholder="Escreva lembretes rápidos…" />
      <span className="xs muted">{saved ? 'Salvo automaticamente' : 'Salvando ao sair do campo…'}</span>
    </div>
  );
}

/* ---------------- Config modal ---------------- */
export function WidgetConfigModal({ w, onClose, onSave, admin }: { w: Widget; onClose: () => void; onSave: (w: Widget) => void; admin: boolean }) {
  const [x, setX] = useState<Widget>(w);
  const d = useTenantSafe();
  const setC = (p: Partial<WidgetConfig>) => setX(s => ({ ...s, config: { ...s.config, ...p } }));
  const isChart = w.type.startsWith('chart_');
  return (
    <Modal open onClose={onClose} title="Configurar widget" description={WIDGET_CATALOG[w.type].description} size="lg"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => onSave(x)}>Aplicar</Button></>}>
      <div className="form-grid">
        <Field label="Título" required className="full"><Input value={x.title} onChange={e => setX({ ...x, title: e.target.value })} /></Field>
        <Field label="Descrição" className="full"><Textarea rows={2} value={x.description ?? ''} onChange={e => setX({ ...x, description: e.target.value })} /></Field>
        {w.type === 'kpi' && <Field label="Indicador"><Select value={x.config.metric} onChange={e => setC({ metric: e.target.value as KpiMetric })} options={Object.entries(KPI_METRICS).map(([k, m]) => ({ value: k, label: m.label }))} /></Field>}
        {x.config.metric === 'custom' && <>
          <Field label="Fonte de dados"><Select value={x.config.custom?.entity ?? 'leads'} onChange={e => setC({ custom: { agg: 'count', ...x.config.custom, entity: e.target.value as 'leads' } })} options={[{ value: 'leads', label: 'Leads' }, { value: 'deals', label: 'Oportunidades' }, { value: 'people', label: 'Pessoas' }, { value: 'companies', label: 'Empresas' }, { value: 'tasks', label: 'Tarefas' }]} /></Field>
          <Field label="Agregação"><Select value={x.config.custom?.agg ?? 'count'} onChange={e => setC({ custom: { entity: 'leads', ...x.config.custom, agg: e.target.value as 'count' } })} options={[{ value: 'count', label: 'Contagem' }, { value: 'sum', label: 'Soma de campo' }]} /></Field>
          {x.config.custom?.agg === 'sum' && <Field label="Campo numérico"><Input value={x.config.custom?.field ?? 'value'} onChange={e => setC({ custom: { entity: 'leads', agg: 'sum', ...x.config.custom, field: e.target.value } })} /></Field>}
          <Field label="Filtro: campo"><Input placeholder="ex.: status" value={x.config.custom?.filterField ?? ''} onChange={e => setC({ custom: { entity: 'leads', agg: 'count', ...x.config.custom, filterField: e.target.value } })} /></Field>
          <Field label="Filtro: valor"><Input placeholder="ex.: qualificado" value={x.config.custom?.filterValue ?? ''} onChange={e => setC({ custom: { entity: 'leads', agg: 'count', ...x.config.custom, filterValue: e.target.value } })} /></Field>
        </>}
        {(isChart || w.type === 'kpi' || w.type === 'ranking') && <Field label="Período de análise"><Select value={x.config.period ?? 'inherit'} onChange={e => setC({ period: e.target.value as WidgetConfig['period'] })} options={[{ value: 'inherit', label: 'Usar filtro do dashboard' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }, { value: '12m', label: '12 meses' }]} /></Field>}
        {isChart && <Field label="Tipo de gráfico"><Select value={x.config.chart ?? ''} onChange={e => setC({ chart: e.target.value as WidgetConfig['chart'] })} placeholder="Padrão" options={[{ value: 'area', label: 'Área' }, { value: 'line', label: 'Linha' }, { value: 'bar', label: 'Barras' }, { value: 'donut', label: 'Rosca' }]} /></Field>}
        {(isChart || w.type === 'kpi') && <>
          <Field label="Responsável"><Select value={x.config.ownerId ?? ''} onChange={e => setC({ ownerId: e.target.value || undefined })} placeholder="Todos" options={d.users.map(u => ({ value: u.id, label: u.name }))} /></Field>
          <Field label="Equipe"><Select value={x.config.teamId ?? ''} onChange={e => setC({ teamId: e.target.value || undefined })} placeholder="Todas" options={d.teams.map(t => ({ value: t.id, label: t.name }))} /></Field>
        </>}
        {w.type === 'tasks' && <Field label="Mostrar tarefas de"><Select value={x.config.ownerId ?? ''} onChange={e => setC({ ownerId: e.target.value || undefined })} options={[{ value: '', label: 'Somente minhas' }, { value: 'all', label: 'Toda a equipe' }]} /></Field>}
        {(isChart || w.type === 'kpi') && <Field label="Cor de destaque"><div className="row"><input type="color" className="color-input" value={x.config.color || '#7FA7B5'} onChange={e => setC({ color: e.target.value })} aria-label="Cor" />{x.config.color && <Button size="xs" variant="ghost" onClick={() => setC({ color: undefined })}>Usar padrão do tema</Button>}</div></Field>}
        <div className="form-section">Tamanho e visibilidade</div>
        <Field label={`Largura: ${x.w} de 12 colunas`}><input className="range" type="range" min={1} max={12} value={x.w} onChange={e => setX({ ...x, w: Number(e.target.value) })} /></Field>
        <Field label={`Altura: ${x.h} linha(s)`}><input className="range" type="range" min={1} max={6} value={x.h} onChange={e => setX({ ...x, h: Number(e.target.value) })} /></Field>
        <div className="full row wrap" style={{ gap: 18 }}>
          {(['desktop', 'tablet', 'mobile'] as const).map(dev => <label key={dev} className="check"><input type="checkbox" checked={x.visible[dev]} onChange={e => setX({ ...x, visible: { ...x.visible, [dev]: e.target.checked } })} />Exibir no {dev === 'desktop' ? 'desktop' : dev === 'tablet' ? 'tablet' : 'celular'}</label>)}
        </div>
        <div className="full row wrap" style={{ gap: 18 }}>
          <span className="row small"><Switch label="Bloquear posição" checked={!!x.locked} onChange={v => setX({ ...x, locked: v })} />Bloquear widget</span>
          {admin && <span className="row small"><Switch label="Obrigatório" checked={!!x.required} onChange={v => setX({ ...x, required: v })} />Obrigatório para a equipe (não pode ser removido)</span>}
        </div>
      </div>
    </Modal>
  );
}
const useTenantSafe = () => useTenant();

export function AddWidgetModal({ onClose, onAdd }: { onClose: () => void; onAdd: (w: Widget) => void }) {
  const groups = ['Indicadores', 'Gráficos', 'Listas', 'Layout'] as const;
  return (
    <Modal open onClose={onClose} size="xl" title="Adicionar widget" description="Escolha um componente. Depois você pode mover, redimensionar e configurar.">
      <div className="stack">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Indicadores (KPI)</div>
          <div className="choice-grid">
            {Object.entries(KPI_METRICS).map(([k, m]) => (
              <button key={k} className="choice" onClick={() => onAdd(newWidget('kpi', { title: m.label, config: { metric: k as KpiMetric, period: 'inherit', custom: k === 'custom' ? { entity: 'leads', agg: 'count' } : undefined } }))}><span className="t">{m.label}</span><span className="s">{k === 'custom' ? 'Monte sua própria métrica' : 'KPI com comparação'}</span></button>
            ))}
          </div>
        </div>
        {groups.slice(1).map(g => (
          <div key={g}>
            <div className="label" style={{ marginBottom: 8 }}>{g}</div>
            <div className="choice-grid">
              {(Object.entries(WIDGET_CATALOG) as [WidgetType, typeof WIDGET_CATALOG[WidgetType]][]).filter(([, c]) => c.group === g).map(([t, c]) => (
                <button key={t} className="choice" onClick={() => onAdd(newWidget(t))}><span className="t"><Plus size={13} /> {c.label}</span><span className="s">{c.description}</span></button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
