import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useSaveStatus } from '../store/store';
import { applyAppearance } from '../lib/theme';
import { SkeletonRows } from '../components/ui';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Target, Contact, Building2, Handshake, Columns3, CheckSquare, CalendarDays, FileText, Workflow,
  BarChart3, Trophy, UsersRound, Settings, Archive, Sparkles, Bell, Sun, Moon, Search, Menu as MenuIcon, PanelLeftClose,
  PanelLeftOpen, LogOut, Palette, Eye, Plus, Building, Check, X, MonitorSmartphone,
} from 'lucide-react';
import { useSession, signOut, impersonate, switchTenant } from '../services/auth';
import { useTenant } from '../store/store';
import { settings as settingsSvc } from '../services/crm';
import { uiActions, useUI, toast } from '../store/ui';
import { Avatar, Badge, Button, Menu } from '../components/ui';
import { roleOf } from '../config/permissions';
import { CommandPalette } from './CommandPalette';
import { CopilotDrawer } from '../modules/copilot/Copilot';
import { AppearancePanel } from '../modules/settings/AppearancePanel';
import { NewRecordModal } from '../components/forms';
import type { Resource } from '../types';
import { cx, relTime } from '../lib/utils';
import { resolvedMode } from '../lib/theme';

interface NavItem { to: string; label: string; icon: React.ReactNode; res: Resource; count?: number }

