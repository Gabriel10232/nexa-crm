import type { Appearance, AppearancePreset, ColorSet } from '../types';
import { deepClone } from '../lib/utils';

/* Base palette: #06141B · #11212D · #253745 · #4A5C6A · #9BA8AB · #CCD0CF */
export const DARK: ColorSet = {
  primary: '#CCD0CF', secondary: '#4A5C6A', accent: '#7FA7B5',
  bg: '#06141B', bg2: '#253745',
  text: '#E8ECEB', text2: '#9BA8AB', border: '#9BA8AB',
  button: '#CCD0CF', buttonText: '#06141B',
  sidebar: '#0B1A22', topbar: '#0B1A22', card: '#11212D',
  success: '#74C69D', warning: '#E0B66E', danger: '#E88383', info: '#86B4C6',
  charts: ['#CCD0CF', '#7FA7B5', '#5E8AA3', '#C8B88A', '#8C9EC4', '#6FA58A'],
};

export const LIGHT: ColorSet = {
  primary: '#11212D', secondary: '#4A5C6A', accent: '#2F6F87',
  bg: '#DDE2E1', bg2: '#9BA8AB',
  text: '#06141B', text2: '#3F4F5B', border: '#4A5C6A',
  button: '#11212D', buttonText: '#F2F4F3',
  sidebar: '#F4F6F5', topbar: '#F7F8F8', card: '#FFFFFF',
  success: '#23784F', warning: '#93630F', danger: '#B23B3B', info: '#2F6F87',
  charts: ['#11212D', '#2F6F87', '#6A93AA', '#A88B4A', '#5C6FA8', '#3E8A63'],
};

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'dark',
  colors: { dark: DARK, light: LIGHT },
  gradient: true,
  glass: {
    enabled: true, cardAlpha: 0.55, bgOpacity: 1, blur: 22, saturation: 140,
    borderAlpha: 0.14, borderWidth: 1, shadow: 0.35, innerGlow: 0.04, highlight: 0.16,
    sidebarAlpha: 0.5, topbarAlpha: 0.45, modalAlpha: 0.78, widgetAlpha: 0.55,
  },
  type: {
    family: 'Manrope', baseSize: 14, titleSize: 26, numberSize: 28, weight: 500,
    lineHeight: 1.5, letterSpacing: 0, titleStyle: 'tight', navSize: 13.5, buttonSize: 13.5,
  },
  space: {
    density: 'balanced', cardPadding: 20, gap: 16, margin: 28, sidebarWidth: 248,
    topbarHeight: 64, radius: 20, rowHeight: 52, iconSize: 18, widgetRow: 108,
  },
  a11y: { reduceMotion: false, highContrast: false, autoLite: true },
};

export const FONTS = ['Manrope', 'Inter', 'DM Sans', 'Plus Jakarta Sans', 'Roboto', 'Open Sans', 'System UI'];

export const DENSITY = {
  compact: { cardPadding: 14, gap: 10, margin: 18, rowHeight: 42, topbarHeight: 56, baseSize: 13 },
  balanced: { cardPadding: 20, gap: 16, margin: 28, rowHeight: 52, topbarHeight: 64, baseSize: 14 },
  comfortable: { cardPadding: 26, gap: 22, margin: 36, rowHeight: 60, topbarHeight: 72, baseSize: 15 },
} as const;

function make(name: string, fn: (a: Appearance) => void): AppearancePreset {
  const a = deepClone(DEFAULT_APPEARANCE);
  fn(a);
  return { id: 'preset_' + name.toLowerCase().replace(/\s+/g, '_'), name, builtin: true, appearance: a };
}

export const BUILTIN_PRESETS: AppearancePreset[] = [
  make('Premium', () => {}),
  make('Clean', a => { a.mode = 'light'; a.glass.cardAlpha = 0.8; a.glass.blur = 12; a.glass.shadow = 0.12; a.glass.highlight = 0.5; a.gradient = false; }),
  make('Glass suave', a => { a.glass.cardAlpha = 0.65; a.glass.blur = 14; a.glass.highlight = 0.1; a.glass.shadow = 0.2; }),
  make('Glass intenso', a => { a.glass.cardAlpha = 0.32; a.glass.blur = 34; a.glass.saturation = 180; a.glass.highlight = 0.28; a.glass.innerGlow = 0.08; a.glass.borderAlpha = 0.24; a.glass.sidebarAlpha = 0.3; a.glass.topbarAlpha = 0.3; a.glass.widgetAlpha = 0.32; }),
  make('Dark glass', a => { a.mode = 'dark'; a.colors.dark.card = '#0A1820'; a.glass.cardAlpha = 0.45; a.glass.blur = 28; a.glass.shadow = 0.55; }),
  make('Minimalista', a => { a.glass.enabled = false; a.gradient = false; a.glass.shadow = 0; a.glass.borderAlpha = 0.12; a.space.radius = 12; a.type.family = 'Inter'; }),
  make('Corporativo', a => { a.mode = 'light'; a.gradient = false; a.glass.cardAlpha = 0.92; a.glass.blur = 6; a.space.radius = 10; a.type.family = 'Roboto'; a.colors.light.accent = '#1F5A8C'; a.colors.light.button = '#1F3A52'; a.space.density = 'compact'; a.space.rowHeight = 44; }),
  make('Neon', a => { a.mode = 'dark'; a.colors.dark.accent = '#5CE1E6'; a.colors.dark.primary = '#5CE1E6'; a.colors.dark.button = '#5CE1E6'; a.colors.dark.charts = ['#5CE1E6', '#B388FF', '#FF7AC6', '#FFD166', '#7CF29C', '#6EA8FE']; a.glass.highlight = 0.3; a.glass.borderAlpha = 0.3; }),
  make('Alto contraste', a => {
    a.a11y.highContrast = true; a.glass.enabled = false; a.gradient = false;
    a.colors.dark = { ...a.colors.dark, bg: '#000000', card: '#0A0A0A', text: '#FFFFFF', text2: '#E0E0E0', border: '#FFFFFF', sidebar: '#000000', topbar: '#000000', button: '#FFFFFF', primary: '#FFFFFF' };
    a.colors.light = { ...a.colors.light, bg: '#FFFFFF', card: '#FFFFFF', text: '#000000', text2: '#1A1A1A', border: '#000000', sidebar: '#FFFFFF', topbar: '#FFFFFF', button: '#000000', primary: '#000000' };
    a.glass.borderAlpha = 0.9; a.glass.borderWidth = 2;
  }),
];
