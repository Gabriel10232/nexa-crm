import { useSyncExternalStore, useRef, useCallback } from 'react';
import type { Tenant, TenantData } from '../types';
import { activeAdapter } from '../services/storage';
import { generateTenant, blankTenant } from '../data/seed';
import { DEFAULT_APPEARANCE } from '../config/appearance';

export interface SessionState { userId: string; tenantId: string; realUserId: string; startedAt: string; }

export interface AppState {
  version: number;
  tenants: Tenant[];
  session: SessionState | null;
}

const KEY = 'nexa-crm:state';
const VERSION = 6;

/** Production default: one empty organization, no users. The first visitor creates the owner account. */
function initialState(): AppState {
  return { version: VERSION, tenants: [{ id: 'org_main', name: '', data: blankTenant('', 'b2b') }], session: null };
}

export function demoTenants() {
  return [
    { id: 'org_aurora', name: 'Aurora Tecnologia (demo)', data: generateTenant({ orgName: 'Aurora Tecnologia (demo)', seed: 42, template: 'b2b', scale: 1, segment: 'Tecnologia' }) },
    { id: 'org_vertice', name: 'Vértice Imóveis (demo)', data: generateTenant({ orgName: 'Vértice Imóveis (demo)', seed: 99, template: 'imobiliaria', scale: 0.5, segment: 'Imobiliário' }) },
  ];
}

/* ---------- Save status (drives the "Salvando… / Salvo" indicator) ---------- */
type SaveStatus = 'idle' | 'saving' | 'saved';
let saveStatus: SaveStatus = 'idle';
const saveListeners = new Set<() => void>();
let savedTimer: number | undefined;
function setSave(s: SaveStatus) { saveStatus = s; saveListeners.forEach(l => l()); }
export const useSaveStatus = () => useSyncExternalStore(cb => { saveListeners.add(cb); return () => saveListeners.delete(cb); }, () => saveStatus);

function load(): AppState {
  const saved = activeAdapter.load<AppState>(KEY);
  if (saved && saved.version === VERSION && saved.tenants?.length) {
    // forward-compat: fill new appearance keys
    saved.tenants.forEach(t => {
      t.data.appearance = { ...DEFAULT_APPEARANCE, ...t.data.appearance, glass: { ...DEFAULT_APPEARANCE.glass, ...t.data.appearance?.glass }, type: { ...DEFAULT_APPEARANCE.type, ...t.data.appearance?.type }, space: { ...DEFAULT_APPEARANCE.space, ...t.data.appearance?.space }, a11y: { ...DEFAULT_APPEARANCE.a11y, ...t.data.appearance?.a11y } };
    });
    return saved;
  }
  return initialState();
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

function persist() {
  window.clearTimeout(saveTimer); window.clearTimeout(savedTimer);
  setSave('saving');
  saveTimer = window.setTimeout(() => {
    activeAdapter.save(KEY, state);
    setSave('saved');
    savedTimer = window.setTimeout(() => setSave('idle'), 1600);
  }, 350);
}

export const store = {
  get: () => state,
  set(next: AppState | ((s: AppState) => AppState)) {
    state = typeof next === 'function' ? (next as (s: AppState) => AppState)(state) : next;
    persist();
    listeners.forEach(l => l());
  },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  reset() { state = initialState(); activeAdapter.save(KEY, state); listeners.forEach(l => l()); },
  flush() { window.clearTimeout(saveTimer); activeAdapter.save(KEY, state); },
};

window.addEventListener('beforeunload', () => store.flush());

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

/** Current tenant data (multi-tenant isolation: everything is scoped to the session's org). */
export function currentTenant(s: AppState = state): Tenant {
  const id = s.session?.tenantId ?? s.tenants[0].id;
  return s.tenants.find(t => t.id === id) ?? s.tenants[0];
}

export function useTenant(): TenantData {
  return useStore(s => currentTenant(s).data);
}

/** Selector hook with memoised derived values; recomputes only when tenant data ref changes. */
export function useDerived<T>(fn: (d: TenantData) => T, deps: unknown[] = []): T {
  const d = useTenant();
  const cache = useRef<{ d?: TenantData; deps?: unknown[]; v?: T }>({});
  const same = cache.current.d === d && cache.current.deps?.length === deps.length && deps.every((x, i) => x === cache.current.deps![i]);
  if (!same) cache.current = { d, deps, v: fn(d) };
  return cache.current.v as T;
}

/** Immutable update of the active tenant. `fn` receives a shallow copy it may mutate. */
export function updateTenant(fn: (d: TenantData) => void) {
  store.set(s => {
    const t = currentTenant(s);
    const data: TenantData = { ...t.data };
    fn(data);
    return { ...s, tenants: s.tenants.map(x => (x.id === t.id ? { ...x, name: data.org.name, data } : x)) };
  });
}

export function useStableCallback<T extends (...a: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn); ref.current = fn;
  return useCallback(((...a: never[]) => ref.current(...a)) as T, []);
}
