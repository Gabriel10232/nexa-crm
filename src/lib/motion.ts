/** Theme switch with a circular reveal (View Transitions API).
 * `applyCss` only rewrites CSS variables (cheap, no React render) and runs inside the
 * transition; `commit` (store update + React re-render + persistence) runs after the
 * animation has finished so no frame of the reveal is spent on JS work. */
export function animateTheme(point: { clientX: number; clientY: number }, applyCss: () => void, commit: () => void) {
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (root.dataset.motion === 'reduce' || !doc.startViewTransition) {
    if (root.dataset.motion !== 'reduce') { root.classList.add('theme-fade'); setTimeout(() => root.classList.remove('theme-fade'), 500); }
    applyCss(); commit();
    return;
  }
  const { clientX: x, clientY: y } = point;
  root.style.setProperty('--vt-x', `${x}px`); root.style.setProperty('--vt-y', `${y}px`);
  root.style.setProperty('--vt-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  root.classList.add('vt-theme');
  const t = doc.startViewTransition(applyCss);
  t.finished.finally(() => { root.classList.remove('vt-theme'); commit(); });
}
