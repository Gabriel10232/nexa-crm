import type { Action, Role, RoleKey, Resource } from '../types';

const all = (v: boolean): Record<Action, boolean> => ({
  view: v, create: v, edit: v, delete: v, export: v, reports: v, settings: v, otherTeams: v, financial: v, hardDelete: v,
});

export const ROLES: Role[] = [
  { key: 'owner', label: 'Proprietário', description: 'Acesso total, incluindo faturamento e exclusão definitiva.', perms: all(true) },
  { key: 'admin', label: 'Administrador', description: 'Gerencia usuários, configurações e todos os dados.', perms: all(true) },
  { key: 'manager', label: 'Gestor', description: 'Gerencia equipes, metas e relatórios. Não altera configurações.', perms: { ...all(true), settings: false, hardDelete: false } },
  { key: 'supervisor', label: 'Supervisor', description: 'Acompanha equipes e edita registros. Sem exclusões.', perms: { view: true, create: true, edit: true, export: true, reports: true, otherTeams: true } },
  { key: 'seller', label: 'Vendedor', description: 'Trabalha seus leads e oportunidades. Vê apenas a própria equipe.', perms: { view: true, create: true, edit: true, financial: true } },
  { key: 'support', label: 'Atendimento', description: 'Foco na inbox e contatos. Sem dados financeiros.', perms: { view: true, create: true, edit: true } },
  { key: 'analyst', label: 'Analista', description: 'Relatórios e exportações, sem edição de registros.', perms: { view: true, export: true, reports: true, otherTeams: true, financial: true } },
  { key: 'readonly', label: 'Somente leitura', description: 'Visualiza dados da própria equipe, sem alterações.', perms: { view: true } },
];

export const ACTION_LABELS: Record<Action, string> = {
  view: 'Visualizar', create: 'Criar', edit: 'Editar', delete: 'Excluir (arquivar)', export: 'Exportar',
  reports: 'Relatórios', settings: 'Configurações', otherTeams: 'Dados de outras equipes',
  financial: 'Dados financeiros', hardDelete: 'Exclusão definitiva',
};

export const roleOf = (k: RoleKey) => ROLES.find(r => r.key === k)!;

export function can(role: RoleKey, action: Action) {
  return !!roleOf(role)?.perms[action];
}

/** Route-level access: which resources each role can open. */
export function canAccess(role: RoleKey, res: Resource) {
  if (res === 'settings') return can(role, 'settings');
  if (res === 'team') return can(role, 'settings') || role === 'manager' || role === 'supervisor';
  if (res === 'reports') return can(role, 'reports');
  if (res === 'automations') return role !== 'readonly' && role !== 'support';
  if (res === 'goals') return role !== 'support';
  return can(role, 'view');
}
