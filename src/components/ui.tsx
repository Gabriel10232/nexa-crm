import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Check, AlertTriangle, Info, AlertCircle, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Loader2,
  Phone, Mail, MessageCircle, Users, StickyNote, Paperclip, FileText, Handshake, Flag, History, CheckSquare, Zap,
  MessagesSquare, Smartphone, AtSign, Inbox as InboxIcon, type LucideIcon,
} from 'lucide-react';
import type { Tone } from '../config/labels';
import { cx, initials } from '../lib/utils';
import { useUI, dismissToast, ConfirmReq, useFresh } from '../store/ui';

/* ---------- Icons by name (tree-shaken map) ---------- */
const ICONS: Record<string, LucideIcon> = {
  Phone, Mail, MessageCircle, Users, StickyNote, Paperclip, FileText, Handshake, Flag, History, CheckSquare, Zap, MessagesSquare, Smartphone, Instagram: AtSign,
};
export const Icon = ({ name, size = 16 }: { name: string; size?: number }) => { const C = ICONS[name] ?? Info; return <C size={size} />; };

/* ---------- Button ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'default'; size?: 'sm' | 'xs' | 'md'; icon?: boolean; loading?: boolean; solid?: boolean };
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'default', size = 'md', icon, loading, solid, className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('btn', variant !== 'default' && variant, size !== 'md' && size, icon && 'icon', loading && 'loading', solid && 'solid', className)} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="spin" /> : null}
      {children}
    </button>
  );
});

/* ---------- Badge / Tag / Avatar ---------- */
export const Badge = ({ tone = 'neutral', dot, children, title }: { tone?: Tone; dot?: boolean; children: React.ReactNode; title?: string }) =>
  <span className={cx('badge', tone)} title={title}>{dot && <span className="dot" />}{children}</span>;

export const TagChip = ({ name, color, onRemove }: { name: string; color?: string; onRemove?: () => void }) => (
  <span className="tag"><i style={{ background: color ?? 'var(--accent)' }} />{name}{onRemove && <button className="btn ghost xs icon" style={{ '--h': '16px', width: 16 } as React.CSSProperties} onClick={onRemove} aria-label={`Remover tag ${name}`}><X size={11} /></button>}</span>
);

export function Avatar({ name, color, size, square, src }: { name: string; color?: string; size?: 'sm' | 'lg'; square?: boolean; src?: string }) {
  const bg = color ?? hashColor(name);
  return <span className={cx('avatar', size, square && 'sq')} style={{ background: src ? undefined : bg }} aria-hidden>{src ? <img src={src} alt="" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} /> : initials(name)}</span>;
}
const AV = ['#9BA8AB', '#7FA7B5', '#86B4C6', '#C8B88A', '#8C9EC4', '#6FA58A', '#CCD0CF', '#E0B66E', '#B39DDB'];
export const hashColor = (s: string) => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];

