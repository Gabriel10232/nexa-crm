import type { ISODate } from '../types';

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

let currency = 'BRL';
let locale = 'pt-BR';
export const setLocale = (cur: string, loc: string) => { currency = cur; locale = loc; };

export const money = (v: number, compact = false) =>
  new Intl.NumberFormat(locale, {
    style: 'currency', currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(v || 0);

export const num = (v: number, d = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(v || 0);
export const pct = (v: number, d = 1) => `${num(v, d)}%`;

export const DAY = 86400000;
export const now = () => new Date();
export const iso = (d: Date | number = new Date()) => new Date(d).toISOString();
export const addDays = (d: Date | string, n: number) => new Date(new Date(d).getTime() + n * DAY);
export const daysBetween = (a: Date | string, b: Date | string = new Date()) =>
  Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);
export const startOfDay = (d: Date | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const sameDay = (a: Date | string, b: Date | string) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const monthKey = (d: Date | string) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

export const fmtDate = (d?: ISODate | Date, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat(locale, opts).format(new Date(d)) : '—';
export const fmtDateTime = (d?: ISODate | Date) =>
  d ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '—';
export const fmtTime = (d?: ISODate | Date) =>
  d ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '';

export const relTime = (d?: ISODate) => {
  if (!d) return '—';
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return 'agora';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / 86400 / 30), 'month');
  return rtf.format(Math.round(diff / 86400 / 365), 'year');
};

export const toInputDate = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const toInputDateTime = (d?: string) => {
  if (!d) return '';
  const x = new Date(d);
  const off = x.getTimezoneOffset() * 60000;
  return new Date(x.getTime() - off).toISOString().slice(0, 16);
};
export const fromInputDate = (s: string) => (s ? new Date(s + (s.length === 10 ? 'T12:00:00' : '')).toISOString() : undefined);

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export const normalize = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const digits = (s?: string) => (s || '').replace(/\D/g, '');

export const matchesSearch = (obj: Record<string, unknown>, q: string) => {
  if (!q) return true;
  const n = normalize(q);
  return Object.values(obj).some(v =>
    typeof v === 'string' || typeof v === 'number' ? normalize(v).includes(n)
      : Array.isArray(v) ? v.some(x => typeof x === 'string' && normalize(x).includes(n)) : false);
};

export function sortBy<T>(arr: T[], key: (t: T) => unknown, dir: 'asc' | 'desc' = 'asc') {
  const m = dir === 'asc' ? 1 : -1;
  return [...arr].sort((a, b) => {
    const va = key(a) as never, vb = key(b) as never;
    if (va == null) return 1; if (vb == null) return -1;
    return (va > vb ? 1 : va < vb ? -1 : 0) * m;
  });
}

export function groupCount<T>(arr: T[], key: (t: T) => string) {
  const m: Record<string, number> = {};
  arr.forEach(a => { const k = key(a); m[k] = (m[k] || 0) + 1; });
  return m;
}

/* ---------- Validation (Brazilian documents) ---------- */
export const isEmail = (s?: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const isPhone = (s?: string) => !s || digits(s).length >= 10;
export function isCPF(s?: string) {
  const c = digits(s); if (!s) return true;
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => { let sum = 0; for (let i = 0; i < n; i++) sum += +c[i] * (n + 1 - i); const r = (sum * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === +c[9] && calc(10) === +c[10];
}
export function isCNPJ(s?: string) {
  const c = digits(s); if (!s) return true;
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((acc, wi, i) => acc + wi * +c[i], 0); const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +c[12] && calc(13) === +c[13];
}
export const maskCPF = (s: string) => digits(s).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
export const maskCNPJ = (s: string) => digits(s).slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
export const maskPhone = (s: string) => {
  const d = digits(s).slice(0, 11);
  return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
};
export const maskCEP = (s: string) => digits(s).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');

/* ---------- CSV ---------- */
export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = Array.isArray(v) ? v.join('|') : String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\n');
}
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g)?.length || 0) >= (lines[0].match(/,/g)?.length || 0) ? ';' : ',';
  const split = (line: string) => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const headers = split(lines[0]).map(h => normalize(h));
  return lines.slice(1).map(l => { const cells = split(l); const o: Record<string, string> = {}; headers.forEach((h, i) => (o[h] = cells[i] ?? '')); return o; });
}
export function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Color ---------- */
export const hexToRgb = (hex: string) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
export const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).split(' ').map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
