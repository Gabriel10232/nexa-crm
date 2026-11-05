import React, { useMemo, useState } from 'react';
import { Download, Printer, CalendarClock, Share2, BarChart3 } from 'lucide-react';
import type { TenantData, User } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { computeKpis, Filters, monthlySeries, periodRange, ranking, scoped, PERIOD_LABEL, funnel } from '../../services/metrics';
import { settings } from '../../services/crm';
import { PageHeader } from '../../components/common';
import { Button, Column, DataTable, Field, Modal, Select, Seg, Switch, Notice, SimBadge, Input, Empty } from '../../components/ui';
import { LineChart, Donut, HBars, Funnel } from '../../components/charts';
import { LEAD_STATUS } from '../../config/labels';
import { toast } from '../../store/ui';
import { daysBetween, download, groupCount, money, num, pct, toCSV, uid } from '../../lib/utils';

type Row = Record<string, string | number>;
interface Report { key: string; label: string; build: (d: TenantData, u: User, f: Filters, fin: boolean) => { kpis: [string, string, string?][]; chart: React.ReactNode; rows: Row[] } }

const inR = (iso: string | undefined, r: { from: number; to: number }) => !!iso && new Date(iso).getTime() >= r.from && new Date(iso).getTime() <= r.to;
const delta = (a: number, b: number) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(((a - b) / b) * 100).toFixed(0)}% vs anterior` : '');

const REPORTS: Report[] = [
  { key: 'sales', label: 'Vendas', build: (d, u, f, fin) => {
    const k = computeKpis(d, u, f), p = computeKpis(d, u, f, 1); const s = monthlySeries(d, u, f, 12);
    return { kpis: [['Receita realizada', fin ? money(k.won_revenue) : '•••', f.compare ? delta(k.won_revenue, p.won_revenue) : ''], ['Vendas', num(k.won_count), f.compare ? delta(k.won_count, p.won_count) : ''], ['Ticket médio', fin ? money(k.avg_ticket) : '•••']],
      chart: <LineChart money labels={s.map(x => x.label)} series={[{ name: 'Ganha', values: s.map(x => x.won) }, ...(f.compare ? [{ name: 'Perdida', values: s.map(x => x.lost), dashed: true, color: 'var(--chart-4)' }] : [])]} />,
      rows: s.map(x => ({ mes: x.label, receita: fin ? x.won : '•••', vendas: x.count, perdido: fin ? x.lost : '•••' })) };
  } },
  { key: 'conversion', label: 'Conversão', build: (d, u, f) => {
    const fu = funnel(d, u, f); const k = computeKpis(d, u, f);
    return { kpis: [['Taxa de conversão', pct(k.conversion)], ['Leads → qualificados', pct(fu[0].value ? (fu[1].value / fu[0].value) * 100 : 0)], ['Oportunidades ganhas', num(k.won_count)]], chart: <Funnel steps={fu} />, rows: fu.map((x, i) => ({ etapa: x.label, quantidade: x.value, conversao_da_anterior: i ? pct(fu[i - 1].value ? (x.value / fu[i - 1].value) * 100 : 0) : '—' })) };
  } },
  { key: 'sources', label: 'Origem dos leads', build: (d, u, f) => {
    const r = periodRange(f.period); const leads = scoped(d, u, d.leads).filter(l => inR(l.createdAt, r) || f.period === '12m');
    const g = groupCount(leads, l => l.source); const conv = groupCount(leads.filter(l => l.status === 'convertido'), l => l.source);
    const data = Object.entries(g).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { kpis: [['Leads no período', num(leads.length)], ['Principal origem', data[0]?.label ?? '—'], ['Origens ativas', num(data.length)]], chart: <Donut data={data} />, rows: data.map(x => ({ origem: x.label, leads: x.value, convertidos: conv[x.label] ?? 0, taxa: pct(((conv[x.label] ?? 0) / x.value) * 100) })) };
  } },
  { key: 'seller', label: 'Por vendedor', build: (d, u, f, fin) => {
    const r = ranking(d, u, f);
    return { kpis: [['Vendedores', num(r.length)], ['Líder', r[0]?.user.name ?? '—'], ['Receita do líder', fin ? money(r[0]?.revenue ?? 0) : '•••']], chart: <HBars money={fin} data={r.map(x => ({ label: x.user.name, value: fin ? x.revenue : x.count }))} />, rows: r.map(x => ({ vendedor: x.user.name, vendas: x.count, receita: fin ? x.revenue : '•••' })) };
  } },
  { key: 'team', label: 'Por equipe', build: (d, u, f, fin) => {
    const rows = d.teams.map(t => { const k = computeKpis(d, u, { ...f, teamId: t.id }); return { equipe: t.name, receita: fin ? k.won_revenue : '•••', vendas: k.won_count, conversao: pct(k.conversion), pipeline: fin ? k.pipeline_value : '•••' }; });
    return { kpis: [['Equipes', num(d.teams.length)]], chart: <HBars money={fin} data={d.teams.map(t => ({ label: t.name, value: computeKpis(d, u, { ...f, teamId: t.id })[fin ? 'won_revenue' : 'won_count'] }))} />, rows };
  } },
  { key: 'lost', label: 'Oportunidades perdidas', build: (d, u, f, fin) => {
    const r = periodRange(f.period); const lost = scoped(d, u, d.deals).filter(x => x.status === 'lost' && inR(x.closedAt, r));
    const g = groupCount(lost, x => x.lostReason ?? 'Não informado'); const data = Object.entries(g).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    return { kpis: [['Perdidas', num(lost.length)], ['Valor perdido', fin ? money(lost.reduce((a, x) => a + x.value, 0)) : '•••'], ['Principal motivo', data[0]?.label ?? '—']], chart: data.length ? <HBars data={data} /> : <Empty compact title="Nenhuma perda no período" />, rows: lost.map(x => ({ oportunidade: x.name, motivo: x.lostReason ?? '—', valor: fin ? x.value : '•••', data: x.closedAt?.slice(0, 10) ?? '' })) };
  } },
  { key: 'cycle', label: 'Tempo médio de fechamento', build: (d, u, f) => {
    const s = monthlySeries(d, u, f, 12); const won = scoped(d, u, d.deals).filter(x => x.status === 'won' && x.closedAt);
    const by = s.map(m => { const w = won.filter(x => x.closedAt!.slice(0, 7) === m.key); return w.length ? w.reduce((a, x) => a + daysBetween(x.openedAt, x.closedAt!), 0) / w.length : 0; });
    return { kpis: [['Ciclo médio (período)', `${num(computeKpis(d, u, f).avg_cycle)} dias`]], chart: <LineChart type="line" labels={s.map(x => x.label)} series={[{ name: 'Dias até fechar', values: by }]} />, rows: s.map((m, i) => ({ mes: m.label, ciclo_medio_dias: Math.round(by[i]) })) };
  } },
  { key: 'revenue', label: 'Receita', build: (d, u, f, fin) => {
    const k = computeKpis(d, u, f); const s = monthlySeries(d, u, f, 12); let acc = 0; const cum = s.map(x => (acc += x.won));
    return { kpis: [['Realizada', fin ? money(k.won_revenue) : '•••'], ['Prevista (ponderada)', fin ? money(k.forecast) : '•••'], ['Pipeline', fin ? money(k.pipeline_value) : '•••']], chart: fin ? <LineChart money labels={s.map(x => x.label)} series={[{ name: 'Acumulada 12m', values: cum }]} /> : <Notice>Sem acesso a dados financeiros.</Notice>, rows: s.map((x, i) => ({ mes: x.label, receita: fin ? x.won : '•••', acumulada: fin ? cum[i] : '•••' })) };
  } },
  { key: 'activities', label: 'Atividades', build: (d, u, f) => {
    const r = periodRange(f.period); const acts = d.activities.filter(a => inR(a.at, r) && ['call', 'email', 'whatsapp', 'meeting', 'note', 'message'].includes(a.type));
    const g = groupCount(acts, a => a.type); const labels: Record<string, string> = { call: 'Ligações', email: 'E-mails', whatsapp: 'WhatsApp', meeting: 'Reuniões', note: 'Notas', message: 'Mensagens' };
    const data = Object.entries(g).map(([k, v]) => ({ label: labels[k] ?? k, value: v }));
    return { kpis: [['Atividades', num(acts.length)], ['Média por dia', num(acts.length / Math.max(1, (r.to - r.from) / 864e5), 1)]], chart: <Donut data={data} />, rows: data.map(x => ({ tipo: x.label, quantidade: x.value })) };
  } },
  { key: 'productivity', label: 'Produtividade', build: (d, u, f) => {
    const r = periodRange(f.period);
    const rows = d.users.filter(x => ['seller', 'manager', 'supervisor', 'support'].includes(x.role)).map(x => ({ usuario: x.name, atividades: d.activities.filter(a => a.userId === x.id && inR(a.at, r)).length, tarefas_concluidas: d.tasks.filter(t => t.ownerId === x.id && t.done && inR(t.doneAt, r)).length, tarefas_atrasadas: d.tasks.filter(t => t.ownerId === x.id && !t.done && new Date(t.due) < new Date()).length, reunioes: d.events.filter(e => e.ownerId === x.id && inR(e.start, r)).length }));
    return { kpis: [['Tarefas concluídas', num(rows.reduce((a, x) => a + x.tarefas_concluidas, 0))], ['Atrasadas', num(rows.reduce((a, x) => a + x.tarefas_atrasadas, 0))]], chart: <LineChart type="bar" labels={rows.map(x => x.usuario.split(' ')[0])} series={[{ name: 'Atividades', values: rows.map(x => x.atividades) }, { name: 'Tarefas concluídas', values: rows.map(x => x.tarefas_concluidas), color: 'var(--chart-3)' }]} />, rows };
  } },
  { key: 'retention', label: 'Retenção', build: (d, u, f, fin) => {
    const customers = d.companies.filter(c => c.category === 'cliente');
    const repeat = customers.filter(c => d.deals.filter(x => x.companyId === c.id && x.status === 'won').length > 1);
    const renew = d.deals.filter(x => x.pipelineId === 'pipe_renew');
    return { kpis: [['Clientes ativos', num(customers.length)], ['Recompra', pct(customers.length ? (repeat.length / customers.length) * 100 : 0)], ['Renovações abertas', num(renew.filter(x => x.status === 'open').length)]], chart: <Donut data={[{ label: 'Recorrentes', value: repeat.length }, { label: 'Compra única', value: customers.length - repeat.length }]} />, rows: customers.map(c => ({ cliente: c.tradeName, compras: d.deals.filter(x => x.companyId === c.id && x.status === 'won').length, receita: fin ? d.deals.filter(x => x.companyId === c.id && x.status === 'won').reduce((a, x) => a + x.value, 0) : '•••' })) };
  } },
  { key: 'inactive', label: 'Clientes inativos', build: d => {
    const rows = d.companies.filter(c => c.category === 'cliente').map(c => { const last = d.activities.filter(a => a.refs.companyId === c.id).map(a => a.at).sort().pop(); return { cliente: c.tradeName, ultimo_contato: last?.slice(0, 10) ?? 'nunca', dias_sem_contato: last ? daysBetween(last) : 999 }; }).sort((a, b) => b.dias_sem_contato - a.dias_sem_contato);
    const inactive = rows.filter(r => r.dias_sem_contato >= 30);
    return { kpis: [['Inativos (30+ dias)', num(inactive.length)], ['Clientes', num(rows.length)]], chart: <HBars data={rows.slice(0, 8).map(r => ({ label: r.cliente, value: Math.min(r.dias_sem_contato, 365), sub: 'dias' }))} />, rows };
  } },
];

export default function Reports() {
  const d = useTenant(); const { user, can } = useSession();
  const [key, setKey] = useState('sales');
  const [f, setF] = useState<Filters>({ period: '90d', compare: true });
  const [schedule, setSchedule] = useState(false);
  const [share, setShare] = useState(false);
  const rep = REPORTS.find(r => r.key === key)!;
  const out = useMemo(() => rep.build(d, user, f, can('financial')), [rep, d, user, f]); // eslint-disable-line
  const cols: Column<Row & { id: string }>[] = out.rows.length ? Object.keys(out.rows[0]).map(k => ({ key: k, label: k.replace(/_/g, ' '), sort: r => r[k] as string, render: r => typeof r[k] === 'number' && /receita|valor|pipeline|perdido|acumulada/.test(k) ? money(r[k] as number) : String(r[k]) })) : [];
  const rows = out.rows.map((r, i) => ({ ...r, id: String(i) }));
  const exportCsv = () => { if (!can('export')) { toast('error', 'Sem permissão para exportar'); return; } download(`relatorio-${rep.key}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(out.rows)); toast('success', 'CSV exportado'); };

  return (
    <div>
      <PageHeader title="Relatórios e analytics" desc={`${rep.label} · ${PERIOD_LABEL[f.period]}`} crumbs={[{ label: 'Início', to: '/' }, { label: 'Relatórios' }]}
        actions={<>
          <Button onClick={() => setShare(true)}><Share2 />Compartilhar</Button>
          <Button onClick={() => setSchedule(true)}><CalendarClock />Agendar</Button>
          <Button onClick={() => window.print()}><Printer />PDF</Button>
          <Button variant="primary" onClick={exportCsv}><Download />CSV</Button>
        </>} />
      <div className="grid report-layout">
        <nav className="card no-print" style={{ padding: 8 }} aria-label="Relatórios">
          <div className="nav">{REPORTS.map(r => <a key={r.key} href="#" className={r.key === key ? 'active' : ''} onClick={e => { e.preventDefault(); setKey(r.key); }}><BarChart3 /><span>{r.label}</span></a>)}</div>
        </nav>
        <div className="stack">
          <div className="toolbar no-print" style={{ marginBottom: 0 }}>
            <Seg label="Período" value={f.period} onChange={v => setF({ ...f, period: v })} options={[{ value: '30d', label: '30d' }, { value: 'mtd', label: 'Mês' }, { value: '90d', label: '90d' }, { value: '12m', label: '12m' }]} />
            <Select aria-label="Equipe" value={f.teamId ?? ''} onChange={e => setF({ ...f, teamId: e.target.value || undefined })} placeholder="Todas as equipes" options={d.teams.map(t => ({ value: t.id, label: t.name }))} style={{ width: 190, height: 36 }} />
            <Select aria-label="Vendedor" value={f.ownerId ?? ''} onChange={e => setF({ ...f, ownerId: e.target.value || undefined })} placeholder="Todos os vendedores" options={d.users.filter(u => ['seller', 'manager', 'supervisor'].includes(u.role)).map(u => ({ value: u.id, label: u.name }))} style={{ width: 190, height: 36 }} />
            <Select aria-label="Origem" value={f.source ?? ''} onChange={e => setF({ ...f, source: e.target.value || undefined })} placeholder="Todas as origens" options={d.org.sources} style={{ width: 170, height: 36 }} />
            <span className="row small"><Switch label="Comparar períodos" checked={f.compare} onChange={v => setF({ ...f, compare: v })} />Comparar</span>
          </div>
          <div className="grid g3">{out.kpis.map(([l, v, s]) => <div key={l} className="card"><div className="kpi"><span className="label">{l}</span><span className="value" style={{ fontSize: 'calc(var(--fs-num) * .85)' }}>{v}</span>{s && <span className={`delta ${s.startsWith('▲') ? 'up' : 'down'}`}>{s}</span>}</div></div>)}</div>
          <div className="card" style={{ minHeight: 320, display: 'flex', flexDirection: 'column' }}><div className="card-head"><h3>{rep.label}</h3></div><div style={{ flex: 1, minHeight: 260 }}>{out.chart}</div></div>
          <div className="card" style={{ padding: 6 }}><DataTable rows={rows} columns={cols} pageSize={10} empty={<Empty compact title="Sem dados para os filtros" />} /></div>
        </div>
      </div>
      {schedule && <ScheduleModal report={rep.label} onClose={() => setSchedule(false)} />}
      {share && <ShareModal report={rep.label} onClose={() => setShare(false)} />}
    </div>
  );
}

