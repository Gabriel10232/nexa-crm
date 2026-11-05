import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { webcrypto } from 'node:crypto';

// jsdom gaps
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

let reduceMotion = false;
export const setSystemReducedMotion = (v: boolean) => { reduceMotion = v; };
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? reduceMotion : false,
    media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }),
});
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
if (!Element.prototype.animate) Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} })) as unknown as Element['animate'];
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

afterEach(() => { cleanup(); localStorage.clear(); document.body.style.overflow = ''; });
