/* AuthService (simulated).
 * Contract mirrors what a real provider (Auth0, Clerk, Supabase Auth, Cognito) exposes:
 * signIn, signOut, current session, switch organization. Replace the internals only. */
import { store, currentTenant } from '../store/store';
import type { Action, Resource } from '../types';
import { can as roleCan, canAccess as roleCanAccess } from '../config/permissions';
import { useStore } from '../store/store';
import { blankTenant } from '../data/seed';
import { normalize, sleep, uid } from '../lib/utils';

export const DEMO_PASSWORD = 'demo123';

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await sleep(450); // network latency simulation
  const e = normalize(email.trim());
  if (!e || !password) return { ok: false, error: 'Informe e-mail e senha.' };
  for (const t of store.get().tenants) {
    const u = t.data.users.find(x => normalize(x.email) === e);
    if (u) {
      if (!u.active) return { ok: false, error: 'Usuário desativado. Fale com o administrador da conta.' };
      if (password !== DEMO_PASSWORD) return { ok: false, error: 'Senha incorreta. No ambiente de demonstração a senha é demo123.' };
      startSession(t.id, u.id);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Não encontramos uma conta com esse e-mail.' };
}

export function startSession(tenantId: string, userId: string) {
  const at = new Date().toISOString();
  store.set(s => ({
    ...s,
    session: { tenantId, userId, realUserId: userId, startedAt: at },
    tenants: s.tenants.map(t => t.id !== tenantId ? t : {
      ...t, data: {
        ...t.data,
        users: t.data.users.map(u => (u.id === userId ? { ...u, lastAccessAt: at } : u)),
        sessions: [{ id: uid('ss'), userId, device: browserLabel(), location: 'Sessão atual', startedAt: at, current: true }, ...t.data.sessions.map(x => ({ ...x, current: false }))].slice(0, 12),
      },
    }),
  }));
}

export function signOut() { store.set(s => ({ ...s, session: null })); }

export function switchTenant(tenantId: string) {
  const s = store.get();
  const t = s.tenants.find(x => x.id === tenantId); if (!t || !s.session) return;
  const u = t.data.users.find(x => x.id === s.session!.realUserId) ?? t.data.users[0];
  store.set({ ...s, session: { ...s.session, tenantId, userId: u.id, realUserId: u.id } });
}

/** "Ver como" — lets admins preview the app with another user's permissions. */
export function impersonate(userId: string) {
  store.set(s => (s.session ? { ...s, session: { ...s.session, userId } } : s));
}

export function createOrganization(name: string, template: string) {
  const id = uid('org');
  const data = blankTenant(name, template);
  const s = store.get();
  const me = currentTenant(s).data.users.find(u => u.id === s.session?.realUserId);
  if (me) data.users = [{ ...me, role: 'owner' }];
  store.set({ ...s, tenants: [...s.tenants, { id, name, data }], session: s.session ? { ...s.session, tenantId: id, userId: data.users[0].id, realUserId: data.users[0].id } : s.session });
}

function browserLabel() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Linux';
  return `${b} · ${os}`;
}

export function useSession() {
  const session = useStore(s => s.session);
  const tenant = useStore(s => currentTenant(s));
  const tenants = useStore(s => s.tenants);
  const user = tenant.data.users.find(u => u.id === session?.userId) ?? tenant.data.users[0];
  const realUser = tenant.data.users.find(u => u.id === session?.realUserId) ?? user;
  return {
    session, tenant, tenants, user, realUser,
    impersonating: !!session && session.userId !== session.realUserId,
    can: (a: Action) => roleCan(user.role, a),
    canAccess: (r: Resource) => roleCanAccess(user.role, r),
  };
}

export function currentUserId() {
  return store.get().session?.userId ?? 'system';
}