function ScheduleModal({ report, onClose }: { report: string; onClose: () => void }) {
  const [freq, setFreq] = useState('weekly'); const [email, setEmail] = useState('');
  return (
    <Modal open onClose={onClose} title={`Agendar relatório: ${report}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => { settings.patch(() => {}, `Agendou relatório ${report} (${freq})`); toast('warning', 'Agendamento salvo (simulado)', 'E-mail transacional não conectado — o envio automático ficará ativo após a integração.'); onClose(); }}>Agendar</Button></>}>
      <div className="stack">
        <Field label="Frequência"><Select value={freq} onChange={e => setFreq(e.target.value)} options={[{ value: 'daily', label: 'Diário' }, { value: 'weekly', label: 'Semanal (segunda, 8h)' }, { value: 'monthly', label: 'Mensal (dia 1)' }]} /></Field>
        <Field label="Destinatários" hint="Separe por vírgula"><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="gestor@empresa.com" /></Field>
        <Notice tone="warning">Envio por e-mail requer integração <SimBadge>não conectada</SimBadge></Notice>
      </div>
    </Modal>
  );
}

function ShareModal({ report, onClose }: { report: string; onClose: () => void }) {
  const d = useTenant(); const managers = d.users.filter(u => ['owner', 'admin', 'manager', 'supervisor'].includes(u.role));
  const [sel, setSel] = useState<string[]>([]);
  return (
    <Modal open onClose={onClose} title={`Compartilhar: ${report}`} description="Gestores recebem uma notificação no CRM com o link do relatório." footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!sel.length} onClick={() => { settings.patch(t => { t.notifications = [{ id: uid('nt'), at: new Date().toISOString(), title: `Relatório compartilhado: ${report}`, body: `Com ${sel.length} gestor(es)`, read: false, link: '/reports', kind: 'info' }, ...t.notifications]; }, `Compartilhou relatório ${report}`); toast('success', 'Relatório compartilhado', `${sel.length} gestor(es) notificado(s).`); onClose(); }}>Compartilhar</Button></>}>
      <div className="stack-sm">{managers.map(u => <label key={u.id} className="check"><input type="checkbox" checked={sel.includes(u.id)} onChange={e => setSel(e.target.checked ? [...sel, u.id] : sel.filter(x => x !== u.id))} />{u.name} <span className="muted xs">{u.title}</span></label>)}</div>
    </Modal>
  );
}
