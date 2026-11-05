import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Target, Contact, Building2, Handshake, CheckSquare, FileText, MessagesSquare, ArrowRight, CornerDownLeft } from 'lucide-react';
import { useUI, uiActions } from '../store/ui';
import { useTenant } from '../store/store';
import { useSession } from '../services/auth';
import { scoped } from '../services/metrics';
import { normalize } from '../lib/utils';

interface Hit { group: string; id: string; label: string; sub?: string; to: string; icon: React.ReactNode }

const PAGES: [string, string][] = [['Visão geral', '/'], ['Inbox', '/inbox'], ['Leads', '/leads'], ['Contatos', '/people'], ['Empresas', '/companies'], ['Oportunidades', '/opportunities'], ['Pipeline', '/pipeline'], ['Tarefas', '/tasks'], ['Agenda', '/agenda'], ['Propostas', '/proposals'], ['Automações', '/automations'], ['Relatórios', '/reports'], ['Metas', '/goals'], ['Equipe', '/team'], ['Configurações', '/settings'], ['Arquivados', '/archive'], ['NEXA Copilot', '/copilot']];

export function CommandPalette() {
  const open = useUI(s => s.palette);
  if (!open) return null;
  return createPortal(<Palette />, document.body);
}

function Palette() {
  const d = useTenant(); const { user } = useSession(); const nav = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const hits = useMemo<Hit[]>(() => {
    const n = normalize(q.trim());
    const m = (...s: (string | undefined)[]) => s.some(x => normalize(x).includes(n));
    const out: Hit[] = [];
    if (!n) return PAGES.slice(0, 8).map(([l, to]) => ({ group: 'Ir para', id: to, label: l, to, icon: <ArrowRight size={16} /> }));
    PAGES.filter(([l]) => normalize(l).includes(n)).forEach(([l, to]) => out.push({ group: 'Páginas', id: to, label: l, to, icon: <ArrowRight size={16} /> }));
    scoped(d, user, d.leads).filter(l => !l.archivedAt && m(l.name, l.companyName, l.email, l.phone, l.city, l.cpf, l.cnpj, ...l.tags)).slice(0, 6).forEach(l => out.push({ group: 'Leads', id: l.id, label: l.name, sub: l.companyName ?? l.email, to: `/leads/${l.id}`, icon: <Target size={16} /> }));
    scoped(d, user, d.people).filter(p => !p.archivedAt && m(p.name, p.email, p.phone, p.jobTitle, p.cpf)).slice(0, 6).forEach(p => out.push({ group: 'Contatos e clientes', id: p.id, label: p.name, sub: d.companies.find(c => c.id === p.companyId)?.tradeName ?? 'Pessoa física', to: `/people/${p.id}`, icon: <Contact size={16} /> }));
    scoped(d, user, d.companies).filter(c => !c.archivedAt && m(c.tradeName, c.legalName, c.cnpj, c.city, c.segment)).slice(0, 6).forEach(c => out.push({ group: 'Empresas', id: c.id, label: c.tradeName, sub: c.segment, to: `/companies/${c.id}`, icon: <Building2 size={16} /> }));
    scoped(d, user, d.deals).filter(x => !x.archivedAt && m(x.name, x.product)).slice(0, 6).forEach(x => out.push({ group: 'Oportunidades', id: x.id, label: x.name, sub: x.status === 'open' ? 'Aberta' : x.status === 'won' ? 'Ganha' : 'Perdida', to: `/opportunities/${x.id}`, icon: <Handshake size={16} /> }));
    scoped(d, user, d.tasks).filter(t => m(t.title)).slice(0, 5).forEach(t => out.push({ group: 'Tarefas', id: t.id, label: t.title, sub: t.done ? 'Concluída' : 'Pendente', to: `/tasks?q=${encodeURIComponent(t.title)}`, icon: <CheckSquare size={16} /> }));
    d.proposals.filter(p => m(p.number, p.title)).slice(0, 5).forEach(p => out.push({ group: 'Propostas', id: p.id, label: `${p.number} · ${p.title}`, to: `/proposals/${p.id}`, icon: <FileText size={16} /> }));
    d.conversations.filter(c => m(c.subject, ...c.messages.map(x => x.body))).slice(0, 5).forEach(c => out.push({ group: 'Mensagens', id: c.id, label: c.subject, sub: c.messages.find(x => normalize(x.body).includes(n))?.body.slice(0, 70), to: `/inbox?c=${c.id}`, icon: <MessagesSquare size={16} /> }));
    return out;
  }, [q, d, user]);

  useEffect(() => setSel(0), [q]);
  const go = (h?: Hit) => { if (!h) return; uiActions.palette(false); nav(h.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(hits.length - 1, s + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
    if (e.key === 'Enter') go(hits[sel]);
    if (e.key === 'Escape') uiActions.palette(false);
  };
  useEffect(() => { document.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && uiActions.palette(false)}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Busca global">
        <div className="palette-input"><Search size={18} />
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Buscar em leads, clientes, empresas, oportunidades, tarefas, propostas e mensagens…" role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={hits[sel] ? `hit-${sel}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox">
          {hits.length === 0 && <div className="empty compact"><h3>Nada encontrado</h3><p>Tente buscar por nome, e-mail, CNPJ, cidade ou tag.</p></div>}
          {hits.map((h, i) => {
            const header = h.group !== lastGroup ? (lastGroup = h.group) : null;
            return (
              <React.Fragment key={h.group + h.id}>
                {header && <div className="palette-group">{header}</div>}
                <div id={`hit-${i}`} data-idx={i} role="option" aria-selected={i === sel} className="palette-item" onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
                  <span className="icon-bubble neutral" style={{ width: 30, height: 30 }}>{h.icon}</span>
                  <div className="flex1"><div className="ellipsis strong">{h.label}</div>{h.sub && <div className="xs muted ellipsis">{h.sub}</div>}</div>
                  {i === sel && <CornerDownLeft size={14} className="muted" />}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
