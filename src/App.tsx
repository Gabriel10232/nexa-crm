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

const Login = lazy(() => import('./modules/auth/Login'));
const Onboarding = lazy(() => import('./modules/auth/Onboarding'));
const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'));
const Leads = lazy(() => import('./modules/leads/Leads'));
const LeadDetail = lazy(() => import('./modules/leads/LeadDetail'));
const People = lazy(() => import('./modules/contacts/People'));
const PersonDetail = lazy(() => import('./modules/contacts/PersonDetail'));
const Companies = lazy(() => import('./modules/contacts/Companies'));
const CompanyDetail = lazy(() => import('./modules/contacts/CompanyDetail'));
const Opportunities = lazy(() => import('./modules/deals/Opportunities'));
const DealDetail = lazy(() => import('./modules/deals/DealDetail'));
const Pipeline = lazy(() => import('./modules/deals/Pipeline'));
const Tasks = lazy(() => import('./modules/activities/Tasks'));
const Agenda = lazy(() => import('./modules/activities/Agenda'));
const InboxPage = lazy(() => import('./modules/inbox/Inbox'));
const Proposals = lazy(() => import('./modules/proposals/Proposals'));
const ProposalEditor = lazy(() => import('./modules/proposals/ProposalEditor'));
const Automations = lazy(() => import('./modules/automations/Automations'));
const Reports = lazy(() => import('./modules/reports/Reports'));
const Goals = lazy(() => import('./modules/goals/Goals'));
const Team = lazy(() => import('./modules/team/Team'));
const Settings = lazy(() => import('./modules/settings/Settings'));
const ArchivePage = lazy(() => import('./modules/settings/Archive'));
const CopilotPage = lazy(() => import('./modules/copilot/Copilot'));

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

const Fallback = () => <div className="card" style={{ margin: 8 }}><SkeletonRows n={7} /></div>;

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
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
            <Route element={<RequireAuth><Shell /></RequireAuth>}>
              <Route index element={<Suspense fallback={<Fallback />}>{g('dashboard', <Dashboard />)}</Suspense>} />
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
