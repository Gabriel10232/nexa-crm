import type { Goal, KpiMetric, TenantData, User, WidgetConfig } from '../types';
import { can } from '../config/permissions';
import { DAY, daysBetween, monthKey } from '../lib/utils';

export interface Filters { period: '7d' | '30d' | '90d' | '12m' | 'mtd'; teamId?: string; ownerId?: string; source?: string; compare: boolean }
export const PERIOD_LABEL: Record<Filters['period'], string> = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', mtd: 'Este mês', '90d': 'Últimos 90 dias', '12m': 'Últimos 12 meses' };

export function periodRange(p: Filters['period'], shift = 0) {
  const now = new Date();
  if (p === 'mtd') {
    const from = new Date(now.getFullYear(), now.getMonth() - shift, 1);
    const to = shift ? new Date(now.getFullYear(), now.getMonth() - shift + 1, 1) : now;
    return { from: from.getTime(), to: to.getTime() };
  }
  const days = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }[p];
  const to = now.getTime() - shift * days * DAY;
  return { from: to - days * DAY, to };
}

/** Row-level security: users without `otherTeams` only see records owned by their team. */
export function scoped<T extends { ownerId: string }>(d: TenantData, user: User, rows: T[]): T[] {
  if (can(user.role, 'otherTeams')) return rows;
  const teamUsers = new Set(d.users.filter(u => u.teamId === user.teamId).map(u => u.id));
  return rows.filter(r => teamUsers.has(r.ownerId));
}

function ownerFilter(d: TenantData, f: Partial<Filters>) {
  const teamUsers = f.teamId ? new Set(d.users.filter(u => u.teamId === f.teamId).map(u => u.id)) : null;
  return (ownerId: string) => (!f.ownerId || ownerId === f.ownerId) && (!teamUsers || teamUsers.has(ownerId));
}

const inRange = (iso: string | undefined, r: { from: number; to: number }) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= r.from && t <= r.to; };

export function computeKpis(d: TenantData, user: User, f: Partial<Filters> & { period: Filters['period'] }, shift = 0): Record<KpiMetric, number> {
  const r = periodRange(f.period, shift);
  const own = ownerFilter(d, f);
  const leads = scoped(d, user, d.leads).filter(l => !l.archivedAt && own(l.ownerId) && (!f.source || l.source === f.source));
  const deals = scoped(d, user, d.deals).filter(x => !x.archivedAt && own(x.ownerId) && (!f.source || x.source === f.source));
  const open = deals.filter(x => x.status === 'open');
  const won = deals.filter(x => x.status === 'won' && inRange(x.closedAt, r));
  const lost = deals.filter(x => x.status === 'lost' && inRange(x.closedAt, r));
  const wonRev = won.reduce((a, x) => a + x.value, 0);
  const tasks = scoped(d, user, d.tasks).filter(t => own(t.ownerId));
  const leadsUntil = leads.filter(l => new Date(l.createdAt).getTime() <= r.to);
  return {
    total_leads: leadsUntil.length,
    new_leads: leads.filter(l => inRange(l.createdAt, r)).length,
    qualified_leads: leadsUntil.filter(l => ['qualificado', 'reuniao', 'proposta', 'convertido'].includes(l.status)).length,
    people: scoped(d, user, d.people).filter(p => !p.archivedAt && new Date(p.createdAt).getTime() <= r.to).length,
    companies: scoped(d, user, d.companies).filter(c => !c.archivedAt && new Date(c.createdAt).getTime() <= r.to).length,
    open_deals: shift ? open.filter(x => new Date(x.openedAt).getTime() <= r.to).length : open.length,
    pipeline_value: (shift ? open.filter(x => new Date(x.openedAt).getTime() <= r.to) : open).reduce((a, x) => a + x.value, 0),
    forecast: (shift ? open.filter(x => new Date(x.openedAt).getTime() <= r.to) : open).reduce((a, x) => a + (x.value * x.probability) / 100, 0),
    won_revenue: wonRev,
    conversion: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0,
    avg_ticket: won.length ? wonRev / won.length : 0,
    avg_cycle: won.length ? won.reduce((a, x) => a + daysBetween(x.openedAt, x.closedAt!), 0) / won.length : 0,
    won_count: won.length,
    lost_count: lost.length,
    pending_activities: tasks.filter(t => !t.done && (shift ? new Date(t.due).getTime() <= r.to : true)).length,
    proposals_sent: d.proposals.filter(p => inRange(p.sentAt, r)).length,
    proposals_accepted: d.proposals.filter(p => p.status === 'aceita' && inRange(p.sentAt, r)).length,
    custom: 0,
  };
}

export function customMetric(d: TenantData, user: User, c: NonNullable<WidgetConfig['custom']>) {
  const src: Record<string, unknown>[] = ({
    leads: scoped(d, user, d.leads).filter(l => !l.archivedAt), deals: scoped(d, user, d.deals), people: scoped(d, user, d.people),
    companies: scoped(d, user, d.companies), tasks: scoped(d, user, d.tasks),
  } as unknown as Record<string, Record<string, unknown>[]>)[c.entity] ?? [];
  const rows = c.filterField ? src.filter(r => String(r[c.filterField!] ?? '') === c.filterValue) : src;
  return c.agg === 'sum' && c.field ? rows.reduce((a, r) => a + (Number(r[c.field!]) || 0), 0) : rows.length;
}

