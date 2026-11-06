/* The system Select replaces the browser's native dropdown (ugly, unstyled, unanimated). */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Select, Field, Modal } from '../components/ui';

const OPTS = [{ value: 'a', label: 'Criar tarefa' }, { value: 'b', label: 'Alterar status' }, { value: 'c', label: 'Adicionar tag' }];
const css = readFileSync(resolve(__dirname, '../styles/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function Harness({ onChange = () => {}, options = OPTS, placeholder }: { onChange?: (v: string) => void; options?: typeof OPTS; placeholder?: string }) {
  const [v, setV] = useState('a');
  return <Select aria-label="Ação" value={v} options={options} placeholder={placeholder} onChange={e => { setV(e.target.value); onChange(e.target.value); }} />;
}
const trigger = () => screen.getByRole('combobox', { name: 'Ação' });

describe('custom Select', () => {
  it('does not render a native <select>', () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('select')).toBeNull();
    expect(trigger()).toHaveTextContent('Criar tarefa');
  });
  it('opens a styled listbox and reports the choice with an event-like target.value', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    const list = screen.getByRole('listbox');
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    fireEvent.click(within(list).getByText('Adicionar tag'));
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('Adicionar tag');
  });
  it('supports the keyboard: arrows move, Enter selects, Escape closes without selecting', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('marks the selected option and exposes combobox state to screen readers', () => {
    render(<Harness />);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: /Criar tarefa/ })).toHaveAttribute('aria-selected', 'true');
  });
  it('shows the placeholder as an option and when nothing is selected', () => {
    function P() { const [v, setV] = useState(''); return <Select aria-label="Ação" value={v} options={OPTS} placeholder="Todos" onChange={e => setV(e.target.value)} />; }
    render(<P />);
    expect(trigger()).toHaveTextContent('Todos');
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });
  it('adds a search box for long lists and filters by accent-insensitive text', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ value: `v${i}`, label: i === 7 ? 'São Paulo' : `Cidade ${i}` }));
    render(<Harness options={many} />);
    fireEvent.click(trigger());
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'sao pau' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('São Paulo');
  });
  it('is disabled when asked and never opens', () => {
    render(<Select aria-label="Ação" value="a" options={OPTS} disabled onChange={() => {}} />);
    fireEvent.click(trigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('works with Field: the label targets the trigger and errors are announced', () => {
    render(<Field label="Origem" error="Selecione a origem."><Select value="" options={OPTS} placeholder="Selecione…" onChange={() => {}} /></Field>);
    expect(screen.getByLabelText(/Origem/)).toHaveAttribute('aria-invalid', 'true');
  });
  it('Escape inside a modal closes only the dropdown, not the modal', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="M"><Harness /></Modal>);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
  it('the listbox is not clipped by the modal (rendered in a portal above overlays)', () => {
    render(<Modal open onClose={() => {}} title="M"><Harness /></Modal>);
    fireEvent.click(trigger());
    expect(screen.getByRole('listbox').closest('.modal')).toBeNull();
    const z = [...css.matchAll(/\.dd-pop\s*\{([^}]*)\}/g)].map(m => m[1]).join(';');
    expect(Number(/z-index:\s*(\d+)/.exec(z)?.[1])).toBeGreaterThan(100);
  });
});
