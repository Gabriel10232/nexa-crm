/* Lightweight SVG charts themed by CSS variables (no chart library). */
import React, { useEffect, useId, useRef, useState } from 'react';
import { money, num } from '../lib/utils';

export const chartColor = (i: number) => `var(--chart-${(i % 6) + 1})`;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 400, h: 200 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(120, e.contentRect.width), h: Math.max(80, e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const fmt = (v: number, isMoney?: boolean) => (isMoney ? money(v, true) : num(v));

export interface Series { name: string; values: number[]; color?: string; dashed?: boolean }

export function LineChart({ labels, series, money: isMoney, area = true, type = 'area', height }: { labels: string[]; series: Series[]; money?: boolean; area?: boolean; type?: 'area' | 'line' | 'bar'; height?: number }) {
  const [ref, { w, h: hh }] = useSize<HTMLDivElement>();
  const h = height ?? hh;
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 46, r: 10, t: 10, b: 24 };
  const max = niceMax(Math.max(...series.flatMap(s => s.values), 0));
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const empty = series.every(se => se.values.every(v => !v));
  const sig = series.map(se => se.values.join(',')).join('|') + `${w}x${h}`;
  const clipId = `clip-${useId().replace(/:/g, '')}`;
  const bw = Math.min(28, (iw / labels.length) * 0.7 / series.length);
  const xb = (i: number, s: number) => pad.l + (i + 0.5) * (iw / labels.length) - (bw * series.length) / 2 + s * bw;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: height ?? '100%', minHeight: 120 }} onMouseLeave={() => setHover(null)}>
      <svg className="chart" width={w} height={h} role="img" aria-label={`Gráfico: ${series.map(s => s.name).join(', ')}`}
        onMouseMove={e => { const r = (e.currentTarget as SVGElement).getBoundingClientRect(); const px = e.clientX - r.left - pad.l; const i = type === 'bar' ? Math.floor(px / (iw / labels.length)) : Math.round((px / iw) * (labels.length - 1)); setHover(i >= 0 && i < labels.length ? i : null); }}>
        <defs>
          <clipPath id={clipId}><rect key={sig} className="chart-reveal" x={0} y={0} width={w} height={h} /></clipPath>
          {series.map((s, i) => (
            <linearGradient key={i} id={`g-${i}-${s.name.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? chartColor(i)} stopOpacity=".35" /><stop offset="100%" stopColor={s.color ?? chartColor(i)} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, .25, .5, .75, 1].map(t => (
          <g key={t}><line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} />{!empty && <text x={pad.l - 8} y={y(max * t) + 4} textAnchor="end">{fmt(max * t, isMoney)}</text>}</g>
        ))}
        {labels.map((l, i) => (labels.length <= 12 || i % Math.ceil(labels.length / 12) === 0) && <text key={i} x={type === 'bar' ? pad.l + (i + .5) * (iw / labels.length) : x(i)} y={h - 6} textAnchor="middle">{l}</text>)}
        {type === 'bar' ? series.map((s, si) => s.values.map((v, i) => (
          <rect key={`${si}-${i}-${sig}`} className="bar-grow" style={{ ['--i' as string]: i, transition: 'opacity 150ms' } as React.CSSProperties} x={xb(i, si)} y={y(v)} width={Math.max(2, bw - 2)} height={Math.max(0, pad.t + ih - y(v))} rx={Math.min(6, bw / 3)} fill={s.color ?? chartColor(si)} opacity={hover === null || hover === i ? 1 : .45} />
        ))) : series.map((s, si) => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as const);
          const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          return (
            <g key={si} clipPath={`url(#${clipId})`}>
              {area && type === 'area' && !s.dashed && <path d={`${d} L ${x(s.values.length - 1)} ${pad.t + ih} L ${x(0)} ${pad.t + ih} Z`} fill={`url(#g-${si}-${s.name.replace(/\W/g, '')})`} />}
              <path d={d} fill="none" stroke={s.color ?? chartColor(si)} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color ?? chartColor(si)} stroke="rgb(var(--card-rgb))" strokeWidth={2} />}
            </g>
          );
        })}
        {hover !== null && type !== 'bar' && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgb(var(--border-rgb) / .35)" />}
      </svg>
      {empty && <div className="chart-empty">Sem dados no período</div>}
      {hover !== null && !empty && (
        <div className="chart-tip" style={{ left: type === 'bar' ? pad.l + (hover + .5) * (iw / labels.length) : x(hover), top: y(Math.max(...series.map(s => s.values[hover] ?? 0))) }}>
          <div className="strong" style={{ marginBottom: 4 }}>{labels[hover]}</div>
          {series.map((s, i) => <div key={i} className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: s.color ?? chartColor(i), display: 'inline-block' }} />{s.name}: <strong>{fmt(s.values[hover] ?? 0, isMoney)}</strong></div>)}
        </div>
      )}
    </div>
  );
}