export function monthlySeries(d: TenantData, user: User, f: Partial<Filters>, months = 12) {
  const own = ownerFilter(d, f);
  const deals = scoped(d, user, d.deals).filter(x => own(x.ownerId) && (!f.source || x.source === f.source));
  const now = new Date();
  const out: { key: string; label: string; won: number; lost: number; count: number; prev: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(dt);
    const w = deals.filter(x => x.status === 'won' && x.closedAt && monthKey(x.closedAt) === k);
    out.push({
      key: k, label: dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      won: w.reduce((a, x) => a + x.value, 0), count: w.length,
      lost: deals.filter(x => x.status === 'lost' && x.closedAt && monthKey(x.closedAt) === k).reduce((a, x) => a + x.value, 0),
      prev: 0,
    });
  }
  return out;
}

export function forecastSeries(d: TenantData, user: User, f: Partial<Filters>) {
  const own = ownerFilter(d, f);
  const open = scoped(d, user, d.deals).filter(x => x.status === 'open' && own(x.ownerId));
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() + i, 1); const k = monthKey(dt);
    const inMonth = open.filter(x => (i === 0 ? monthKey(x.expectedClose) <= k : monthKey(x.expectedClose) === k));
    return { label: dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), weighted: inMonth.reduce((a, x) => a + x.value * x.probability / 100, 0), total: inMonth.reduce((a, x) => a + x.value, 0) };
  });
}

export function funnel(d: TenantData, user: User, f: Partial<Filters> & { period: Filters['period'] }) {
  const r = periodRange(f.period === '7d' ? '30d' : f.period);
  const own = ownerFilter(d, f);
  const leads = scoped(d, user, d.leads).filter(l => own(l.ownerId) && !l.archivedAt);
  const deals = scoped(d, user, d.deals).filter(x => own(x.ownerId));
  const L = leads.length;
  const Q = leads.filter(l => ['qualificado', 'reuniao', 'proposta', 'convertido'].includes(l.status)).length;
  const O = deals.filter(x => x.status === 'open' || inRange(x.closedAt, r)).length;
  const P = d.proposals.length;
  const W = deals.filter(x => x.status === 'won' && inRange(x.closedAt, r)).length;
  return [{ label: 'Leads', value: L }, { label: 'Qualificados', value: Q }, { label: 'Oportunidades', value: O }, { label: 'Propostas', value: P }, { label: 'Ganhos', value: W }];
}

export function ranking(d: TenantData, user: User, f: Partial<Filters> & { period: Filters['period'] }) {
  const r = periodRange(f.period);
  const deals = scoped(d, user, d.deals);
  return d.users.filter(u => ['seller', 'manager', 'supervisor'].includes(u.role) && (!f.teamId || u.teamId === f.teamId))
    .map(u => {
      const won = deals.filter(x => x.ownerId === u.id && x.status === 'won' && inRange(x.closedAt, r));
      return { user: u, revenue: won.reduce((a, x) => a + x.value, 0), count: won.length };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function goalProgress(d: TenantData, g: Goal) {
  const users = g.scope === 'user' ? [g.targetId] : g.scope === 'team' ? d.users.filter(u => u.teamId === g.targetId).map(u => u.id)
    : g.scope === 'department' ? d.users.filter(u => d.teams.find(t => t.id === u.teamId)?.department === g.targetId).map(u => u.id) : d.users.map(u => u.id);
  const set = new Set(users);
  const inP = (iso?: string) => !!iso && monthKey(iso) === g.period;
  const won = d.deals.filter(x => x.status === 'won' && set.has(x.ownerId) && inP(x.closedAt));
  let value = 0;
  switch (g.metric) {
    case 'revenue': value = won.reduce((a, x) => a + x.value, 0); break;
    case 'sales': case 'wonDeals': value = won.length; break;
    case 'meetings': value = d.events.filter(e => ['reuniao', 'demonstracao', 'visita'].includes(e.type) && set.has(e.ownerId) && inP(e.start)).length; break;
    case 'contacts': value = d.activities.filter(a => ['call', 'email', 'whatsapp', 'meeting'].includes(a.type) && set.has(a.userId) && inP(a.at)).length; break;
    case 'newCustomers': value = new Set(won.map(x => x.companyId ?? x.personId)).size; break;
  }
  const now = new Date(); const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expected = (now.getDate() / daysInMonth) * g.target;
  return { value, pct: g.target ? (value / g.target) * 100 : 0, onTrack: value >= expected * 0.9, expected };
}

export function staleDeals(d: TenantData, user: User, days = 14) {
  return scoped(d, user, d.deals).filter(x => x.status === 'open' && !x.archivedAt && daysBetween(x.stageEnteredAt) >= days)
    .sort((a, b) => daysBetween(b.stageEnteredAt) - daysBetween(a.stageEnteredAt));
}

export function leadsWithoutContact(d: TenantData, user: User, days = 7) {
  return scoped(d, user, d.leads).filter(l => !l.archivedAt && !['convertido', 'perdido', 'desqualificado'].includes(l.status) && daysBetween(l.lastContactAt ?? l.createdAt) >= days)
    .sort((a, b) => daysBetween(b.lastContactAt ?? b.createdAt) - daysBetween(a.lastContactAt ?? a.createdAt));
}
