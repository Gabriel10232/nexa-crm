import type { Appearance } from '../types';
import { hexToRgb } from './utils';

const GOOGLE_FONTS: Record<string, string> = {
  Manrope: 'Manrope:wght@400;500;600;700;800',
  Inter: 'Inter:wght@400;500;600;700;800',
  'DM Sans': 'DM+Sans:wght@400;500;600;700',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800',
  Roboto: 'Roboto:wght@400;500;700;900',
  'Open Sans': 'Open+Sans:wght@400;500;600;700;800',
};

export function resolvedMode(a: Appearance): 'dark' | 'light' {
  if (a.mode !== 'auto') return a.mode;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Detects low-end devices or OS preferences that call for simpler effects. */
export function shouldLite() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowCpu = (nav.hardwareConcurrency || 8) <= 4;
  const lowMem = (nav.deviceMemory || 8) <= 4;
  const reducedTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
  return lowCpu || lowMem || !!reducedTransparency;
}

/** Applies every appearance token as CSS custom properties — the single source of truth for the UI. */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  const mode = resolvedMode(a);
  const c = a.colors[mode];
  const g = a.glass;
  const s = a.space;
  const t = a.type;
  const lite = a.a11y.autoLite && shouldLite();
  const reduceMotion = a.a11y.reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  root.dataset.theme = mode;
  root.dataset.glass = !g.enabled ? 'off' : lite ? 'lite' : 'on';
  root.dataset.motion = reduceMotion ? 'reduce' : 'full';
  root.dataset.contrast = a.a11y.highContrast ? 'high' : 'normal';
  root.dataset.gradient = a.gradient ? 'on' : 'off';
  root.dataset.titles = t.titleStyle;

  const vars: Record<string, string> = {
    '--primary': c.primary, '--secondary': c.secondary, '--accent': c.accent,
    '--accent-rgb': hexToRgb(c.accent), '--primary-rgb': hexToRgb(c.primary),
    '--bg': c.bg, '--bg-rgb': hexToRgb(c.bg), '--bg2': c.bg2, '--bg2-rgb': hexToRgb(c.bg2),
    '--text': c.text, '--text-rgb': hexToRgb(c.text), '--text2': c.text2,
    '--border-rgb': hexToRgb(c.border),
    '--btn': c.button, '--btn-text': c.buttonText,
    '--sidebar-rgb': hexToRgb(c.sidebar), '--topbar-rgb': hexToRgb(c.topbar), '--card-rgb': hexToRgb(c.card),
    '--success': c.success, '--warning': c.warning, '--danger': c.danger, '--info': c.info,
    '--success-rgb': hexToRgb(c.success), '--warning-rgb': hexToRgb(c.warning), '--danger-rgb': hexToRgb(c.danger), '--info-rgb': hexToRgb(c.info),
    '--card-a': String(g.enabled ? g.cardAlpha : 1),
    '--widget-a': String(g.enabled ? g.widgetAlpha : 1),
    '--sidebar-a': String(g.enabled ? g.sidebarAlpha : 1),
    '--topbar-a': String(g.enabled ? g.topbarAlpha : 1),
    '--modal-a': String(g.enabled ? g.modalAlpha : 1),
    '--bg-opacity': String(g.bgOpacity),
    '--blur': `${g.enabled ? (lite ? Math.min(g.blur, 8) : g.blur) : 0}px`,
    '--sat': `${g.enabled ? g.saturation : 100}%`,
    '--border-a': String(g.borderAlpha), '--border-w': `${g.borderWidth}px`,
    '--shadow-a': String(g.shadow), '--glow-a': String(g.enabled ? g.innerGlow : 0), '--hl-a': String(g.enabled ? g.highlight : 0),
    '--font': t.family === 'System UI' ? 'system-ui, -apple-system, Segoe UI, sans-serif' : `'${t.family}', system-ui, sans-serif`,
    '--fs': `${t.baseSize}px`, '--fs-title': `${t.titleSize}px`, '--fs-num': `${t.numberSize}px`,
    '--fw': String(t.weight), '--lh': String(t.lineHeight), '--ls': `${t.letterSpacing}em`,
    '--fs-nav': `${t.navSize}px`, '--fs-btn': `${t.buttonSize}px`,
    '--pad': `${s.cardPadding}px`, '--gap': `${s.gap}px`, '--margin': `${s.margin}px`,
    '--sidebar-w': `${s.sidebarWidth}px`, '--topbar-h': `${s.topbarHeight}px`,
    '--radius': `${s.radius}px`, '--radius-sm': `${Math.max(6, s.radius * 0.55)}px`,
    '--row-h': `${s.rowHeight}px`, '--icon': `${s.iconSize}px`, '--widget-row': `${s.widgetRow}px`,
  };
  c.charts.forEach((col, i) => (vars[`--chart-${i + 1}`] = col));
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', c.bg);

  // Load font on demand
  const link = document.getElementById('font-link') as HTMLLinkElement | null;
  const fam = GOOGLE_FONTS[t.family];
  if (link && fam) {
    const href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`;
    if (link.href !== href) link.href = href;
  }
}

export function applyBranding(productName: string, favicon?: string) {
  document.title = productName;
  if (favicon) (document.getElementById('app-favicon') as HTMLLinkElement | null)?.setAttribute('href', favicon);
}
