/* Performance guards (target: smooth 60fps). Written before the optimisation (TDD). */
import React, { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CountUp } from '../components/ui';
import { WidgetBody } from '../modules/dashboard/widgets';
import { store } from '../store/store';
import { activeAdapter } from '../services/storage';

const css = readFileSync(resolve(__dirname, '../styles/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ sel: m[1].split(',').map(s => s.trim()), body: m[2] }));
const declares = (selector: string, prop: RegExp) => blocks.some(b => b.sel.includes(selector) && prop.test(b.body));

beforeEach(() => store.reset());

describe('GPU cost: backdrop blur only where content actually scrolls underneath', () => {
  it('content cards do not use backdrop-filter (they sit over a static gradient)', () => {
    expect(declares('.card', /backdrop-filter/)).toBe(false);
    expect(declares('.glass', /backdrop-filter/)).toBe(false);
  });
  it('the sidebar does not blur (nothing scrolls behind it)', () => {
    expect(declares('.sidebar', /backdrop-filter/)).toBe(false);
  });
  it('the sticky topbar keeps its glass blur', () => {
    expect(declares('.topbar', /backdrop-filter/)).toBe(true);
  });
  it('no mix-blend-mode on per-card sheen layers (forces offscreen compositing)', () => {
    expect(declares('.glass::before', /mix-blend-mode/)).toBe(false);
  });
  it('the fixed ambient background is promoted to its own layer', () => {
    expect(declares('body::before', /will-change:\s*transform|transform:\s*translateZ/)).toBe(true);
  });
});

describe('React work per frame', () => {
  it('CountUp animates without re-rendering React on every frame', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    let commits = 0;
    render(<Profiler id="c" onRender={() => { commits++; }}><CountUp value={1000} format={n => String(Math.round(n))} /></Profiler>);
    const start = commits;
    // advance frame by frame (separate acts) so each frame could commit on its own
    for (let i = 0; i < 50; i++) act(() => { vi.advanceTimersByTime(16); });
    expect(commits - start).toBeLessThanOrEqual(1);
    expect(document.body.textContent).toContain('1000');
    vi.useRealTimers();
  });
  it('dashboard widgets are memoised so one widget change does not re-render all', () => {
    expect((WidgetBody as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
  it('persists to storage once per burst of edits (debounced)', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(activeAdapter, 'save');
    for (let i = 0; i < 20; i++) store.set(s => ({ ...s }));
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
