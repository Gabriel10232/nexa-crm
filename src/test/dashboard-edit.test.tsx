/* Dashboard edit mode: compact per-widget controls, live drag preview, device preview, widget library. */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import Dashboard from '../modules/dashboard/Dashboard';
import { withDemo, renderAt, Route } from './helpers';

const dt = () => ({ setData() {}, getData: () => '', effectAllowed: '', dropEffect: '', setDragImage() {} });

async function enterEdit() {
  withDemo();
  const r = renderAt('/', <Route path="/" element={<Dashboard />} />);
  await waitFor(() => expect(r.container.querySelector('.dash-grid .widget')).toBeInTheDocument(), { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: /Editar dashboard/ }));
  await waitFor(() => expect(r.container.querySelector('.dash-grid.editing')).toBeInTheDocument());
  return r.container;
}
const ids = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.dash-grid [data-wid]')].map(e => e.dataset.wid!);
const widget = (c: HTMLElement, i: number) => c.querySelectorAll<HTMLElement>('.dash-grid [data-wid]')[i];

beforeEach(() => localStorage.clear());

describe('per-widget controls', () => {
  it('are compact: settings + one "more" menu instead of an 8-icon strip', async () => {
    const c = await enterEdit();
    const tools = widget(c, 0).querySelector('.w-tools') as HTMLElement;
    expect(tools).toBeInTheDocument();
    expect(tools.querySelectorAll('button').length).toBeLessThanOrEqual(3);
    expect(within(tools).getByRole('button', { name: /Configurar/ })).toBeInTheDocument();
    expect(within(tools).getByRole('button', { name: /Mais ações/ })).toBeInTheDocument();
  });
  it('the "more" menu has size presets, duplicate, lock, hide-on-device and remove', async () => {
    const c = await enterEdit();
    fireEvent.click(within(widget(c, 0)).getByRole('button', { name: /Mais ações/ }));
    const menu = screen.getByRole('menu');
    for (const t of ['Metade', 'Largura total', 'Duplicar', 'Bloquear', 'Remover']) expect(within(menu).getByText(t)).toBeInTheDocument();
    expect(within(menu).getByText(/Visível n/)).toBeInTheDocument();
  });
  it('picking a width preset resizes the widget', async () => {
    const c = await enterEdit();
    fireEvent.click(within(widget(c, 0)).getByRole('button', { name: /Mais ações/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Largura total'));
    await waitFor(() => expect(widget(c, 0).querySelector('.w-dim')).toHaveTextContent(/^12×/));
  });
  it('no permanent size badge over the content (size lives inside the toolbar)', async () => {
    const c = await enterEdit();
    expect(c.querySelector('.w-size')).toBeNull();
  });
});

describe('drag and drop', () => {
  it('previews the new order live while dragging over another widget', async () => {
    const c = await enterEdit();
    const [a, b] = ids(c);
    fireEvent.dragStart(widget(c, 0), { dataTransfer: dt() });
    fireEvent.dragOver(widget(c, 1), { dataTransfer: dt() });
    await waitFor(() => expect(ids(c).indexOf(a)).toBeGreaterThan(ids(c).indexOf(b)));
    fireEvent.dragEnd(widget(c, 0));
  });
  it('one undo restores the order after a drag; a drag that moves nothing adds no undo step', async () => {
    const c = await enterEdit();
    const undo = screen.getByRole('button', { name: /Desfazer/ });
    const before = ids(c);
    fireEvent.dragStart(widget(c, 0), { dataTransfer: dt() });
    fireEvent.dragEnd(widget(c, 0));
    expect(undo).toBeDisabled();
    fireEvent.dragStart(widget(c, 0), { dataTransfer: dt() });
    fireEvent.dragOver(widget(c, 1), { dataTransfer: dt() });
    fireEvent.dragEnd(widget(c, 0));
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);
    await waitFor(() => expect(ids(c)).toEqual(before));
  });
  it('locked widgets are neither draggable nor a drop target', async () => {
    const c = await enterEdit();
    fireEvent.click(within(widget(c, 1)).getByRole('button', { name: /Mais ações/ }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Bloquear'));
    await waitFor(() => expect(widget(c, 1)).toHaveClass('locked'));
    expect(widget(c, 1).getAttribute('draggable')).toBe('false');
    const [a, b] = ids(c);
    fireEvent.dragStart(widget(c, 0), { dataTransfer: dt() });
    fireEvent.dragOver(widget(c, 1), { dataTransfer: dt() });
    fireEvent.dragEnd(widget(c, 0));
    expect(ids(c).slice(0, 2)).toEqual([a, b]);
  });
});

describe('device preview', () => {
  it('lets you preview the layout as desktop, tablet or phone while editing', async () => {
    const c = await enterEdit();
    const group = screen.getByRole('group', { name: /Pré-visualizar/ });
    fireEvent.click(within(group).getByRole('button', { name: /Celular/ }));
    const grid = c.querySelector('.dash-grid') as HTMLElement;
    await waitFor(() => expect(grid).toHaveClass('previewing'));
    expect(grid.dataset.cols).toBe('1');
    fireEvent.click(within(group).getByRole('button', { name: /Desktop/ }));
    await waitFor(() => expect(grid.dataset.cols).toBe('12'));
  });
});

describe('widget library', () => {
  it('has search, stays open to add several widgets, and counts what is already on the dashboard', async () => {
    const c = await enterEdit();
    const before = ids(c).length;
    fireEvent.click(screen.getByRole('button', { name: /^Widget$|\+\s*Widget/ }));
    const dlg = await screen.findByRole('dialog');
    const search = within(dlg).getByRole('searchbox', { name: /Buscar widget/ });
    fireEvent.change(search, { target: { value: 'funil' } });
    const cards = within(dlg).getAllByRole('button', { name: /Funil de conversão/ });
    expect(cards).toHaveLength(1);
    fireEvent.click(cards[0]);
    fireEvent.click(cards[0]);
    await waitFor(() => expect(ids(c).length).toBe(before + 2));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('filters by category', async () => {
    await enterEdit();
    fireEvent.click(screen.getByRole('button', { name: /^Widget$|\+\s*Widget/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gráficos' }));
    const names = within(dlg).getAllByRole('button').map(b => b.textContent ?? '');
    expect(names.some(n => /Evolução das vendas/.test(n))).toBe(true);
    expect(names.some(n => /Tarefas/.test(n) && /Lista/.test(n))).toBe(false);
  });
});
