/* Generic list engine shared by Leads, People, Companies and Opportunities:
 * search, advanced filters, saved filters, sort, pagination, table/cards,
 * configurable columns, multi-select with bulk actions and export. */
import React, { useMemo, useState, useEffect } from 'react';
import { Search, SlidersHorizontal, Table2, LayoutGrid, Columns3, Download, Bookmark, X, Trash2 } from 'lucide-react';
import { Button, Column, DataTable, Field, Input, Menu, Select, Seg, usePaged, Pager, Empty, SkeletonRows, useLoading } from './ui';
import { useTenant } from '../store/store';
import { settings } from '../services/crm';
import { useSession } from '../services/auth';
import { prompt, toast, confirm, useFresh } from '../store/ui';
import { daysBetween, download, normalize, toCSV, uid } from '../lib/utils';

export interface FilterDef<T> {
  key: string;
  label: string;
  kind: 'select' | 'min' | 'max' | 'dateFrom' | 'dateTo' | 'daysSince' | 'tag';
  options?: { value: string; label: string }[];
  get: (r: T) => unknown;
}

export interface RecordListProps<T extends { id: string }> {
  entity: string;
  rows: T[];
  columns: Column<T>[];
  search: (r: T) => (string | undefined)[];
  filters: FilterDef<T>[];
  card: (r: T) => React.ReactNode;
  onOpen: (r: T) => void;
  bulk?: (ids: string[], clear: () => void) => React.ReactNode;
  exportRow: (r: T) => Record<string, unknown>;
  defaultCols?: string[];
  empty: React.ReactNode;
  initialQuery?: Record<string, string>;
  pageSize?: number;
}

