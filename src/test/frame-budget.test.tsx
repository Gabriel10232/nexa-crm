/* Frame-budget guards from the production measurement (165Hz display):
 * - Pipeline mount had one 30–49ms frame: every row rebuilt all lookup maps.
 * - Theme switch ran at ~55fps: the whole app re-rendered during the reveal.
 * Written before the fixes (TDD). */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { useLookups } from '../components/common';
import { useStableData } from '../modules/dashboard/Dashboard';
import { animateTheme } from '../lib/motion';
import { store } from '../store/store';
import { withDemo } from './helpers';
import type { TenantData } from '../types';

beforeEach(() => store.reset());

describe('Lookup maps are built once per data version, not once per row', () => {
  it('every component shares the same lookup object', () => {
    withDemo();
    const seen: unknown[] = [];
    function Row() { seen.push(useLookups()); return null; }
    render(<>{Array.from({ length: 30 }, (_, i) => <Row key={i} />)}</>);
    expect(new Set(seen).size).toBe(1);
  });
});

describe('Theme switch does no React work while the reveal animates', () => {
  it('applies CSS variables inside the transition and commits to the store only after it finishes', async () => {
    let finish!: () => void;
    const finished = new Promise<void>(r => { finish = r; });
    const order: string[] = [];
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => { cb(); order.push('snapshot'); return { finished }; };
    document.documentElement.dataset.motion = 'full';
    animateTheme({ clientX: 10, clientY: 10 }, () => order.push('css'), () => order.push('commit'));
    expect(order).toEqual(['css', 'snapshot']);
    finish(); await finished; await Promise.resolve();
    expect(order).toEqual(['css', 'snapshot', 'commit']);
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });
  it('reduced motion applies and commits immediately', () => {
    document.documentElement.dataset.motion = 'reduce';
    const css = vi.fn(), commit = vi.fn();
    animateTheme({ clientX: 0, clientY: 0 }, css, commit);
    expect(css).toHaveBeenCalled(); expect(commit).toHaveBeenCalled();
  });
});

describe('Dashboard widgets ignore appearance-only changes', () => {
  it('keeps the same data object when only the appearance changed', () => {
    const d = withDemo();
    const { result, rerender } = renderHook(({ data }) => useStableData(data), { initialProps: { data: d } });
    const first = result.current;
    rerender({ data: { ...d, appearance: { ...d.appearance, mode: 'light' } } as TenantData });
    expect(result.current).toBe(first);
    rerender({ data: { ...d, leads: [...d.leads] } as TenantData });
    expect(result.current).not.toBe(first);
  });
});
