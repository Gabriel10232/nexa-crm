import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutGrid, Palette, Plus, Undo2, Redo2, RotateCcw, Save, X, Settings2, Copy, Lock, Unlock, EyeOff, Eye, Trash2,
  Download, ChevronDown, Check, Star, Pencil, Users, ChevronLeft, ChevronRight, Printer, GripVertical,
} from 'lucide-react';
import type { DashboardLayout, RoleKey, Widget } from '../../types';
import { useTenant } from '../../store/store';
import { useSession } from '../../services/auth';
import { settings } from '../../services/crm';
import { computeKpis, Filters, PERIOD_LABEL } from '../../services/metrics';
import { KPI_METRICS, defaultDashboards, defaultExecutiveWidgets } from '../../config/widgets';
import { ROLES } from '../../config/permissions';
import { PageHeader } from '../../components/common';
import { Badge, Button, Menu, Modal, Field, Input, Select, Switch, Seg, Notice, Skeleton, useLoading, reducedMotion } from '../../components/ui';
import { WidgetBody, WidgetConfigModal, AddWidgetModal, WCtx } from './widgets';
import { confirm, prompt, toast } from '../../store/ui';
import { clamp, cx, deepClone, download, toCSV, uid } from '../../lib/utils';

function useCols() {
  const get = () => (window.innerWidth > 1100 ? 12 : window.innerWidth > 640 ? 6 : 1);
  const [c, setC] = useState(get);
  useEffect(() => { const h = () => setC(get()); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return c;
}
const spanFor = (w: number, cols: number) => (cols === 12 ? w : cols === 6 ? clamp(Math.ceil(w / 2), 1, 6) : 1);

export default function Dashboard() {
  const d = useTenant();
  const { user, can } = useSession();
  const admin = ['owner', 'admin', 'manager'].includes(user.role);
  const loading = useLoading(420);
  const cols = useCols();

  /* ---------- Layout selection (per user) ---------- */
  const visible = d.dashboards.filter(l => admin || l.ownerId === user.id || (l.roles.includes(user.role) && (l.shared || !l.ownerId)));
  const storeKey = `nexa:dash:${user.id}`;
  const [activeId, setActiveId] = useState<string>(() => localStorage.getItem(storeKey) ?? '');
  const layout = visible.find(l => l.id === activeId) ?? visible.find(l => l.ownerId === user.id) ?? visible.find(l => l.roles.includes(user.role) && l.isDefault) ?? visible.find(l => l.roles.includes(user.role)) ?? visible.find(l => l.isDefault) ?? visible[0];
  useEffect(() => { if (layout) localStorage.setItem(storeKey, layout.id); }, [layout?.id, storeKey]); // eslint-disable-line
  const canEdit = !!layout && (admin || layout.allowPersonal || layout.ownerId === user.id);

  /* ---------- Filters ---------- */
  const [f, setF] = useState<Filters>(() => { try { return { period: '30d', compare: true, ...JSON.parse(sessionStorage.getItem('nexa:dfilters') ?? '{}') }; } catch { return { period: '30d', compare: true }; } });
  useEffect(() => { sessionStorage.setItem('nexa:dfilters', JSON.stringify(f)); }, [f]);
  const kpis = useMemo(() => computeKpis(d, user, f), [d, user, f]);
  const prev = useMemo(() => computeKpis(d, user, f, 1), [d, user, f]);
  const ctx: WCtx = { d, user, f, kpis, prev };

  /* ---------- Edit mode with undo/redo ---------- */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Widget[]>([]);
  const hist = useRef<{ past: Widget[][]; future: Widget[][] }>({ past: [], future: [] });
  const [autosave, setAutosave] = useState(() => localStorage.getItem('nexa:autosave') === '1');
  const [configW, setConfigW] = useState<Widget | null>(null);
  const [adding, setAdding] = useState(false);
  const [layoutModal, setLayoutModal] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [, force] = useState(0);
  const widgets = editing ? draft : layout?.widgets ?? [];
  const dirty = editing && layout && JSON.stringify(draft) !== JSON.stringify(layout.widgets);

  const commitLayout = useCallback((ws: Widget[], silent?: boolean) => {
    if (!layout) return;
    if (!admin && !layout.ownerId) {
      // Non-admin personalising a team layout → personal copy
      const copy: DashboardLayout = { ...deepClone(layout), id: uid('dash'), name: 'Meu dashboard', ownerId: user.id, shared: false, isDefault: false, roles: [user.role], widgets: ws, updatedAt: new Date().toISOString() };
      settings.dashboards([...d.dashboards, copy]); setActiveId(copy.id);
      if (!silent) toast('success', 'Dashboard pessoal criado', 'O layout da equipe continua intacto.');
      return;
    }
    settings.dashboards(d.dashboards.map(l => (l.id === layout.id ? { ...l, widgets: ws, updatedAt: new Date().toISOString() } : l)));
    if (!silent) toast('success', 'Dashboard salvo');
  }, [layout, admin, d.dashboards, user]);

  const change = (fn: (ws: Widget[]) => Widget[], track = true) => {
    setDraft(cur => {
      const next = fn(deepClone(cur));
      if (track) { hist.current.past.push(cur); hist.current.future = []; }
      if (autosave) queueMicrotask(() => commitLayout(next, true));
      return next;
    });
    force(x => x + 1);
  };
  const startEdit = () => { if (!layout) return; setDraft(deepClone(layout.widgets)); hist.current = { past: [], future: [] }; setEditing(true); };
  const undo = () => { const p = hist.current.past.pop(); if (p) { hist.current.future.push(draft); setDraft(p); if (autosave) commitLayout(p, true); force(x => x + 1); } };
  const redo = () => { const n = hist.current.future.pop(); if (n) { hist.current.past.push(draft); setDraft(n); if (autosave) commitLayout(n, true); force(x => x + 1); } };
  const save = () => { commitLayout(draft); setEditing(false); };
  const cancel = async () => {
    if (dirty && !autosave && !(await confirm({ title: 'Descartar alterações do dashboard?', body: 'O layout voltará ao último estado salvo.', confirmLabel: 'Descartar', danger: true }))) return;
    setEditing(false);
  };
  const restore = async () => {
    if (!(await confirm({ title: 'Restaurar layout padrão?', body: 'Os widgets deste dashboard serão substituídos pelo modelo original do perfil.', confirmLabel: 'Restaurar' }))) return;
    const def = defaultDashboards().find(x => x.id === layout?.id)?.widgets ?? defaultExecutiveWidgets();
    change(() => def);
  };
  useEffect(() => {
    if (!editing) return;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).closest('input,textarea')) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => {
    if (!dirty || autosave) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty, autosave]);

  /* ---------- Widget ops ---------- */
  const move = (id: string, dir: -1 | 1) => change(ws => { const i = ws.findIndex(w => w.id === id); const j = i + dir; if (j < 0 || j >= ws.length) return ws; [ws[i], ws[j]] = [ws[j], ws[i]]; return ws; });
  const reorder = (from: string, to: string) => change(ws => { const i = ws.findIndex(w => w.id === from); const item = ws.splice(i, 1)[0]; const j = ws.findIndex(w => w.id === to); ws.splice(j, 0, item); return ws; });
  const patchW = (id: string, p: Partial<Widget>, track = true) => change(ws => ws.map(w => (w.id === id ? { ...w, ...p } : w)), track);
  const remove = async (w: Widget) => {
    if (w.required && !admin) { toast('warning', 'Widget obrigatório', 'Definido pelo gestor — não pode ser removido.'); return; }
    change(ws => ws.filter(x => x.id !== w.id));
    toast('info', `"${w.title}" removido`, undefined, { label: 'Desfazer', run: undo });
  };

  /* ---------- Resize by pointer ---------- */
  const gridRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  /* FLIP layout animation: widgets that change position glide to their new place instead of jumping. */
  const rects = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const grid = gridRef.current; if (!grid) { rects.current.clear(); return; }
    const next = new Map<string, { x: number; y: number }>();
    grid.querySelectorAll<HTMLElement>('[data-wid]').forEach(el => {
      const id = el.dataset.wid!; const pos = { x: el.offsetLeft, y: el.offsetTop }; next.set(id, pos);
      const prev = rects.current.get(id);
      if (prev && !resizing.current && !reducedMotion()) {
        const dx = prev.x - pos.x, dy = prev.y - pos.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.9,.25,1.04)' });
      }
    });
    rects.current = next;
  });
  const resizeStart = (e: React.PointerEvent, w: Widget, axis: 'x' | 'y' | 'xy') => {
    e.preventDefault(); e.stopPropagation();
    resizing.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const grid = gridRef.current!; const gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
    const colW = (grid.clientWidth + gap) / cols; const rowH = (parseFloat(getComputedStyle(grid).gridAutoRows) || 92) + gap;
    const sx = e.clientX, sy = e.clientY, sw = w.w, sh = w.h;
    const factor = 12 / cols;
    setDraft(cur => { hist.current.past.push(cur); hist.current.future = []; return cur; });
    const onMove = (ev: PointerEvent) => {
      const nw = axis !== 'y' ? clamp(Math.round(sw + ((ev.clientX - sx) / colW) * factor), 1, 12) : sw;
      const nh = axis !== 'x' ? clamp(Math.round(sh + (ev.clientY - sy) / rowH), 1, 6) : sh;
      setDraft(cur => cur.map(x => (x.id === w.id ? { ...x, w: nw, h: nh } : x)));
    };
    const onUp = () => { resizing.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); setDraft(cur => { if (autosave) commitLayout(cur, true); return cur; }); force(x => x + 1); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  /* ---------- Layout management ---------- */
  const selectLayout = (id: string) => { if (editing) { toast('warning', 'Salve ou cancele a edição antes de trocar de dashboard.'); return; } setActiveId(id); };
  const newLayout = async (dup?: boolean) => {
    const name = await prompt({ title: dup ? 'Duplicar dashboard' : 'Novo dashboard', label: 'Nome', initial: dup ? `${layout?.name} (cópia)` : '', required: true });
    if (!name) return;
    const l: DashboardLayout = { id: uid('dash'), name, roles: [user.role], allowPersonal: true, shared: admin, ownerId: admin ? undefined : user.id, widgets: dup && layout ? deepClone(layout.widgets).map(w => ({ ...w, id: uid('w') })) : [], updatedAt: new Date().toISOString() };
    settings.dashboards([...d.dashboards, l]); setActiveId(l.id);
    toast('success', `Dashboard "${name}" criado`);
    if (!dup) { setDraft([]); hist.current = { past: [], future: [] }; setEditing(true); setAdding(true); }
  };
  const renameLayout = async () => { const n = await prompt({ title: 'Renomear dashboard', label: 'Nome', initial: layout?.name, required: true }); if (n && layout) settings.dashboards(d.dashboards.map(l => (l.id === layout.id ? { ...l, name: n } : l))); };
  const deleteLayout = async () => {
    if (!layout) return;
    if (visible.length <= 1) { toast('error', 'Não é possível excluir o único dashboard.'); return; }
    if (!(await confirm({ title: `Excluir o dashboard "${layout.name}"?`, body: 'Os widgets deste layout serão perdidos.', danger: true, confirmLabel: 'Excluir' }))) return;
    settings.dashboards(d.dashboards.filter(l => l.id !== layout.id)); setActiveId('');
  };
  const setDefault = () => { if (layout) { settings.dashboards(d.dashboards.map(l => ({ ...l, isDefault: l.id === layout.id ? true : l.roles.some(r => layout.roles.includes(r)) ? false : l.isDefault }))); toast('success', `"${layout.name}" é o padrão para ${layout.roles.length} perfil(is)`); } };

  /* ---------- Export ---------- */
  const exportCsv = () => {
    const rows = (Object.keys(KPI_METRICS) as (keyof typeof KPI_METRICS)[]).filter(k => k !== 'custom' && (can('financial') || !KPI_METRICS[k].financial)).map(k => ({ indicador: KPI_METRICS[k].label, periodo: PERIOD_LABEL[f.period], valor: Math.round(kpis[k] * 100) / 100, periodo_anterior: Math.round(prev[k] * 100) / 100 }));
    download(`dashboard-${layout?.name ?? 'nexa'}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows)); toast('success', 'Relatório exportado (CSV)');
  };

  if (!layout) return <Notice tone="warning">Nenhum dashboard disponível para o seu perfil.</Notice>;
  const sellers = d.users.filter(u => ['seller', 'manager', 'supervisor'].includes(u.role));
  const shown = widgets.filter(w => editing || w.visible.desktop || w.visible.tablet || w.visible.mobile);

  return (
    <div>
      <PageHeader title={`Olá, ${user.name.split(' ')[0]}`} desc={<>Dashboard <strong style={{ color: 'var(--text)' }}>{layout.name}</strong> · {PERIOD_LABEL[f.period]}{f.compare && ' · comparando com o período anterior'}</>}
        actions={!editing && <>
          <Menu width={260} trigger={p => <Button {...p}><LayoutGrid />{layout.name}<ChevronDown /></Button>}>
            <div className="menu-label">Dashboards</div>
            {visible.map(l => <button key={l.id} onClick={() => selectLayout(l.id)}>{l.id === layout.id ? <Check /> : <span style={{ width: 16 }} />}<span className="ellipsis">{l.name}</span>{l.isDefault && <Star size={12} style={{ marginLeft: 'auto' }} />}{l.ownerId && <Badge>pessoal</Badge>}</button>)}
            <hr />
            <button onClick={() => newLayout()}><Plus />Novo dashboard</button>
            <button onClick={() => newLayout(true)}><Copy />Duplicar este</button>
            {(admin || layout.ownerId === user.id) && <button onClick={renameLayout}><Pencil />Renomear</button>}
            {admin && <button onClick={setDefault}><Star />Definir como padrão</button>}
            {admin && <button onClick={() => setLayoutModal(true)}><Users />Perfis e compartilhamento</button>}
            {(admin || layout.ownerId === user.id) && <button className="danger" onClick={deleteLayout}><Trash2 />Excluir</button>}
          </Menu>
          <Menu trigger={p => <Button {...p} icon aria-label="Exportar relatório"><Download /></Button>}>
            <button onClick={exportCsv}><Download />Exportar CSV</button>
            <button onClick={() => window.print()}><Printer />Imprimir / PDF</button>
          </Menu>
          <Button onClick={() => window.dispatchEvent(new Event('nexa:appearance'))}><Palette />Personalizar aparência</Button>
          <Button variant="primary" onClick={startEdit} disabled={!canEdit} title={canEdit ? undefined : 'Personalização bloqueada pelo gestor'}><LayoutGrid />Editar dashboard</Button>
        </>} />

      {!editing && (
        <div className="toolbar no-print">
          <Seg label="Período" value={f.period} onChange={v => setF({ ...f, period: v })} options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: 'mtd', label: 'Mês' }, { value: '90d', label: '90d' }, { value: '12m', label: '12m' }]} />
          <Select aria-label="Filtrar por equipe" value={f.teamId ?? ''} onChange={e => setF({ ...f, teamId: e.target.value || undefined, ownerId: undefined })} placeholder="Todas as equipes" options={d.teams.map(t => ({ value: t.id, label: t.name }))} style={{ width: 190, height: 36 }} />
          <Select aria-label="Filtrar por vendedor" value={f.ownerId ?? ''} onChange={e => setF({ ...f, ownerId: e.target.value || undefined })} placeholder="Todos os vendedores" options={sellers.filter(u => !f.teamId || u.teamId === f.teamId).map(u => ({ value: u.id, label: u.name }))} style={{ width: 190, height: 36 }} />
          <Select aria-label="Filtrar por origem" value={f.source ?? ''} onChange={e => setF({ ...f, source: e.target.value || undefined })} placeholder="Todas as origens" options={d.org.sources} style={{ width: 170, height: 36 }} />
          <span className="row small"><Switch label="Comparar com período anterior" checked={f.compare} onChange={v => setF({ ...f, compare: v })} />Comparar</span>
          {(f.teamId || f.ownerId || f.source) && <Button size="sm" variant="ghost" onClick={() => setF({ period: f.period, compare: f.compare })}><X />Limpar filtros</Button>}
        </div>
      )}

      {editing && (
        <div className="editbar glass no-print" role="toolbar" aria-label="Edição do dashboard">
          <strong className="small">Modo de edição</strong>
          <span className="xs muted hide-sm">Arraste para mover · bordas para redimensionar</span>
          <span className="flex1" />
          {dirty && !autosave && <span className="unsaved">Não salvo</span>}
          <Button size="sm" onClick={() => setAdding(true)}><Plus />Widget</Button>
          <Button size="sm" icon onClick={undo} disabled={!hist.current.past.length} aria-label="Desfazer (Ctrl+Z)" title="Desfazer"><Undo2 /></Button>
          <Button size="sm" icon onClick={redo} disabled={!hist.current.future.length} aria-label="Refazer (Ctrl+Y)" title="Refazer"><Redo2 /></Button>
          <Button size="sm" onClick={restore}><RotateCcw /><span className="hide-sm">Restaurar padrão</span></Button>
          <span className="row xs" title="Salvar cada alteração automaticamente"><Switch label="Salvamento automático" checked={autosave} onChange={v => { setAutosave(v); localStorage.setItem('nexa:autosave', v ? '1' : '0'); if (v) commitLayout(draft, true); }} /><span className="hide-sm">Auto</span></span>
          <Button size="sm" onClick={cancel}>{autosave ? 'Concluir' : 'Cancelar'}</Button>
          {!autosave && <Button size="sm" variant="primary" onClick={save}><Save />Salvar</Button>}
        </div>
      )}

      {loading ? (
        <div className="dash-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="card widget" style={{ gridColumn: `span ${spanFor(i < 4 ? 3 : 6, cols)}`, gridRow: `span ${i < 4 ? 1 : 3}` }}><Skeleton h={14} w="50%" /><div style={{ height: 12 }} /><Skeleton h={i < 4 ? 28 : 180} /></div>)}</div>
      ) : shown.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon"><LayoutGrid /></div><h3>Dashboard vazio</h3><p>Adicione indicadores, gráficos e listas para montar seu workspace.</p>
          <Button variant="primary" onClick={() => { if (!editing) startEdit(); setAdding(true); }}><Plus />Adicionar widget</Button></div></div>
      ) : (
        <div ref={gridRef} className={cx('dash-grid', editing && 'editing')}>
          {shown.map((w, idx) => {
            const span = spanFor(w.w, cols);
            const hiddenAll = !w.visible.desktop && !w.visible.tablet && !w.visible.mobile;
            return (
              <section key={w.id} aria-label={w.title} data-wid={w.id}
                className={cx('card widget', w.type === 'section' && 'section', w.type === 'kpi' && 'kpi-w', w.locked && 'locked', dragId === w.id && 'dragging', overId === w.id && dragId !== w.id && 'drop-target',
                  !editing && !w.visible.desktop && 'hide-desktop', !editing && !w.visible.tablet && 'hide-tablet', !editing && !w.visible.mobile && 'hide-mobile')}
                style={{ gridColumn: cols === 1 ? undefined : `span ${span}`, gridRow: cols === 1 ? undefined : `span ${w.h}`, '--h': w.h, '--i': Math.min(idx, 14), opacity: editing && hiddenAll ? .45 : undefined } as React.CSSProperties}
                draggable={editing && !w.locked}
                onDragStart={e => { if (resizing.current || (e.target as HTMLElement).closest?.('.resize-e,.resize-s,.resize-se,.w-tools')) { e.preventDefault(); return; } setDragId(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={e => { if (!editing || !dragId || w.locked) return; e.preventDefault(); setOverId(w.id); }}
                onDrop={e => { e.preventDefault(); if (dragId && dragId !== w.id && !w.locked) reorder(dragId, w.id); setDragId(null); setOverId(null); }}>
                {w.type === 'section' ? (
                  <div><h2 style={{ fontSize: 17 }}>{w.title}</h2>{w.description && <p className="muted small">{w.description}</p>}</div>
                ) : (<>
                  {w.type !== 'kpi' && <div className="w-head"><div style={{ minWidth: 0 }}><h3 className="ellipsis">{w.title}</h3>{w.description && w.h > 1 && <div className="xs muted ellipsis">{w.description}</div>}</div></div>}
                  <div className="w-body"><WidgetBody w={w} ctx={ctx} /></div>
                </>)}
                {editing && <>
                  <div className="w-tools no-print" onMouseDown={e => e.stopPropagation()}>
                    {!w.locked && <span className="btn ghost xs icon" style={{ cursor: 'grab' }} aria-hidden title="Arrastar"><GripVertical /></span>}
                    <Button size="xs" variant="ghost" icon onClick={() => move(w.id, -1)} disabled={idx === 0 || w.locked} aria-label="Mover para trás"><ChevronLeft /></Button>
                    <Button size="xs" variant="ghost" icon onClick={() => move(w.id, 1)} disabled={idx === shown.length - 1 || w.locked} aria-label="Mover para frente"><ChevronRight /></Button>
                    <Button size="xs" variant="ghost" icon onClick={() => setConfigW(w)} aria-label={`Configurar ${w.title}`} title="Configurar"><Settings2 /></Button>
                    <Button size="xs" variant="ghost" icon onClick={() => change(ws => { const i = ws.findIndex(x => x.id === w.id); ws.splice(i + 1, 0, { ...deepClone(w), id: uid('w'), title: `${w.title} (cópia)`, required: false }); return ws; })} aria-label="Duplicar" title="Duplicar"><Copy /></Button>
                    <Button size="xs" variant="ghost" icon onClick={() => patchW(w.id, { locked: !w.locked })} aria-label={w.locked ? 'Desbloquear' : 'Bloquear'} title={w.locked ? 'Desbloquear' : 'Bloquear'}>{w.locked ? <Unlock /> : <Lock />}</Button>
                    <Button size="xs" variant="ghost" icon onClick={() => patchW(w.id, { visible: hiddenAll ? { desktop: true, tablet: true, mobile: true } : { desktop: false, tablet: false, mobile: false } })} aria-label={hiddenAll ? 'Reexibir' : 'Ocultar'} title={hiddenAll ? 'Reexibir' : 'Ocultar'}>{hiddenAll ? <Eye /> : <EyeOff />}</Button>
                    <Button size="xs" variant="ghost" icon onClick={() => remove(w)} aria-label="Remover" title={w.required ? 'Obrigatório' : 'Remover'} disabled={w.required && !admin}><Trash2 /></Button>
                  </div>
                  <span className="w-size">{w.w}×{w.h}{w.required ? ' · obrigatório' : ''}{hiddenAll ? ' · oculto' : ''}</span>
                  {!w.locked && cols > 1 && <>
                    <span className="resize-e" onPointerDown={e => resizeStart(e, w, 'x')} aria-hidden />
                    <span className="resize-s" onPointerDown={e => resizeStart(e, w, 'y')} aria-hidden />
                    <span className="resize-se" onPointerDown={e => resizeStart(e, w, 'xy')} aria-hidden />
                  </>}
                </>}
              </section>
            );
          })}
        </div>
      )}

      {configW && <WidgetConfigModal w={configW} admin={admin} onClose={() => setConfigW(null)} onSave={nw => { patchW(nw.id, nw); setConfigW(null); }} />}
      {adding && <AddWidgetModal onClose={() => setAdding(false)} onAdd={w => { change(ws => [...ws, w]); setAdding(false); toast('success', `"${w.title}" adicionado`, 'Arraste para posicionar.'); setTimeout(() => document.querySelector('.dash-grid > :last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }} />}
      {layoutModal && <LayoutSettings layout={layout} onClose={() => setLayoutModal(false)} />}
    </div>
  );
}

function LayoutSettings({ layout, onClose }: { layout: DashboardLayout; onClose: () => void }) {
  const d = useTenant();
  const [l, setL] = useState(layout);
  const [target, setTarget] = useState('');
  const save = () => { settings.dashboards(d.dashboards.map(x => (x.id === l.id ? l : x))); toast('success', 'Configurações do dashboard salvas'); onClose(); };
  const dupFor = () => {
    if (!target) return;
    const copy: DashboardLayout = { ...deepClone(l), id: uid('dash'), name: `${l.name} · ${ROLES.find(r => r.key === target)?.label}`, roles: [target as RoleKey], isDefault: false, widgets: deepClone(l.widgets).map(w => ({ ...w, id: uid('w') })) };
    settings.dashboards([...d.dashboards, copy]); toast('success', 'Dashboard duplicado para outro perfil');
  };
  return (
    <Modal open onClose={onClose} title="Perfis e compartilhamento" description={`Dashboard "${layout.name}"`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="stack">
        <Field label="Nome"><Input value={l.name} onChange={e => setL({ ...l, name: e.target.value })} /></Field>
        <div className="field"><span className="label">Perfis que usam este dashboard</span>
          <div className="row wrap" style={{ gap: 6 }}>{ROLES.map(r => <label key={r.key} className="tag" style={{ height: 30, cursor: 'pointer' }}><input type="checkbox" checked={l.roles.includes(r.key)} onChange={e => setL({ ...l, roles: e.target.checked ? [...l.roles, r.key] : l.roles.filter(x => x !== r.key) })} />{r.label}</label>)}</div>
        </div>
        <div className="ap-row"><span>Compartilhado com a equipe</span><Switch label="Compartilhado" checked={l.shared} onChange={v => setL({ ...l, shared: v })} /></div>
        <div className="ap-row"><span>Permitir personalização individual<br /><span className="xs muted">Usuários criam uma cópia pessoal ao editar</span></span><Switch label="Personalização individual" checked={l.allowPersonal} onChange={v => setL({ ...l, allowPersonal: v })} /></div>
        <div className="ap-row"><span>Bloquear todos os widgets</span><Switch label="Bloquear widgets" checked={l.widgets.every(w => w.locked)} onChange={v => setL({ ...l, widgets: l.widgets.map(w => ({ ...w, locked: v })) })} /></div>
        <div className="divider" />
        <div className="row wrap"><Select value={target} onChange={e => setTarget(e.target.value)} placeholder="Duplicar para o perfil…" options={ROLES.map(r => ({ value: r.key, label: r.label }))} style={{ flex: 1 }} aria-label="Perfil de destino" /><Button onClick={dupFor} disabled={!target}><Copy />Duplicar</Button></div>
      </div>
    </Modal>
  );
}