export function RecordList<T extends { id: string }>(p: RecordListProps<T>) {
  const d = useTenant(); const { can } = useSession();
  const loading = useLoading(300);
  const fresh = useFresh();
  const [q, setQ] = useState('');
  const [fv, setFv] = useState<Record<string, string>>(p.initialQuery ?? {});
  const [showFilters, setShowFilters] = useState(Object.keys(p.initialQuery ?? {}).length > 0);
  const [view, setView] = useState<'table' | 'cards'>(() => (localStorage.getItem(`nexa:view:${p.entity}`) as 'table') ?? (window.innerWidth < 700 ? 'cards' : 'table'));
  const [cols, setCols] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(`nexa:cols:${p.entity}`) ?? 'null') ?? p.defaultCols ?? p.columns.map(c => c.key); } catch { return p.columns.map(c => c.key); } });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => localStorage.setItem(`nexa:view:${p.entity}`, view), [view, p.entity]);
  useEffect(() => localStorage.setItem(`nexa:cols:${p.entity}`, JSON.stringify(cols)), [cols, p.entity]);

  const filtered = useMemo(() => {
    const n = normalize(q.trim());
    return p.rows.filter(r => {
      if (n && !p.search(r).some(s => normalize(s).includes(n))) return false;
      for (const f of p.filters) {
        const val = fv[f.key]; if (!val) continue;
        const raw = f.get(r);
        switch (f.kind) {
          case 'select': if (String(raw ?? '') !== val) return false; break;
          case 'tag': if (!Array.isArray(raw) || !raw.includes(val)) return false; break;
          case 'min': if (!(Number(raw) >= Number(val))) return false; break;
          case 'max': if (!(Number(raw) <= Number(val))) return false; break;
          case 'dateFrom': if (!raw || new Date(raw as string) < new Date(val)) return false; break;
          case 'dateTo': if (!raw || new Date(raw as string) > new Date(val + 'T23:59:59')) return false; break;
          case 'daysSince': if (raw && daysBetween(raw as string) < Number(val)) return false; break;
        }
      }
      return true;
    });
  }, [p.rows, q, fv, p.filters, p.search]);

  useEffect(() => { setSelected(s => new Set([...s].filter(id => filtered.some(r => r.id === id)))); }, [filtered]);
  const activeFilters = Object.values(fv).filter(Boolean).length;
  const saved = d.savedFilters.filter(s => s.entity === p.entity);
  const saveFilter = async () => {
    const name = await prompt({ title: 'Salvar filtro', label: 'Nome do filtro', required: true });
    if (!name) return;
    settings.patch(t => { t.savedFilters = [...t.savedFilters, { id: uid('sf'), entity: p.entity, name, query: { ...fv, q } }]; });
    toast('success', `Filtro "${name}" salvo`);
  };
  const doExport = () => {
    if (!can('export')) { toast('error', 'Sem permissão para exportar', 'Solicite acesso a um administrador.'); return; }
    const rows = (selected.size ? filtered.filter(r => selected.has(r.id)) : filtered).map(p.exportRow);
    download(`${p.entity}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    settings.patch(() => {}, `Exportou ${rows.length} registro(s) de ${p.entity}`);
    toast('success', `${rows.length} registro(s) exportado(s)`);
  };
  const paged = usePaged(filtered, p.pageSize ?? 12);

  return (
    <div>
      <div className="toolbar">
        <div className="input-icon"><Search /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar por qualquer campo…" aria-label="Pesquisar" /></div>
        <Button onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters}><SlidersHorizontal />Filtros{activeFilters ? ` (${activeFilters})` : ''}</Button>
        <Menu width={240} trigger={tp => <Button {...tp}><Bookmark /><span className="hide-sm">Filtros salvos</span></Button>}>
          {saved.length === 0 && <div className="small muted" style={{ padding: 10 }}>Nenhum filtro salvo ainda.</div>}
          {saved.map(s => (
            <div key={s.id} className="row" style={{ gap: 2 }}>
              <button onClick={() => { const { q: sq, ...rest } = s.query as Record<string, string>; setQ(sq ?? ''); setFv(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v)]))); setShowFilters(true); }}><Bookmark />{s.name}</button>
              <button data-keep style={{ width: 'auto' }} aria-label={`Excluir filtro ${s.name}`} onClick={async () => { if (await confirm({ title: `Excluir filtro "${s.name}"?`, danger: true, confirmLabel: 'Excluir' })) settings.patch(t => { t.savedFilters = t.savedFilters.filter(x => x.id !== s.id); }); }}><Trash2 /></button>
            </div>
          ))}
          <hr /><button onClick={saveFilter} disabled={!activeFilters && !q}><Bookmark />Salvar filtro atual</button>
        </Menu>
        <span className="flex1" />
        <Seg label="Visualização" value={view} onChange={setView} options={[{ value: 'table', label: <span className="hide-sm">Tabela</span>, icon: <Table2 /> }, { value: 'cards', label: <span className="hide-sm">Cards</span>, icon: <LayoutGrid /> }]} />
        {view === 'table' && (
          <Menu width={230} trigger={tp => <Button {...tp} icon aria-label="Configurar colunas" title="Colunas"><Columns3 /></Button>}>
            <div className="menu-label">Colunas visíveis</div>
            {p.columns.map(c => (
              <button key={c.key} data-keep disabled={c.hideable === false} onClick={() => setCols(cs => (cs.includes(c.key) ? cs.filter(x => x !== c.key) : [...cs, c.key]))}>
                <input type="checkbox" readOnly checked={cols.includes(c.key)} tabIndex={-1} />{c.label}
              </button>
            ))}
            <hr /><button onClick={() => setCols(p.defaultCols ?? p.columns.map(c => c.key))}>Restaurar padrão</button>
          </Menu>
        )}
        <Button icon onClick={doExport} aria-label="Exportar CSV" title={selected.size ? `Exportar ${selected.size} selecionado(s)` : 'Exportar resultados'}><Download /></Button>
      </div>

      {showFilters && (
        <div className="card filters-panel">
          {p.filters.map(f => (
            <Field key={f.key} label={f.label}>
              {f.options ? <Select value={fv[f.key] ?? ''} onChange={e => setFv({ ...fv, [f.key]: e.target.value })} options={f.options} placeholder="Todos" />
                : <Input type={f.kind.startsWith('date') ? 'date' : 'number'} min={0} value={fv[f.key] ?? ''} onChange={e => setFv({ ...fv, [f.key]: e.target.value })} placeholder={f.kind === 'daysSince' ? 'dias' : ''} />}
            </Field>
          ))}
          <div className="row" style={{ alignItems: 'flex-end' }}><Button variant="ghost" onClick={() => { setFv({}); setQ(''); }} disabled={!activeFilters && !q}><X />Limpar</Button></div>
        </div>
      )}

      {selected.size > 0 && p.bulk && (
        <div className="bulkbar" role="region" aria-label="Ações em massa">
          <strong className="small">{selected.size} selecionado(s)</strong>
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set(filtered.map(r => r.id)))}>Selecionar todos ({filtered.length})</Button>
          <span className="flex1" />
          {p.bulk([...selected], () => setSelected(new Set()))}
          <Button size="xs" variant="ghost" icon onClick={() => setSelected(new Set())} aria-label="Limpar seleção"><X /></Button>
        </div>
      )}

      {loading ? <div className="card"><SkeletonRows n={8} /></div>
        : filtered.length === 0 ? (p.rows.length === 0 ? p.empty : <div className="card"><Empty icon={<Search size={22} />} title="Nenhum resultado" text="Ajuste a busca ou os filtros para encontrar registros." action={<Button onClick={() => { setFv({}); setQ(''); }}>Limpar filtros</Button>} /></div>)
        : view === 'table' ? (
          <div className="card" style={{ padding: 6 }}>
            <DataTable rows={filtered} columns={p.columns} visible={cols} selected={selected} onSelect={p.bulk ? setSelected : undefined} onRowClick={p.onOpen} pageSize={p.pageSize ?? 12} />
          </div>
        ) : (
          <>
            <div className="cards stagger" key={paged.page}>
              {paged.slice.map(r => (
                <div key={r.id} className={`card rcard ${selected.has(r.id) ? 'selected' : ''} ${fresh.has(r.id) ? 'fresh' : ''}`} onClick={e => { if ((e.target as HTMLElement).closest('input,button,a')) return; p.onOpen(r); }} tabIndex={0} onKeyDown={e => e.key === 'Enter' && p.onOpen(r)} style={selected.has(r.id) ? { borderColor: 'var(--accent)' } : undefined}>
                  {p.bulk && <input type="checkbox" aria-label="Selecionar" checked={selected.has(r.id)} onChange={() => { const s = new Set(selected); s.has(r.id) ? s.delete(r.id) : s.add(r.id); setSelected(s); }} style={{ position: 'absolute', top: 14, right: 14 }} />}
                  {p.card(r)}
                </div>
              ))}
            </div>
            <Pager page={paged.page} pages={paged.pages} total={filtered.length} pageSize={p.pageSize ?? 12} onPage={paged.setPage} />
          </>
        )}
    </div>
  );
}