export const Progress = ({ value, tone }: { value: number; tone?: 'ok' | 'warn' }) =>
  <div className={cx('progress', tone)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;

/* ---------- Form controls ---------- */
export function Field({ label, required, error, hint, children, className }: { label?: React.ReactNode; required?: boolean; error?: string; hint?: string; children: React.ReactElement; className?: string }) {
  const id = useId();
  const child = React.cloneElement(children, { id: children.props.id ?? id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-err` : undefined, required: undefined });
  return (
    <div className={cx('field', error && 'error', className)}>
      {label && <label htmlFor={child.props.id}>{label}{required && <span className="req" aria-label="obrigatório">*</span>}</label>}
      {child}
      {error ? <span className="field-error" id={`${id}-err`} role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((p, ref) => <input ref={ref} {...p} className={cx('input', p.className)} />);
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx('textarea', p.className)} />;
export function Select({ options, placeholder, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[]; placeholder?: string }) {
  return (
    <select {...p} className={cx('select', p.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) =>
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;

/** Keeps a sliding indicator (CSS vars --ix / --iw) under the active child. */
function useInk(ref: React.RefObject<HTMLElement>, selector: string, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => {
      const a = el.querySelector<HTMLElement>(selector); if (!a) { el.style.setProperty('--iw', '0px'); return; }
      el.style.setProperty('--ix', `${a.offsetLeft}px`); el.style.setProperty('--iw', `${a.offsetWidth}px`);
      if (!el.dataset.inkReady) requestAnimationFrame(() => { el.dataset.inkReady = '1'; });
    };
    update();
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useInk(ref, 'button[aria-pressed="true"]', [value, options.length]);
  return (
    <div ref={ref} className="pill-seg inked" role="group" aria-label={label}>
      <span className="seg-ink" aria-hidden />
      {options.map(o => <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.icon}{o.label}</button>)}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useInk(ref, '[aria-selected="true"]', [value, tabs.length]);
  const change = (v: T) => {
    if (v === value) return;
    onChange(v);
    // Fade the panel that follows the tab bar so the content swap reads as a transition.
    requestAnimationFrame(() => {
      const panel = ref.current?.nextElementSibling as HTMLElement | null;
      if (panel) panel.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  };
  return (
    <div ref={ref} className="tabs" role="tablist">
      {tabs.map(t => <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => change(t.value)}>{t.label}{t.count !== undefined && <span className="n">{t.count}</span>}</button>)}
      <span className="tab-ink" aria-hidden />
    </div>
  );
}

/* ---------- Empty / skeleton / notice ---------- */
export function Empty({ icon, title, text, action, compact }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode; compact?: boolean }) {
  return <div className={cx('empty', compact && 'compact')}><div className="empty-icon">{icon ?? <InboxIcon size={22} />}</div><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>;
}
export const Skeleton = ({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) => <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
export function SkeletonRows({ n = 6 }: { n?: number }) {
  return <div className="stack-sm" aria-busy="true" aria-label="Carregando">{Array.from({ length: n }, (_, i) => <div key={i} className="row"><Skeleton h={32} w={32} r={16} /><div className="flex1 stack-sm"><Skeleton h={12} w="40%" /><Skeleton h={10} w="70%" /></div></div>)}</div>;
}
export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: React.ReactNode; icon?: React.ReactNode }) {
  const I = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? Check : Info;
  return <div className={cx('notice', tone)} role={tone === 'danger' ? 'alert' : undefined}>{icon ?? <I />}<div>{children}</div></div>;
}
export const SimBadge = ({ children = 'Simulado' }: { children?: React.ReactNode }) => <span className="sim-badge" title="Integração não conectada: dados/ações demonstrativos">{children}</span>;

/** Shows a skeleton briefly on mount to mimic network latency of a real API. */
export function useLoading(ms = 380) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), ms); return () => clearTimeout(t); }, [ms]);
  return loading;
}

/* ---------- Motion helpers ---------- */
export const reducedMotion = () => document.documentElement.dataset.motion === 'reduce';

/** Gives any element an exit animation: on unmount/close a visual clone plays `.ghost-leave` and removes itself. */
export function useExitGhost(ref: React.RefObject<HTMLElement>, active: boolean) {
  const last = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { if (active && ref.current) last.current = ref.current; });
  useLayoutEffect(() => {
    if (!active) return;
    return () => {
      const el = last.current; if (!el) return;
      const g = el.cloneNode(true) as HTMLElement;
      g.classList.add('ghost-leave'); g.setAttribute('aria-hidden', 'true'); g.removeAttribute('id'); g.style.pointerEvents = 'none';
      g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      document.body.appendChild(g);
      const done = () => g.remove();
      g.addEventListener('animationend', e => { if (e.target === g) done(); });
      setTimeout(done, 450);
    };
  }, [active]);
}

let bodyLocks = 0;
function useBodyLock() {
  useEffect(() => {
    if (bodyLocks++ === 0) { const sw = window.innerWidth - document.documentElement.clientWidth; document.body.style.overflow = 'hidden'; document.body.style.paddingRight = sw ? `${sw}px` : ''; }
    return () => { if (--bodyLocks === 0) { document.body.style.overflow = ''; document.body.style.paddingRight = ''; } };
  }, []);
}

/** Mounted while a menu is open: the page behind can't scroll, so the menu acts like a fixed modal. */
function ScrollLock() { useBodyLock(); return null; }

/** Animated number (count-up) — 600ms ease-out, respects reduced motion. */
/** Writes straight to the DOM on each frame — zero React renders while animating. */
export function CountUp({ value, format, duration = 650 }: { value: number; format: (n: number) => string; duration?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const from = useRef(reducedMotion() ? value : 0);
  const fmt = useRef(format); fmt.current = format;
  useLayoutEffect(() => {
    const node = el.current; if (!node) return;
    if (reducedMotion() || !isFinite(value)) { node.textContent = fmt.current(value); from.current = value; return; }
    const start = performance.now(); const a = from.current; let raf = 0;
    node.textContent = fmt.current(a);
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / duration)); const e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt.current(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; node.textContent = fmt.current(value); };
  }, [value, duration]);
  return <span ref={el} className="num" />;
}

/* ---------- Modal & drawer ---------- */
function useEsc(onClose: () => void) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
}
function useFocusTrap(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = el.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button:not(.modal-x)');
    (first ?? el).focus();
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    el.addEventListener('keydown', h);
    return () => { el.removeEventListener('keydown', h); prev?.focus?.(); };
  }, [ref]);
}

export function Modal({ open, onClose, title, description, children, footer, size, drawer, className }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'lg' | 'xl'; drawer?: boolean; className?: string }) {
  if (!open) return null;
  return createPortal(<ModalInner {...{ onClose, title, description, children, footer, size, drawer, className }} />, document.body);
}
function ModalInner({ onClose, title, description, children, footer, size, drawer, className }: { onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'lg' | 'xl'; drawer?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  useEsc(onClose); useFocusTrap(ref); useBodyLock(); useExitGhost(overlay, true);
  return (
    <div ref={overlay} className={cx('overlay', drawer && 'drawer-overlay', className)} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx('modal', size, drawer && 'drawer')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}>
        <div className="modal-head">
          <div className="flex1"><h2>{title}</h2>{description && <p>{description}</p>}</div>
          <Button variant="ghost" icon size="sm" onClick={onClose} aria-label="Fechar" className="modal-x"><X /></Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Dropdown menu ---------- */
export function Menu({ trigger, children, align = 'right', width }: { trigger: (p: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => React.ReactNode; children: React.ReactNode | ((close: () => void) => React.ReactNode); align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect(); const w = width ?? 220;
    let left = align === 'right' ? r.right - w : r.left; left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6; if (top + 320 > window.innerHeight) top = Math.max(8, r.top - 6 - Math.min(320, window.innerHeight * .6));
    setPos({ top, left });
  }, [open, align, width]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu') && !wrap.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // Close only when the page behind scrolls — never when the menu's own list scrolls.
    const s = (e: Event) => { const t = e.target; if (menuRef.current && t instanceof Node && (menuRef.current === t || menuRef.current.contains(t))) return; setOpen(false); };
    const r = () => setOpen(false);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k); window.addEventListener('scroll', s, true); window.addEventListener('resize', r);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); window.removeEventListener('scroll', s, true); window.removeEventListener('resize', r); };
  }, [open]);
  const menuRef = useRef<HTMLDivElement>(null);
  useExitGhost(menuRef, open && !!pos);
  const close = () => setOpen(false);
  return (
    <span ref={wrap} style={{ display: 'inline-flex' }}>
      {trigger({ onClick: () => setOpen(o => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && pos && createPortal(
        <div ref={menuRef} className="menu" role="menu"  style={{ transformOrigin: align === 'right' ? 'top right' : 'top left', position: 'fixed', top: pos.top, left: pos.left, width: width ?? 220, maxHeight: '60vh', overflowY: 'auto' }} onClick={e => { if ((e.target as HTMLElement).closest('button:not([data-keep])')) close(); }}>
          <ScrollLock />
          {typeof children === 'function' ? children(close) : children}
        </div>, document.body)}
    </span>
  );
}

/* ---------- Toasts / confirm / prompt hosts ---------- */
export function Toaster() {
  const toasts = useUI(s => s.toasts);
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map(t => {
        const I = t.kind === 'success' ? Check : t.kind === 'error' ? AlertCircle : t.kind === 'warning' ? AlertTriangle : Info;
        return (
          <div key={t.id} className={cx('toast', t.kind, t.leaving && 'leaving')}>
            <I className="ti" />
            <div className="flex1"><div className="tt">{t.title}</div>{t.body && <div className="tb">{t.body}</div>}
              {t.action && <Button size="xs" style={{ marginTop: 8 }} onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</Button>}</div>
            <Button variant="ghost" size="xs" icon onClick={() => dismissToast(t.id)} aria-label="Fechar notificação"><X /></Button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmHost() {
  const c = useUI(s => s.confirm);
  return c ? <ConfirmDialog key={c.id} c={c} /> : null;
}
function ConfirmDialog({ c }: { c: ConfirmReq }) {
  const [typed, setTyped] = useState('');
  const ok = !c.typeToConfirm || typed.trim() === c.typeToConfirm.trim();
  return (
    <Modal open onClose={() => c.resolve(false)} title={c.title} footer={<>
      <Button onClick={() => c.resolve(false)}>Cancelar</Button>
      <Button variant={c.danger ? 'danger' : 'primary'} solid={c.danger} disabled={!ok} onClick={() => c.resolve(true)}>{c.confirmLabel ?? 'Confirmar'}</Button>
    </>}>
      <div className="stack-sm">
        {c.body && <div className="muted">{c.body}</div>}
        {c.typeToConfirm && (
          <Field label={<>Digite <strong style={{ color: 'var(--text)' }}>&nbsp;{c.typeToConfirm}&nbsp;</strong> para confirmar</>}>
            <Input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" onKeyDown={e => e.key === 'Enter' && ok && c.resolve(true)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function PromptHost() {
  const p = useUI(s => s.prompt);
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setV(p?.initial ?? ''); setErr(''); }, [p?.id]);
  if (!p) return null;
  const submit = () => { if (p.required && !v.trim()) { setErr('Campo obrigatório.'); return; } p.resolve(v.trim()); };
  return (
    <Modal open onClose={() => p.resolve(null)} title={p.title} footer={<><Button onClick={() => p.resolve(null)}>Cancelar</Button><Button variant="primary" onClick={submit}>Confirmar</Button></>}>
      <Field label={p.label} required={p.required} error={err}>
        {p.options ? <Select value={v} onChange={e => setV(e.target.value)} options={p.options} placeholder="Selecione…" /> : <Input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />}
      </Field>
    </Modal>
  );
}

/* ---------- Data table ---------- */
export interface Column<T> { key: string; label: string; render: (r: T) => React.ReactNode; sort?: (r: T) => string | number | undefined; width?: number | string; hideable?: boolean; align?: 'right' }

export function DataTable<T extends { id: string }>({ rows, columns, selected, onSelect, onRowClick, pageSize = 12, empty, visible, initialSort }: {
  rows: T[]; columns: Column<T>[]; selected?: Set<string>; onSelect?: (s: Set<string>) => void; onRowClick?: (r: T) => void;
  pageSize?: number; empty?: React.ReactNode; visible?: string[]; initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  const fresh = useFresh();
  const cols = columns.filter(c => !visible || visible.includes(c.key));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find(x => x.key === sort.key); if (!c?.sort) return rows;
    const m = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => { const va = c.sort!(a), vb = c.sort!(b); if (va == null) return 1; if (vb == null) return -1; return (va > vb ? 1 : va < vb ? -1 : 0) * m; });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const slice = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const allOnPage = slice.length > 0 && slice.every(r => selected?.has(r.id));
  const toggleAll = () => { if (!onSelect || !selected) return; const s = new Set(selected); slice.forEach(r => (allOnPage ? s.delete(r.id) : s.add(r.id))); onSelect(s); };
  const toggle = (id: string) => { if (!onSelect || !selected) return; const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); onSelect(s); };

  if (!rows.length) return <>{empty}</>;
  return (
    <div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            {onSelect && <th className="w-check"><input type="checkbox" aria-label="Selecionar todos da página" checked={allOnPage} onChange={toggleAll} /></th>}
            {cols.map(c => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sort ? <button onClick={() => setSort(s => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} opacity={.4} />}
                </button> : c.label}
              </th>
            ))}
          </tr></thead>
          <tbody key={`${page}-${sort?.key}-${sort?.dir}`} className="rows-in">
            {slice.map(r => (
              <tr key={r.id} className={cx(onRowClick && 'clickable', selected?.has(r.id) && 'selected', fresh.has(r.id) && 'fresh')} onClick={e => { if ((e.target as HTMLElement).closest('input,button,a,select')) return; onRowClick?.(r); }}>
                {onSelect && <td className="w-check"><input type="checkbox" aria-label="Selecionar linha" checked={!!selected?.has(r.id)} onChange={() => toggle(r.id)} /></td>}
                {cols.map(c => <td key={c.key} style={{ textAlign: c.align }}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={sorted.length} pageSize={pageSize} onPage={setPage} />
    </div>
  );
}

export function Pager({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  return (
    <div className="pager">
      <span>{total ? `${page * pageSize + 1}–${Math.min(total, (page + 1) * pageSize)} de ${total}` : '0 resultados'}</span>
      <div className="row">
        <Button size="sm" icon disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
        <span>Página {page + 1} de {pages}</span>
        <Button size="sm" icon disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Próxima página"><ChevronRight /></Button>
      </div>
    </div>
  );
}

export function usePaged<T>(rows: T[], size: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  return { page, setPage, pages, slice: rows.slice(page * size, page * size + size) };
}