export function Shell() {
  const { user, realUser, tenant, tenants, impersonating, canAccess, can } = useSession();
  const d = useTenant();
  const sidebarOpen = useUI(s => s.sidebar);
  const mobileNav = useUI(s => s.mobileNav);
  const loc = useLocation();
  const nav = useNavigate();
  const [appearance, setAppearance] = useState(false);
  const [newRec, setNewRec] = useState(false);

  useEffect(() => { uiActions.mobileNav(false); }, [loc.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); uiActions.palette(true); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); uiActions.copilot(true); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { const h = () => setAppearance(true); window.addEventListener('nexa:appearance', h); return () => window.removeEventListener('nexa:appearance', h); }, []);

  const unread = d.conversations.reduce((a, c) => a + c.unread, 0);
  const pendingTasks = d.tasks.filter(t => !t.done && t.ownerId === user.id && new Date(t.due) < new Date(Date.now() + 864e5)).length;
  const groups: { label: string; items: NavItem[] }[] = [
    { label: 'Geral', items: [
      { to: '/', label: 'Visão geral', icon: <LayoutDashboard />, res: 'dashboard' },
      { to: '/inbox', label: 'Inbox', icon: <Inbox />, res: 'inbox', count: unread },
      { to: '/copilot', label: 'NEXA Copilot', icon: <Sparkles />, res: 'dashboard' },
    ] },
    { label: 'Relacionamento', items: [
      { to: '/leads', label: 'Leads', icon: <Target />, res: 'leads' },
      { to: '/people', label: 'Contatos', icon: <Contact />, res: 'people' },
      { to: '/companies', label: 'Empresas', icon: <Building2 />, res: 'companies' },
    ] },
    { label: 'Vendas', items: [
      { to: '/opportunities', label: 'Oportunidades', icon: <Handshake />, res: 'deals' },
      { to: '/pipeline', label: 'Pipeline', icon: <Columns3 />, res: 'deals' },
      { to: '/tasks', label: 'Tarefas', icon: <CheckSquare />, res: 'tasks', count: pendingTasks },
      { to: '/agenda', label: 'Agenda', icon: <CalendarDays />, res: 'events' },
      { to: '/proposals', label: 'Propostas', icon: <FileText />, res: 'proposals' },
      { to: '/automations', label: 'Automações', icon: <Workflow />, res: 'automations' },
    ] },
    { label: 'Gestão', items: [
      { to: '/reports', label: 'Relatórios', icon: <BarChart3 />, res: 'reports' },
      { to: '/goals', label: 'Metas', icon: <Trophy />, res: 'goals' },
      { to: '/team', label: 'Equipe', icon: <UsersRound />, res: 'team' },
      { to: '/archive', label: 'Arquivados', icon: <Archive />, res: 'leads' },
      { to: '/settings', label: 'Configurações', icon: <Settings />, res: 'settings' },
    ] },
  ];

  const mode = resolvedMode(d.appearance);
  const toggleTheme = (e: React.MouseEvent) => {
    const next = { ...d.appearance, mode: (mode === 'dark' ? 'light' : 'dark') as 'light' | 'dark' };
    animateTheme(e, () => { applyAppearance(next); settingsSvc.appearance(next); });
  };
  const unreadNotif = d.notifications.filter(n => !n.read).length;

  return (
    <div className={cx('app', !sidebarOpen && 'collapsed', mobileNav && 'mobile-open')}>
      <a href="#main" className="sr-only">Pular para o conteúdo</a>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <div className="brand-mark">{d.org.logo ? <img src={d.org.logo} alt="" /> : d.org.productName.charAt(0)}</div>
          <div className="brand-text" style={{ minWidth: 0 }}>
            <div className="brand-name">{d.org.productName}</div>
            <div className="brand-org">{d.org.name}</div>
          </div>
        </div>
        <nav className="nav">
          {groups.map(g => {
            const items = g.items.filter(i => canAccess(i.res));
            if (!items.length) return null;
            return (
              <React.Fragment key={g.label}>
                <div className="nav-group">{g.label}</div>
                {items.map(i => (
                  <NavLink key={i.to} to={i.to} end={i.to === '/'} title={!sidebarOpen ? i.label : undefined} className={({ isActive }) => cx(isActive && 'active')}>
                    {i.icon}<span>{i.label}</span>{!!i.count && <span className="count">{i.count}</span>}
                  </NavLink>
                ))}
              </React.Fragment>
            );
          })}
        </nav>
        <div className="side-foot">
          <button className="btn ghost sm hide-sm" onClick={uiActions.toggleSidebar} aria-label={sidebarOpen ? 'Recolher menu' : 'Expandir menu'} style={{ justifyContent: sidebarOpen ? 'flex-start' : 'center' }}>
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}<span className="side-foot-text">Recolher</span>
          </button>
        </div>
      </aside>
      {mobileNav && <div className="mobile-scrim" onClick={() => uiActions.mobileNav(false)} />}

      <div className="main">
        <header className="topbar">
          <Button variant="ghost" icon className="show-sm" onClick={() => uiActions.mobileNav(true)} aria-label="Abrir menu" style={{ display: undefined }} data-mobile-only><MenuIcon /></Button>
          <button className="search-trigger" onClick={() => uiActions.palette(true)} aria-label="Busca global">
            <Search size={16} /><span>Buscar leads, empresas, oportunidades…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="spacer" />
          <SaveIndicator />
          {can('create') && <Button variant="primary" size="sm" onClick={() => setNewRec(true)} className="hide-sm"><Plus />Novo</Button>}
          <Button variant="ghost" icon onClick={() => uiActions.copilot(true)} aria-label="Abrir NEXA Copilot (Ctrl J)" title="NEXA Copilot (Ctrl J)"><Sparkles /></Button>
          <Button variant="ghost" icon onClick={() => setAppearance(true)} aria-label="Personalizar aparência" title="Personalizar aparência" className="hide-sm"><Palette /></Button>
          <Button variant="ghost" icon onClick={toggleTheme} aria-label={mode === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title="Alternar tema" className="theme-btn">{mode === 'dark' ? <Sun key="sun" className="icon-swap" /> : <Moon key="moon" className="icon-swap" />}</Button>
          <Menu width={340} trigger={p => (
            <Button variant="ghost" icon {...p} aria-label={`Notificações (${unreadNotif} não lidas)`} style={{ position: 'relative' }}>
              <Bell />{unreadNotif > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 9, background: 'var(--danger)' }} />}
            </Button>
          )}>
            <div className="row between" style={{ padding: '6px 10px' }}><strong>Notificações</strong>
              <button data-keep className="btn ghost xs" style={{ width: 'auto' }} onClick={() => settingsSvc.notifications(n => n.map(x => ({ ...x, read: true })))}>Marcar todas como lidas</button></div>
            <hr />
            {d.notifications.length === 0 && <div className="muted small" style={{ padding: 12 }}>Nenhuma notificação.</div>}
            {d.notifications.slice(0, 8).map(n => (
              <button key={n.id} onClick={() => { settingsSvc.notifications(l => l.map(x => (x.id === n.id ? { ...x, read: true } : x))); if (n.link) nav(n.link); }} style={{ alignItems: 'flex-start' }}>
                <span className="dot-status" style={{ background: n.read ? 'transparent' : 'var(--accent)', marginTop: 6 }} />
                <span style={{ minWidth: 0 }}><span style={{ display: 'block', whiteSpace: 'normal' }}>{n.title}</span>{n.body && <span className="xs muted" style={{ display: 'block', whiteSpace: 'normal' }}>{n.body}</span>}<span className="xs muted">{relTime(n.at)}</span></span>
              </button>
            ))}
          </Menu>
          <Menu width={290} trigger={p => (
            <button {...p} className="btn ghost" style={{ paddingLeft: 4, paddingRight: 10 }} aria-label="Menu do usuário">
              <Avatar name={user.name} color={user.color} size="sm" /><span className="hide-sm" style={{ maxWidth: 120 }}><span className="ellipsis" style={{ display: 'block' }}>{user.name.split(' ')[0]}</span></span>
            </button>
          )}>
            <div style={{ padding: '8px 10px' }}>
              <div className="strong">{user.name}</div>
              <div className="xs muted">{user.email}</div>
              <div style={{ marginTop: 6 }}><Badge tone="accent">{roleOf(user.role).label}</Badge>{impersonating && <Badge tone="warning">Visualizando como</Badge>}</div>
            </div>
            <hr />
            <div className="menu-label">Organização</div>
            {tenants.map(t => (
              <button key={t.id} onClick={() => { switchTenant(t.id); nav('/'); toast('info', `Organização: ${t.name}`, 'Dados isolados por empresa.'); }}>
                <Building />{t.name}{t.id === tenant.id && <Check style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
            <button onClick={() => nav('/onboarding?new=1')}><Plus />Criar nova organização</button>
            {(realUser.role === 'owner' || realUser.role === 'admin') && <>
              <hr /><div className="menu-label">Ver como (testar permissões)</div>
              {d.users.filter(u => u.active).map(u => (
                <button key={u.id} onClick={() => { impersonate(u.id); nav('/'); toast('info', `Visualizando como ${u.name}`, roleOf(u.role).label); }}>
                  <Eye />{u.name.split(' ')[0]} <span className="xs muted" style={{ marginLeft: 'auto' }}>{roleOf(u.role).label}</span>
                </button>
              ))}
            </>}
            <hr />
            <button onClick={() => setAppearance(true)}><Palette />Personalizar aparência</button>
            <button onClick={() => nav('/settings')}><Settings />Configurações</button>
            <button className="danger" onClick={() => { signOut(); nav('/login'); }}><LogOut />Sair</button>
          </Menu>
        </header>

        {impersonating && (
          <div className="notice warning no-print" style={{ margin: '12px var(--margin) 0', borderRadius: 999 }}>
            <MonitorSmartphone />
            <div className="row between flex1 wrap">
              <span>Você está visualizando como <strong>{user.name}</strong> ({roleOf(user.role).label}). Menus, dados e ações refletem essas permissões.</span>
              <Button size="xs" onClick={() => { impersonate(realUser.id); toast('success', 'Voltou ao seu usuário'); }}><X />Sair da visualização</Button>
            </div>
          </div>
        )}

        <main id="main" className="content" key={loc.pathname}>
          <Suspense fallback={<PageFallback />}><Outlet /></Suspense>
        </main>
      </div>

      <CommandPalette />
      <CopilotDrawer />
      <AppearancePanel open={appearance} onClose={() => setAppearance(false)} />
      <NewRecordModal open={newRec} onClose={() => setNewRec(false)} />
      {can('create') && <MobileFab onNew={() => setNewRec(true)} />}
    </div>
  );
}

const PageFallback = () => (
  <div className="page-fallback" aria-busy="true" aria-label="Carregando">
    <div className="skel" style={{ height: 30, width: 240, borderRadius: 10 }} />
    <div className="skel" style={{ height: 14, width: 360, maxWidth: '80%', borderRadius: 8 }} />
    <div className="card"><SkeletonRows n={6} /></div>
  </div>
);

function SaveIndicator() {
  const s = useSaveStatus();
  return (
    <span className={cx('save-ind', s)} role="status" aria-live="polite">
      {s === 'saving' ? <><Loader2 className="spin" size={13} />Salvando…</> : s === 'saved' ? <><Check size={13} className="draw" />Salvo</> : null}
    </span>
  );
}

/** Theme switch with a circular reveal from the button (View Transitions API), falling back to a colour cross-fade. */
function animateTheme(e: React.MouseEvent, apply: () => void) {
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (root.dataset.motion === 'reduce') { apply(); return; }
  if (doc.startViewTransition) {
    const x = e.clientX, y = e.clientY;
    root.style.setProperty('--vt-x', `${x}px`); root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.classList.add('vt-theme');
    doc.startViewTransition(() => flushSync(apply)).finished.finally(() => root.classList.remove('vt-theme'));
  } else {
    root.classList.add('theme-fade'); apply();
    setTimeout(() => root.classList.remove('theme-fade'), 500);
  }
}

function MobileFab({ onNew }: { onNew: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(window.innerWidth <= 900);
  useEffect(() => { const h = () => setMobile(window.innerWidth <= 900); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  return useMemo(() => mobile ? (
    <button ref={ref} className="btn primary icon" onClick={onNew} aria-label="Novo registro" style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 40, '--h': '54px', boxShadow: '0 12px 30px -8px rgb(0 0 0 / .6)' } as React.CSSProperties}><Plus /></button>
  ) : null, [mobile, onNew]);
}
