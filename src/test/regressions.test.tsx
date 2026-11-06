/* Regression suite: every test here reproduces a bug that already happened.
 * If one fails, the bug is back. */
import React, { Suspense } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Menu, Button, Modal } from '../components/ui';
import { Donut, LineChart, HBars } from '../components/charts';
import { store } from '../store/store';
import { toast, dismissToast } from '../store/ui';
import { signIn, signUp } from '../services/auth';
import { leads as leadSvc, people as peopleSvc, deals as dealSvc } from '../services/crm';
import { applyAppearance } from '../lib/theme';
import { DEFAULT_APPEARANCE } from '../config/appearance';
import { deepClone } from '../lib/utils';
import Login from '../modules/auth/Login';
import { Shell } from '../layout/Shell';
import { resetStore, withDemo, tenantData, renderAt, Route } from './helpers';
import { setSystemReducedMotion } from './setup';

const css = readFileSync(resolve(__dirname, '../styles/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** All declaration blocks whose selector list contains `selector` exactly. */
const rulesFor = (selector: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(m => m[1].split(',').map(s => s.trim()).includes(selector)).map(m => m[2]);

beforeEach(() => resetStore());

describe('Bug: profile menu closed when scrolling its own list', () => {
  const open = () => {
    render(<Menu trigger={p => <Button {...p}>Perfil</Button>}>{[...Array(30)].map((_, i) => <button key={i}>Item {i}</button>)}</Menu>);
    fireEvent.click(screen.getByText('Perfil'));
    return screen.getByRole('menu');
  };
  it('stays open when the menu itself scrolls', () => {
    const menu = open();
    fireEvent.scroll(menu);
    expect(screen.queryByRole('menu')).toBeInTheDocument();
  });
  it('closes when the page behind scrolls', () => {
    open();
    fireEvent.scroll(document);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
  it('behaves like a fixed modal: the page cannot scroll while the menu is open', () => {
    open();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByText('Perfil'));
    expect(document.body.style.overflow).toBe('');
  });
  it('scrolling past the end of the list never chains to the page', () => {
    expect(rulesFor('.menu').join(';')).toMatch(/overscroll-behavior:\s*contain/);
  });
  it('does not crash when the scroll target is window (not a Node)', () => {
    open();
    expect(() => act(() => { window.dispatchEvent(new Event('scroll')); })).not.toThrow();
  });
});

describe('Bug: first navigation flashed a blank screen (lazy route replaced the whole app)', () => {
  it('keeps the shell (sidebar) visible while a page chunk is loading', async () => {
    withDemo();
    const Never = React.lazy(() => new Promise<{ default: React.FC }>(() => {}));
    const { container } = renderAt('/', <Route element={<Shell />}><Route index element={<Never />} /></Route>);
    expect(screen.getByLabelText('Navegação principal')).toBeInTheDocument();
    expect(container.querySelector('main .page-fallback')).toBeInTheDocument();
  });
});

describe('Bug: "Personalizar aparência" scrolled the page instead of the panel', () => {
  it('caps drawers to the viewport', () => {
    expect(rulesFor('.drawer').join(';')).toMatch(/max-height:\s*100dvh/);
  });
  it('lets the modal body shrink and scroll', () => {
    const body = rulesFor('.modal-body').join(';');
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/overscroll-behavior:\s*contain/);
  });
  it('locks page scroll while a modal is open', () => {
    const { unmount } = render(<Modal open onClose={() => {}} title="X">conteúdo</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('Requirement: system starts with no data', () => {
  it('has no users or records on first load', () => {
    const d = store.get().tenants[0].data;
    expect(d.users).toHaveLength(0);
    expect([d.leads, d.people, d.companies, d.deals, d.tasks, d.events, d.proposals].every(a => a.length === 0)).toBe(true);
  });
  it('login page shows only the sign-up form, no fictitious profiles', () => {
    renderAt('/login', <Route path="/login" element={<Login />} />);
    expect(screen.getByRole('heading', { name: 'Criar sua conta' })).toBeInTheDocument();
    expect(screen.queryByText(/demonstração/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Marina Duarte')).not.toBeInTheDocument();
  });
  it('demo access only exists on the separate test page', () => {
    renderAt('/teste', <Route path="/teste" element={<Login testMode />} />);
    expect(screen.getByText(/Explorar uma demonstração/)).toBeInTheDocument();
  });
  it('sign-up hashes the password and sign-in validates it', async () => {
    await signUp('Ana Teste', 'ana@teste.test', 'segredo1');
    const u = store.get().tenants[0].data.users[0];
    expect(u.role).toBe('owner');
    expect(u.passwordHash).toBeDefined();
    expect(u.passwordHash).not.toContain('segredo1');
    expect((await signIn('ana@teste.test', 'errada')).ok).toBe(false);
    expect((await signIn('ANA@teste.test', 'segredo1')).ok).toBe(true);
  });
});

describe('Bug: lead distribution gave every lead to the same seller', () => {
  it('spreads leads across sellers by current load', () => {
    const d = withDemo();
    const ids = d.leads.filter(l => !l.archivedAt).slice(0, 12).map(l => l.id);
    leadSvc.distribute(ids);
    const owners = new Set(tenantData().leads.filter(l => ids.includes(l.id)).map(l => l.ownerId));
    expect(owners.size).toBeGreaterThan(1);
  });
});

describe('Lead conversion and person transfer keep history without duplicating', () => {
  it('converting reuses an existing person and re-points the lead history', () => {
    const d = withDemo();
    const person = d.people[1];
    const { lead } = leadSvc.create({ kind: 'individual', name: person.name, email: person.email, source: 'Site', value: 1000, temperature: 'morno', ownerId: 'u_marina', teamId: 'team_ent', status: 'novo', tags: ['X'] });
    const before = tenantData().people.length;
    const out = leadSvc.convert(lead.id, { mode: 'customer', existingPersonId: person.id });
    expect(out.personId).toBe(person.id);
    expect(tenantData().people.length).toBe(before);
    expect(tenantData().activities.filter(a => a.refs.leadId === lead.id).every(a => a.refs.personId === person.id)).toBe(true);
  });
  it('transferring a person between companies keeps the individual history', () => {
    const d = withDemo();
    const p = d.people.find(x => x.companyId)!;
    const acts = tenantData().activities.filter(a => a.refs.personId === p.id).length;
    const target = d.companies.find(c => c.id !== p.companyId)!;
    peopleSvc.transfer(p.id, target.id);
    const after = tenantData().people.find(x => x.id === p.id)!;
    expect(after.companyId).toBe(target.id);
    expect(after.companyHistory.filter(h => h.to)).toHaveLength(1);
    expect(tenantData().activities.filter(a => a.refs.personId === p.id).length).toBeGreaterThan(acts);
  });
  it('losing a deal records the loss reason', () => {
    const d = withDemo();
    const deal = d.deals.find(x => x.status === 'open')!;
    const lost = d.pipelines.find(p => p.id === deal.pipelineId)!.stages.find(s => s.kind === 'lost')!;
    dealSvc.move(deal.id, lost.id, 'Preço acima do orçamento');
    const x = tenantData().deals.find(y => y.id === deal.id)!;
    expect(x.status).toBe('lost');
    expect(x.lostReason).toBe('Preço acima do orçamento');
  });
});

describe('Bug: charts with no data (empty system)', () => {
  it('Donut switches from empty to data without breaking hook order', () => {
    const { rerender } = render(<Donut data={[{ label: 'A', value: 0 }]} />);
    expect(screen.getByText('Sem dados para exibir')).toBeInTheDocument();
    expect(() => rerender(<Donut data={[{ label: 'A', value: 3 }, { label: 'B', value: 2 }]} />)).not.toThrow();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
  it('LineChart and HBars show an empty state instead of meaningless axes', () => {
    render(<LineChart labels={['jan', 'fev']} series={[{ name: 'x', values: [0, 0] }]} />);
    expect(screen.getByText('Sem dados no período')).toBeInTheDocument();
    render(<HBars data={[]} />);
    expect(screen.getByText('Sem dados para exibir')).toBeInTheDocument();
  });
});

describe('Bug: animations disappeared when the OS asked for reduced motion', () => {
  it('"Sempre completas" overrides the system preference', () => {
    setSystemReducedMotion(true);
    const a = deepClone(DEFAULT_APPEARANCE); a.a11y.motionPref = 'full';
    applyAppearance(a);
    expect(document.documentElement.dataset.motion).toBe('full');
    a.a11y.motionPref = 'system'; applyAppearance(a);
    expect(document.documentElement.dataset.motion).toBe('reduce');
    setSystemReducedMotion(false);
  });
  it('reduced motion keeps fades instead of disabling every animation', () => {
    expect(css).not.toMatch(/data-motion='reduce'\][^{]*\{[^}]*animation-duration:\s*0ms/);
    expect(css).toMatch(/data-motion='reduce'\][^{]*\{[^}]*animation-name:\s*fadeIn/);
  });
});

describe('Toasts leave with an exit animation', () => {
  it('marks a toast as leaving before removing it', async () => {
    vi.useFakeTimers();
    toast('success', 'Olá');
    const { useUI } = await import('../store/ui');
    let snapshot: { leaving?: boolean }[] = [];
    function Probe() { snapshot = useUI(s => s.toasts); return null; }
    render(<Probe />);
    const id = (snapshot as unknown as { id: number }[])[0]!.id;
    act(() => dismissToast(id));
    expect(snapshot[snapshot.length - 1]?.leaving).toBe(true);
    act(() => { vi.advanceTimersByTime(250); });
    expect(snapshot.some(t => (t as unknown as { id: number }).id === id)).toBe(false);
    vi.useRealTimers();
  });
});

describe('Tabs have no duplicated underline (static ::after + sliding ink)', () => {
  it('only the sliding .tab-ink draws the active underline', () => {
    expect(css).not.toMatch(/\.tabs button\[aria-selected='true'\]::after/);
    expect(css).toMatch(/\.tab-ink\s*\{/);
  });
});

void Suspense; void waitFor;
