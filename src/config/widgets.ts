import type { DashboardLayout, KpiMetric, RoleKey, Widget, WidgetType } from '../types';
import { uid } from '../lib/utils';

export const KPI_METRICS: Record<KpiMetric, { label: string; money?: boolean; pct?: boolean; suffix?: string; financial?: boolean }> = {
  total_leads: { label: 'Total de leads' },
  new_leads: { label: 'Novos leads' },
  qualified_leads: { label: 'Leads qualificados' },
  people: { label: 'Pessoas cadastradas' },
  companies: { label: 'Empresas cadastradas' },
  open_deals: { label: 'Oportunidades abertas' },
  pipeline_value: { label: 'Valor do pipeline', money: true, financial: true },
  forecast: { label: 'Receita prevista', money: true, financial: true },
  won_revenue: { label: 'Receita realizada', money: true, financial: true },
  conversion: { label: 'Taxa de conversão', pct: true },
  avg_ticket: { label: 'Ticket médio', money: true, financial: true },
  avg_cycle: { label: 'Ciclo médio de vendas', suffix: ' dias' },
  won_count: { label: 'Oportunidades ganhas' },
  lost_count: { label: 'Oportunidades perdidas' },
  pending_activities: { label: 'Atividades pendentes' },
  proposals_sent: { label: 'Propostas enviadas' },
  proposals_accepted: { label: 'Propostas aceitas' },
  custom: { label: 'Indicador personalizado' },
};

export const WIDGET_CATALOG: Record<WidgetType, { label: string; description: string; w: number; h: number; group: 'Indicadores' | 'Gráficos' | 'Listas' | 'Layout' }> = {
  kpi: { label: 'Indicador (KPI)', description: 'Número-chave com comparação ao período anterior.', w: 3, h: 1, group: 'Indicadores' },
  chart_sales: { label: 'Evolução das vendas', description: 'Receita ganha por mês.', w: 8, h: 3, group: 'Gráficos' },
  chart_funnel: { label: 'Funil de conversão', description: 'Leads → oportunidades → ganhos.', w: 4, h: 3, group: 'Gráficos' },
  chart_sources: { label: 'Leads por origem', description: 'Distribuição por canal de aquisição.', w: 4, h: 3, group: 'Gráficos' },
  chart_status: { label: 'Leads por status', description: 'Quantidade em cada status.', w: 4, h: 3, group: 'Gráficos' },
  chart_forecast: { label: 'Previsão de receita', description: 'Ponderada por probabilidade, próximos meses.', w: 6, h: 3, group: 'Gráficos' },
  chart_pipeline: { label: 'Pipeline de vendas', description: 'Valor por etapa do funil.', w: 6, h: 3, group: 'Gráficos' },
  goals: { label: 'Metas', description: 'Progresso da meta mensal.', w: 4, h: 3, group: 'Listas' },
  ranking: { label: 'Ranking de vendedores', description: 'Receita ganha por vendedor.', w: 4, h: 3, group: 'Listas' },
  meetings: { label: 'Próximas reuniões', description: 'Agenda dos próximos dias.', w: 4, h: 3, group: 'Listas' },
  no_contact: { label: 'Leads sem contato', description: 'Leads parados há mais de 7 dias.', w: 4, h: 3, group: 'Listas' },
  stale_deals: { label: 'Oportunidades paradas', description: 'Sem mudança de etapa há 14+ dias.', w: 4, h: 3, group: 'Listas' },
  recent_customers: { label: 'Clientes recentes', description: 'Últimos clientes convertidos.', w: 4, h: 3, group: 'Listas' },
  tasks: { label: 'Lista de tarefas', description: 'Tarefas pendentes com conclusão rápida.', w: 4, h: 3, group: 'Listas' },
  timeline: { label: 'Timeline de atividades', description: 'Últimas interações registradas.', w: 4, h: 3, group: 'Listas' },
  inbox: { label: 'Caixa de entrada', description: 'Conversas não lidas.', w: 4, h: 3, group: 'Listas' },
  notes: { label: 'Anotações rápidas', description: 'Bloco de notas pessoal, salvo automaticamente.', w: 4, h: 2, group: 'Listas' },
  section: { label: 'Seção / título', description: 'Divide o dashboard em áreas.', w: 12, h: 1, group: 'Layout' },
};

