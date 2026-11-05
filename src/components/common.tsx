/* Shared CRM building blocks: page header, lookups, timeline, pickers. */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, X } from 'lucide-react';
import type { Activity, Refs, TenantData } from '../types';
import { useTenant } from '../store/store';
import { ACTIVITY } from '../config/labels';
import { Avatar, Badge, Empty, Icon, Select, SimBadge, Button } from './ui';
import { cx, fmtDateTime, relTime, money } from '../lib/utils';
import { useSession } from '../services/auth';

export function PageHeader({ title, desc, crumbs, actions, children }: { title: React.ReactNode; desc?: React.ReactNode; crumbs?: { label: string; to?: string }[]; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div style={{ minWidth: 0 }}>
        {crumbs && (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={12} />}
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {desc && <p className="desc">{desc}</p>}
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/* ---------- Lookups ---------- */
/** One set of lookup maps per tenant-data version, shared by every row/card on screen. */
const lookupCache = new WeakMap<TenantData, ReturnType<typeof buildLookups>>();
export function useLookups() {
  const d = useTenant();
  let l = lookupCache.get(d);
  if (!l) { l = buildLookups(d); lookupCache.set(d, l); }
  return l;
}
function buildLookups(d: TenantData) {
  return (() => {
    const users = new Map(d.users.map(u => [u.id, u]));
    const people = new Map(d.people.map(p => [p.id, p]));
    const companies = new Map(d.companies.map(c => [c.id, c]));
    const deals = new Map(d.deals.map(x => [x.id, x]));
    const leads = new Map(d.leads.map(x => [x.id, x]));
    const stages = new Map(d.pipelines.flatMap(p => p.stages.map(s => [s.id, { ...s, pipeline: p }] as const)));
    const tagColor = (n: string) => d.tags.find(t => t.name === n)?.color;
    return { users, people, companies, deals, leads, stages, tagColor, user: (id?: string) => (id ? users.get(id) : undefined) };
  })();
}

export const UserChip = ({ id }: { id?: string }) => {
  const { users } = useLookups(); const u = id ? users.get(id) : undefined;
  if (!u) return <span className="muted">—</span>;
  return <span className="row" style={{ gap: 8, minWidth: 0 }}><Avatar name={u.name} color={u.color} size="sm" /><span className="ellipsis">{u.name}</span></span>;
};

export function Money({ v, compact }: { v: number; compact?: boolean }) {
  const { can } = useSession();
  if (!can('financial')) return <span className="muted" title="Sem permissão para dados financeiros">R$ •••</span>;
  return <span className="num">{money(v, compact)}</span>;
}

export function RefLinks({ refs }: { refs: Refs }) {
  const L = useLookups();
  const items: { to: string; label: string }[] = [];
  if (refs.personId && L.people.get(refs.personId)) items.push({ to: `/people/${refs.personId}`, label: L.people.get(refs.personId)!.name });
  if (refs.companyId && L.companies.get(refs.companyId)) items.push({ to: `/companies/${refs.companyId}`, label: L.companies.get(refs.companyId)!.tradeName });
  if (refs.dealId && L.deals.get(refs.dealId)) items.push({ to: `/opportunities/${refs.dealId}`, label: L.deals.get(refs.dealId)!.name });
  if (refs.leadId && L.leads.get(refs.leadId)) items.push({ to: `/leads/${refs.leadId}`, label: `Lead: ${L.leads.get(refs.leadId)!.name}` });
  if (!items.length) return null;
  return <>{items.map(i => <Link key={i.to} to={i.to} className="muted" style={{ textDecoration: 'underline', textDecorationColor: 'var(--line-strong)' }}>{i.label}</Link>)}</>;
}

const TONE: Record<string, string> = { call: '', email: '', whatsapp: 'success', meeting: '', note: 'neutral', file: 'neutral', proposal: 'warning', deal: 'success', status: 'warning', change: 'neutral', task: '', system: 'neutral', message: '' };

export function Timeline({ items, showRefs = true, emptyText = 'Nenhuma interação registrada ainda.' }: { items: Activity[]; showRefs?: boolean; emptyText?: string }) {
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(15);
  const L = useLookups();
  const list = items.filter(a => !filter || a.type === filter);
  const types = Array.from(new Set(items.map(a => a.type)));
  return (
    <div>
      {items.length > 3 && (
        <div className="row wrap" style={{ marginBottom: 8 }}>
          <Select value={filter} onChange={e => setFilter(e.target.value)} options={types.map(t => ({ value: t, label: ACTIVITY[t].label }))} placeholder="Todos os tipos" style={{ width: 200, height: 34 }} aria-label="Filtrar timeline" />
          <span className="muted small">{list.length} registro(s)</span>
        </div>
      )}
      {!list.length ? <Empty compact title="Sem histórico" text={emptyText} /> : (
        <div className="timeline">
          {list.slice(0, limit).map(a => (
            <div key={a.id} className="tl-item">
              <span className={cx('icon-bubble', TONE[a.type])}><Icon name={ACTIVITY[a.type].icon} /></span>
              <div className="tl-body">
                <div className="row wrap" style={{ gap: 6 }}><span className="t">{a.title}</span>{a.meta?.simulated ? <SimBadge /> : null}</div>
                {a.body && <div className="b">{a.body}</div>}
                <div className="tl-meta">
                  <span title={fmtDateTime(a.at)}>{relTime(a.at)}</span>
                  <span>· {L.users.get(a.userId)?.name ?? 'Sistema'}</span>
                  <Badge>{ACTIVITY[a.type].label}</Badge>
                  {showRefs && <RefLinks refs={a.refs} />}
                </div>
              </div>
            </div>
          ))}
          {list.length > limit && <Button size="sm" onClick={() => setLimit(l => l + 20)} style={{ alignSelf: 'center' }}>Carregar mais ({list.length - limit})</Button>}
        </div>
      )}
    </div>
  );
}

export function timelineFor(d: TenantData, r: Refs) {
  return d.activities.filter(a =>
    (r.personId && a.refs.personId === r.personId) || (r.companyId && a.refs.companyId === r.companyId) ||
    (r.dealId && a.refs.dealId === r.dealId) || (r.leadId && a.refs.leadId === r.leadId))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------- Tag input ---------- */
export function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const d = useTenant();
  const [txt, setTxt] = useState('');
  const add = (t: string) => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setTxt(''); };
  const sugg = d.tags.map(t => t.name).filter(t => !value.includes(t));
  return (
    <div className="stack-sm" style={{ gap: 6 }}>
      <div className="tags">{value.map(t => <span key={t} className="tag"><i style={{ background: d.tags.find(x => x.name === t)?.color ?? 'var(--accent)' }} />{t}<button type="button" className="btn ghost xs icon" style={{ '--h': '16px', width: 16 } as React.CSSProperties} onClick={() => onChange(value.filter(x => x !== t))} aria-label={`Remover ${t}`}><X size={11} /></button></span>)}</div>
      <div className="row">
        <input className="input" style={{ height: 34 }} placeholder="Adicionar tag e Enter" value={txt} list="tag-sugg" onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(txt); } }} aria-label="Nova tag" />
        <datalist id="tag-sugg">{sugg.map(t => <option key={t} value={t} />)}</datalist>
        <Button size="sm" icon onClick={() => add(txt)} aria-label="Adicionar tag"><Plus /></Button>
      </div>
    </div>
  );
}

export function UserSelect({ value, onChange, placeholder, allowEmpty, ...rest }: { value?: string; onChange: (v: string) => void; placeholder?: string; allowEmpty?: boolean } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'>) {
  const d = useTenant();
  return <Select {...rest} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={allowEmpty ? placeholder ?? 'Todos' : undefined} options={d.users.filter(u => u.active).map(u => ({ value: u.id, label: u.name }))} />;
}

export function PermissionGate({ action, children, fallback }: { action: Parameters<ReturnType<typeof useSession>['can']>[0]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = useSession();
  return <>{can(action) ? children : fallback ?? null}</>;
}