export function Donut({ data, money: isMoney, size = 150, center }: { data: { label: string; value: number }[]; money?: boolean; size?: number; center?: React.ReactNode }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const sig = data.map(d => d.value).join(',');
  const [hover, setHover] = useState<number | null>(null);
  if (!data.some(d => d.value)) return <div className="chart-empty static">Sem dados para exibir</div>;
  const r = 42, c = 2 * Math.PI * r; let acc = 0;
  return (
    <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap', height: '100%' }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Gráfico de rosca" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--text-rgb) / .07)" strokeWidth="12" />
          {data.map((d, i) => {
            const len = (d.value / total) * c; const el = (
              <circle key={`${i}-${sig}`} className="donut-seg" cx="50" cy="50" r={r} fill="none" stroke={chartColor(i)} strokeWidth={hover === i ? 15 : 12} strokeDasharray={`${Math.max(0, len - 1)} ${c}`} strokeDashoffset={-acc}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: 'stroke-width 150ms', cursor: 'pointer', animationDelay: `${i * 70}ms` }} />);
            acc += len; return el;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          {hover !== null ? <div><div className="strong num">{fmt(data[hover].value, isMoney)}</div><div className="xs muted">{((data[hover].value / total) * 100).toFixed(0)}%</div></div> : center}
        </div>
      </div>
      <div className="stack-sm flex1" style={{ minWidth: 120, gap: 6 }}>
        {data.map((d, i) => (
          <div key={i} className="row between small" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ opacity: hover === null || hover === i ? 1 : .55 }}>
            <span className="row ellipsis" style={{ gap: 8 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: chartColor(i), flex: 'none' }} /><span className="ellipsis">{d.label}</span></span>
            <span className="num strong">{fmt(d.value, isMoney)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ data, money: isMoney, colorIndex }: { data: { label: string; value: number; sub?: string }[]; money?: boolean; colorIndex?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  if (!data.length || !data.some(d => d.value)) return <div className="chart-empty static">Sem dados para exibir</div>;
  return (
    <div className="stack-sm" style={{ gap: 10 }}>
      {data.map((d, i) => (
        <div key={i} className="funnel-row" style={{ gridTemplateColumns: 'minmax(80px, 130px) 1fr auto' }}>
          <span className="ellipsis" title={d.label}>{d.label}</span>
          <div className="funnel-bar bar-x" style={{ animationDelay: `${i * 60}ms`, width: `${(d.value / max) * 100}%`, background: colorIndex !== undefined ? chartColor(colorIndex) : `linear-gradient(90deg, ${chartColor(i)}, color-mix(in srgb, ${chartColor(i)} 45%, transparent))` }} />
          <span className="num strong" style={{ textAlign: 'right' }}>{fmt(d.value, isMoney)}{d.sub && <span className="muted xs"> {d.sub}</span>}</span>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div className="stack-sm" style={{ gap: 8 }}>
      {steps.map((s, i) => (
        <div key={s.label} className="funnel-row">
          <span>{s.label}</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><div className="funnel-bar bar-x" style={{ animationDelay: `${i * 70}ms`, width: `${Math.max(6, (s.value / max) * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${chartColor(1)} ${100 - i * 12}%, transparent), ${chartColor(1)})`, opacity: 1 - i * .08 }} /></div>
          <span className="num strong" style={{ textAlign: 'right' }}>{num(s.value)}{i > 0 && steps[i - 1].value ? <span className="muted xs"> · {Math.round((s.value / steps[i - 1].value) * 100)}%</span> : null}</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = 'var(--accent)', w = 90, h = 28 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ');
  return <svg width={w} height={h} aria-hidden style={{ overflow: 'visible' }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
