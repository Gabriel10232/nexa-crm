import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

export interface Toast { id: number; kind: 'success' | 'error' | 'info' | 'warning'; title: string; body?: string; action?: { label: string; run: () => void } }
export interface ConfirmReq {
  id: number;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  typeToConfirm?: string;
  resolve: (ok: boolean) => void;
}
export interface PromptReq { id: number; title: string; label: string; options?: string[]; initial?: string; required?: boolean; resolve: (v: string | null) => void }

interface UIState { toasts: Toast[]; confirm: ConfirmReq | null; prompt: PromptReq | null; palette: boolean; copilot: boolean; sidebar: boolean; mobileNav: boolean }

let ui: UIState = { toasts: [], confirm: null, prompt: null, palette: false, copilot: false, sidebar: localStorage.getItem('nexa:sidebar') !== 'collapsed', mobileNav: false };
const ls = new Set<() => void>();
const set = (p: Partial<UIState>) => { ui = { ...ui, ...p }; ls.forEach(l => l()); };
let n = 0;

export const useUI = <T,>(sel: (s: UIState) => T) => useSyncExternalStore(cb => { ls.add(cb); return () => ls.delete(cb); }, () => sel(ui));

export const toast = (kind: Toast['kind'], title: string, body?: string, action?: Toast['action']) => {
  const t = { id: ++n, kind, title, body, action };
  set({ toasts: [...ui.toasts, t].slice(-4) });
  setTimeout(() => dismissToast(t.id), action ? 6500 : 4200);
};
export const dismissToast = (id: number) => set({ toasts: ui.toasts.filter(t => t.id !== id) });

export const confirm = (o: Omit<ConfirmReq, 'id' | 'resolve'>) =>
  new Promise<boolean>(resolve => set({ confirm: { ...o, id: ++n, resolve: ok => { set({ confirm: null }); resolve(ok); } } }));

export const prompt = (o: Omit<PromptReq, 'id' | 'resolve'>) =>
  new Promise<string | null>(resolve => set({ prompt: { ...o, id: ++n, resolve: v => { set({ prompt: null }); resolve(v); } } }));

export const uiActions = {
  palette: (v: boolean) => set({ palette: v }),
  copilot: (v: boolean) => set({ copilot: v }),
  toggleSidebar: () => { localStorage.setItem('nexa:sidebar', ui.sidebar ? 'collapsed' : 'open'); set({ sidebar: !ui.sidebar }); },
  mobileNav: (v: boolean) => set({ mobileNav: v }),
};
