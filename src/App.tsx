import React, { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Shell } from './layout/Shell';
import { useSession } from './services/auth';
import { useTenant } from './store/store';
import { applyAppearance, applyBranding } from './lib/theme';
import { setLocale } from './lib/utils';
import { Toaster, ConfirmHost, PromptHost, SkeletonRows, Empty, Button } from './components/ui';
import type { Resource } from './types';


const loaders = {
  Login: () => import('./modules/auth/Login'),
  Onboarding: () => import('./modules/auth/Onboarding'),
  Dashboard: () => import('./modules/dashboard/Dashboard'),
  Leads: () => import('./modules/leads/Leads'),
  LeadDetail: () => import('./modules/leads/LeadDetail'),
  People: () => import('./modules/contacts/People'),
  PersonDetail: () => import('./modules/contacts/PersonDetail'),
  Companies: () => import('./modules/contacts/Companies'),
  CompanyDetail: () => import('./modules/contacts/CompanyDetail'),
  Opportunities: () => import('./modules/deals/Opportunities'),
  DealDetail: () => import('./modules/deals/DealDetail'),
  Pipeline: () => import('./modules/deals/Pipeline'),
  Tasks: () => import('./modules/activities/Tasks'),
  Agenda: () => import('./modules/activities/Agenda'),
  InboxPage: () => import('./modules/inbox/Inbox'),
  Proposals: () => import('./modules/proposals/Proposals'),
  ProposalEditor: () => import('./modules/proposals/ProposalEditor'),
  Automations: () => import('./modules/automations/Automations'),
  Reports: () => import('./modules/reports/Reports'),
  Goals: () => import('./modules/goals/Goals'),
  Team: () => import('./modules/team/Team'),
  Settings: () => import('./modules/settings/Settings'),
  ArchivePage: () => import('./modules/settings/Archive'),
  CopilotPage: () => import('./modules/copilot/Copilot'),
};
const Login = lazy(loaders.Login);
const Onboarding = lazy(loaders.Onboarding);
const Dashboard = lazy(loaders.Dashboard);
const Leads = lazy(loaders.Leads);
const LeadDetail = lazy(loaders.LeadDetail);
const People = lazy(loaders.People);
const PersonDetail = lazy(loaders.PersonDetail);
const Companies = lazy(loaders.Companies);
const CompanyDetail = lazy(loaders.CompanyDetail);
const Opportunities = lazy(loaders.Opportunities);
const DealDetail = lazy(loaders.DealDetail);
const Pipeline = lazy(loaders.Pipeline);
const Tasks = lazy(loaders.Tasks);
const Agenda = lazy(loaders.Agenda);
const InboxPage = lazy(loaders.InboxPage);
const Proposals = lazy(loaders.Proposals);
const ProposalEditor = lazy(loaders.ProposalEditor);
const Automations = lazy(loaders.Automations);
const Reports = lazy(loaders.Reports);
const Goals = lazy(loaders.Goals);
const Team = lazy(loaders.Team);
const Settings = lazy(loaders.Settings);
const ArchivePage = lazy(loaders.ArchivePage);
const CopilotPage = lazy(loaders.CopilotPage);

/** Warm every route chunk in the background so the first navigation is instant (no fallback flash). */
export function prefetchRoutes() {
  const run = () => Object.values(loaders).forEach(l => l().catch(() => {}));
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
  w.requestIdleCallback ? w.requestIdleCallback(run) : setTimeout(run, 400);
}
prefetchRoutes();

function ThemeSync() {
  const d = useTenant();
  useEffect(() => { applyAppearance(d.appearance); }, [d.appearance]);
  useEffect(() => { setLocale(d.org.currency, d.org.locale); applyBranding(d.org.productName, d.org.favicon); }, [d.org.currency, d.org.locale, d.org.productName, d.org.favicon]);
  useEffect(() => {
    if (d.appearance.mode !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const h = () => applyAppearance(d.appearance); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h);
  }, [d.appearance]);
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, tenant } = useSession();
  const loc = useLocation();
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!tenant.data.org.onboarded && !loc.pathname.startsWith('/onboarding')) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function Guard({ res, children }: { res: Resource; children: React.ReactNode }) {
  const { canAccess, user } = useSession();
  if (!canAccess(res)) return (
    <div className="card" style={{ maxWidth: 560, margin: '8vh auto' }}>
      <Empty icon={<Lock size={22} />} title="Acesso restrito" text={`O perfil de ${user.name} não tem permissão para esta área. Fale com um administrador para solicitar acesso.`} action={<Button onClick={() => history.back()}>Voltar</Button>} />
    </div>
  );
  return <>{children}</>;
}

export const Fallback = () => <div className="page-fallback" aria-busy="true" aria-label="Carregando"><div className="skel" style={{ height: 30, width: 260, borderRadius: 10 }} /><div className="skel" style={{ height: 14, width: 380, borderRadius: 8 }} /><div className="card"><SkeletonRows n={6} /></div></div>;
const BootFallback = () => <div className="boot" aria-busy="true"><div className="brand-mark">N</div></div>;

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div className="card" style={{ maxWidth: 560, margin: '10vh auto' }}>
        <Empty title="Algo deu errado nesta tela" text={`Erro: ${this.state.error.message}. Seus dados estão salvos. Tente recarregar.`} action={<Button variant="primary" onClick={() => location.reload()}>Recarregar</Button>} />
      </div>
    );
    return this.props.children;
  }
}

const g = (res: Resource, el: React.ReactNode) => <Guard res={res}>{el}</Guard>;

export default function App() {
  return (
    <HashRouter>
      <ThemeSync />
      <ErrorBoundary>
        <Suspense fallback={<BootFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
            <Route element={<RequireAuth><Shell /></RequireAuth>}>
              <Route index element={g('dashboard', <Dashboard />)} />
              <Route path="inbox" element={g('inbox', <InboxPage />)} />
              <Route path="copilot" element={<CopilotPage />} />
              <Route path="leads" element={g('leads', <Leads />)} />
              <Route path="leads/:id" element={g('leads', <LeadDetail />)} />
              <Route path="people" element={g('people', <People />)} />
              <Route path="people/:id" element={g('people', <PersonDetail />)} />
              <Route path="companies" element={g('companies', <Companies />)} />
              <Route path="companies/:id" element={g('companies', <CompanyDetail />)} />
              <Route path="opportunities" element={g('deals', <Opportunities />)} />
              <Route path="opportunities/:id" element={g('deals', <DealDetail />)} />
              <Route path="pipeline" element={g('deals', <Pipeline />)} />
              <Route path="tasks" element={g('tasks', <Tasks />)} />
              <Route path="agenda" element={g('events', <Agenda />)} />
              <Route path="proposals" element={g('proposals', <Proposals />)} />
              <Route path="proposals/:id" element={g('proposals', <ProposalEditor />)} />
              <Route path="automations" element={g('automations', <Automations />)} />
              <Route path="reports" element={g('reports', <Reports />)} />
              <Route path="goals" element={g('goals', <Goals />)} />
              <Route path="team" element={g('team', <Team />)} />
              <Route path="settings" element={g('settings', <Settings />)} />
              <Route path="archive" element={<ArchivePage />} />
              <Route path="*" element={<div className="card" style={{ maxWidth: 520, margin: '10vh auto' }}><Empty title="Página não encontrada" text="O endereço acessado não existe ou foi movido." action={<Button variant="primary" onClick={() => (location.hash = '#/')}>Ir para a visão geral</Button>} /></div>} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Toaster />
      <ConfirmHost />
      <PromptHost />
    </HashRouter>
  );
}