export const newWidget = (type: WidgetType, over: Partial<Widget> = {}): Widget => ({
  id: uid('w'),
  type,
  title: over.title ?? WIDGET_CATALOG[type].label,
  w: WIDGET_CATALOG[type].w,
  h: WIDGET_CATALOG[type].h,
  visible: { desktop: true, tablet: true, mobile: true },
  config: { period: 'inherit', chart: type === 'chart_sales' ? 'area' : undefined },
  ...over,
});

const kpi = (metric: KpiMetric, over: Partial<Widget> = {}) =>
  newWidget('kpi', { title: KPI_METRICS[metric].label, config: { metric, period: 'inherit' }, ...over });

export function defaultExecutiveWidgets(): Widget[] {
  return [
    kpi('forecast'), kpi('won_revenue'), kpi('pipeline_value'), kpi('conversion'),
    newWidget('chart_sales', { w: 8, h: 3 }),
    newWidget('goals', { w: 4, h: 3, required: true }),
    kpi('total_leads'), kpi('qualified_leads'), kpi('avg_ticket'), kpi('avg_cycle'),
    newWidget('chart_funnel', { w: 4 }), newWidget('chart_sources', { w: 4 }), newWidget('ranking', { w: 4 }),
    newWidget('section', { title: 'Operação do dia', description: 'Atividades e alertas que pedem ação' }),
    kpi('won_count', { w: 3 }), kpi('lost_count', { w: 3 }), kpi('pending_activities', { w: 3 }), kpi('open_deals', { w: 3 }),
    newWidget('chart_forecast', { w: 6 }), newWidget('chart_pipeline', { w: 6 }),
    newWidget('meetings'), newWidget('stale_deals'), newWidget('no_contact'),
  ];
}

function sellerWidgets(): Widget[] {
  return [
    kpi('open_deals'), kpi('pipeline_value'), kpi('pending_activities'), kpi('conversion'),
    newWidget('tasks', { w: 6, h: 3 }), newWidget('meetings', { w: 6, h: 3 }),
    newWidget('no_contact', { w: 6 }), newWidget('stale_deals', { w: 6 }),
    newWidget('notes', { w: 12, h: 2 }),
  ];
}
function supportWidgets(): Widget[] {
  return [
    kpi('people'), kpi('companies'), kpi('pending_activities'), kpi('new_leads'),
    newWidget('inbox', { w: 6, h: 3 }), newWidget('tasks', { w: 6, h: 3 }),
    newWidget('timeline', { w: 6 }), newWidget('recent_customers', { w: 6 }),
  ];
}
function analystWidgets(): Widget[] {
  return [
    kpi('conversion'), kpi('avg_ticket'), kpi('avg_cycle'), kpi('won_revenue'),
    newWidget('chart_sales', { w: 12, h: 3, config: { chart: 'bar', period: 'inherit' } }),
    newWidget('chart_status', { w: 4 }), newWidget('chart_sources', { w: 4 }), newWidget('chart_funnel', { w: 4 }),
  ];
}

export function defaultDashboards(): DashboardLayout[] {
  const t = new Date().toISOString();
  const mk = (id: string, name: string, roles: RoleKey[], widgets: Widget[], isDefault = false): DashboardLayout =>
    ({ id, name, roles, widgets, isDefault, allowPersonal: true, shared: true, updatedAt: t });
  return [
    mk('dash_exec', 'Executivo', ['owner', 'admin', 'manager', 'supervisor'], defaultExecutiveWidgets(), true),
    mk('dash_seller', 'Vendedor', ['seller'], sellerWidgets()),
    mk('dash_support', 'Atendimento', ['support'], supportWidgets()),
    mk('dash_analyst', 'Financeiro & Análise', ['analyst', 'readonly'], analystWidgets()),
  ];
}
