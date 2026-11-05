/* ============================================================
 * NEXA CRM — Domain model
 * Entities are intentionally separate (Company ≠ Person ≠ Lead ≠ Deal)
 * and mirror a relational schema so the LocalAdapter can be swapped
 * for a real database (Postgres/Supabase/REST) without UI changes.
 * ============================================================ */

export type ID = string;
export type ISODate = string;

export type RoleKey =
  | 'owner' | 'admin' | 'manager' | 'supervisor'
  | 'seller' | 'support' | 'analyst' | 'readonly';

export type Resource =
  | 'dashboard' | 'leads' | 'people' | 'companies' | 'deals' | 'tasks' | 'events'
  | 'inbox' | 'proposals' | 'automations' | 'reports' | 'goals' | 'team' | 'settings';

export type Action =
  | 'view' | 'create' | 'edit' | 'delete' | 'export'
  | 'reports' | 'settings' | 'otherTeams' | 'financial' | 'hardDelete';

export interface Role {
  key: RoleKey;
  label: string;
  description: string;
  perms: Partial<Record<Action, boolean>>;
}

export interface User {
  id: ID;
  name: string;
  email: string;
  role: RoleKey;
  teamId: ID;
  active: boolean;
  lastAccessAt: ISODate;
  color: string;
  title: string;
  invitedAt?: ISODate;
  pending?: boolean;
  /** SHA-256 of the password (simulated auth — replace with a real provider in production). */
  passwordHash?: string;
}

export interface Team { id: ID; name: string; department: string; leadId?: ID; }

export interface Tag { id: ID; name: string; color: string; }

export interface CustomField {
  id: ID;
  entity: 'lead' | 'person' | 'company' | 'deal';
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  required?: boolean;
}

export type LeadStatus =
  | 'novo' | 'em_contato' | 'aguardando' | 'qualificado' | 'reuniao'
  | 'proposta' | 'convertido' | 'desqualificado' | 'perdido';

export type Temperature = 'frio' | 'morno' | 'quente';

export type LeadKind = 'individual' | 'business';

export interface Lead {
  id: ID;
  kind: LeadKind;
  name: string;
  companyName?: string;
  companyId?: ID;
  personId?: ID;
  jobTitle?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  city?: string;
  state?: string;
  website?: string;
  cpf?: string;
  cnpj?: string;
  source: string;
  campaign?: string;
  product?: string;
  value: number;
  temperature: Temperature;
  ownerId: ID;
  teamId: ID;
  status: LeadStatus;
  tags: string[];
  createdAt: ISODate;
  lastContactAt?: ISODate;
  nextContactAt?: ISODate;
  score: number;
  notes?: string;
  lostReason?: string;
  archivedAt?: ISODate;
  convertedAt?: ISODate;
  converted?: { personId?: ID; companyId?: ID; dealId?: ID; customer?: boolean };
  custom?: Record<string, string>;
}

export type ContactType =
  | 'proprietario' | 'socio' | 'diretor' | 'gerente' | 'comprador'
  | 'financeiro' | 'influenciador' | 'usuario_final' | 'operacional' | 'outro';

export type Lifecycle = 'lead' | 'cliente' | 'parceiro' | 'fornecedor' | 'prospect';

export interface Person {
  id: ID;
  name: string;
  cpf?: string;
  birthDate?: string;
  email?: string;
  personalEmail?: string;
  phone?: string;
  whatsapp?: string;
  linkedin?: string;
  address?: string;
  city?: string;
  state?: string;
  cep?: string;
  companyId?: ID;
  jobTitle?: string;
  department?: string;
  contactType?: ContactType;
  influence?: 1 | 2 | 3 | 4 | 5;
  decisionMaker?: boolean;
  relationship?: 'novo' | 'ativo' | 'frio' | 'promotor' | 'detrator';
  preference?: 'email' | 'whatsapp' | 'telefone' | 'reuniao';
  lifecycle: Lifecycle;
  source?: string;
  product?: string;
  value?: number;
  status?: string;
  ownerId: ID;
  tags: string[];
  notes?: string;
  nextContactAt?: ISODate;
  createdAt: ISODate;
  archivedAt?: ISODate;
  companyHistory: { companyId: ID; from: ISODate; to?: ISODate }[];
  custom?: Record<string, string>;
}

export type CompanySize = 'MEI' | 'Micro' | 'Pequena' | 'Média' | 'Grande';

export interface Company {
  id: ID;
  legalName: string;
  tradeName: string;
  cnpj?: string;
  segment: string;
  size: CompanySize;
  website?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  state?: string;
  cep?: string;
  revenue?: number;
  employees?: number;
  source?: string;
  ownerId: ID;
  status: 'ativo' | 'inativo' | 'em_negociacao';
  category: Lifecycle;
  tags: string[];
  notes?: string;
  createdAt: ISODate;
  archivedAt?: ISODate;
  custom?: Record<string, string>;
}

export interface Stage {
  id: ID;
  name: string;
  probability: number;
  kind: 'open' | 'won' | 'lost';
  color: string;
}

export interface Pipeline { id: ID; name: string; stages: Stage[]; }

export type DealStatus = 'open' | 'won' | 'lost';

export interface Deal {
  id: ID;
  name: string;
  personId?: ID;
  companyId?: ID;
  leadId?: ID;
  product: string;
  value: number;
  probability: number;
  pipelineId: ID;
  stageId: ID;
  status: DealStatus;
  ownerId: ID;
  openedAt: ISODate;
  expectedClose: ISODate;
  closedAt?: ISODate;
  stageEnteredAt: ISODate;
  source: string;
  lostReason?: string;
  notes?: string;
  priority: 'baixa' | 'media' | 'alta';
  files: FileRef[];
  archivedAt?: ISODate;
}

export interface FileRef { id: ID; name: string; size: number; addedAt: ISODate; by: ID; }

/** Targets an interaction belongs to. Interactions with a person linked to a
 * company carry a snapshot of companyId so they also show on the company timeline. */
export interface Refs {
  leadId?: ID;
  personId?: ID;
  companyId?: ID;
  dealId?: ID;
  proposalId?: ID;
}

export type ActivityType =
  | 'call' | 'email' | 'whatsapp' | 'meeting' | 'note' | 'file' | 'proposal'
  | 'deal' | 'status' | 'change' | 'task' | 'system' | 'message';

export interface Activity {
  id: ID;
  type: ActivityType;
  title: string;
  body?: string;
  at: ISODate;
  userId: ID;
  refs: Refs;
  meta?: Record<string, unknown>;
}

export type TaskType = 'tarefa' | 'ligacao' | 'followup' | 'email' | 'reuniao' | 'visita';

export interface Task {
  id: ID;
  title: string;
  type: TaskType;
  due: ISODate;
  done: boolean;
  doneAt?: ISODate;
  ownerId: ID;
  priority: 'baixa' | 'media' | 'alta';
  refs: Refs;
  notes?: string;
  createdBy?: string;
}

export type EventType = 'reuniao' | 'ligacao' | 'tarefa' | 'followup' | 'demonstracao' | 'visita' | 'evento';

export interface CalEvent {
  id: ID;
  title: string;
  type: EventType;
  start: ISODate;
  end: ISODate;
  participants: ID[];
  ownerId: ID;
  refs: Refs;
  reminderMin?: number;
  location?: string;
  done: boolean;
  notes?: string;
}

export type Channel = 'email' | 'whatsapp' | 'telefone' | 'sms' | 'chat' | 'instagram';

export interface Message {
  id: ID;
  from: 'contact' | 'user' | 'note';
  userId?: ID;
  body: string;
  at: ISODate;
  attachments?: string[];
}

export interface Conversation {
  id: ID;
  channel: Channel;
  personId?: ID;
  companyId?: ID;
  subject: string;
  status: 'aberta' | 'pendente' | 'resolvida';
  assigneeId: ID;
  tags: string[];
  sentiment: 'positivo' | 'neutro' | 'negativo';
  unread: number;
  remindAt?: ISODate;
  messages: Message[];
}

export type ProposalStatus = 'rascunho' | 'enviada' | 'visualizada' | 'negociacao' | 'aceita' | 'recusada' | 'expirada';

export interface ProposalItem { id: ID; description: string; qty: number; price: number; discount: number; }

export interface Proposal {
  id: ID;
  number: string;
  title: string;
  dealId?: ID;
  companyId?: ID;
  personId?: ID;
  ownerId: ID;
  items: ProposalItem[];
  discount: number;
  tax: number;
  validUntil: ISODate;
  paymentTerms: string;
  notes?: string;
  status: ProposalStatus;
  template: string;
  createdAt: ISODate;
  sentAt?: ISODate;
  signedBy?: string;
}

export type TriggerType =
  | 'lead.created' | 'deal.stage_changed' | 'lead.no_response' | 'deal.won'
  | 'proposal.sent' | 'customer.inactive' | 'deal.value_above' | 'deal.lost';

export type ActionType =
  | 'create_task' | 'change_status' | 'assign_owner' | 'add_tag' | 'notify'
  | 'send_email' | 'create_event' | 'move_deal' | 'update_field' | 'webhook' | 'approval';

export interface Condition { field: string; op: 'eq' | 'neq' | 'gt' | 'lt' | 'contains'; value: string; }

export interface AutomationAction { type: ActionType; params: Record<string, string>; }

export interface Automation {
  id: ID;
  name: string;
  description?: string;
  active: boolean;
  trigger: { type: TriggerType; params: Record<string, string> };
  conditions: Condition[];
  actions: AutomationAction[];
  runs: number;
  lastRunAt?: ISODate;
  createdAt: ISODate;
}

export interface AutomationRun {
  id: ID;
  automationId: ID;
  at: ISODate;
  test: boolean;
  ok: boolean;
  target: string;
  steps: { label: string; ok: boolean; detail?: string }[];
}

export type GoalMetric = 'revenue' | 'sales' | 'meetings' | 'contacts' | 'newCustomers' | 'wonDeals';
export interface Goal {
  id: ID;
  scope: 'user' | 'team' | 'department' | 'company';
  targetId?: ID;
  metric: GoalMetric;
  period: string; // YYYY-MM
  target: number;
}

export interface AuditEntry {
  id: ID;
  at: ISODate;
  userId: ID;
  action: string;
  entity: string;
  entityId?: ID;
  detail: string;
}

export interface Notification {
  id: ID;
  at: ISODate;
  title: string;
  body?: string;
  read: boolean;
  link?: string;
  kind: 'info' | 'success' | 'warning' | 'danger';
}

export interface SavedFilter { id: ID; entity: string; name: string; query: Record<string, unknown>; }

export interface Session { id: ID; userId: ID; device: string; location: string; startedAt: ISODate; current?: boolean; }

export interface OrgSettings {
  name: string;
  productName: string;
  segment: string;
  usersEstimate: string;
  objective: string;
  currency: string;
  locale: string;
  timezone: string;
  logo?: string; // data URL
  favicon?: string;
  onboarded: boolean;
  template: string;
  distribution: 'round_robin' | 'by_team' | 'manual';
  leadStatuses: { key: LeadStatus; label: string }[];
  lostReasons: string[];
  categories: string[];
  sources: string[];
  products: string[];
  privacyPolicy: string;
  notifications: { email: boolean; push: boolean; staleDeals: boolean; dailyDigest: boolean };
  checklist: Record<string, boolean>;
}

/* ---------------- Dashboard builder ---------------- */

export type WidgetType =
  | 'kpi' | 'chart_sales' | 'chart_funnel' | 'chart_sources' | 'chart_status'
  | 'chart_forecast' | 'chart_pipeline' | 'goals' | 'ranking' | 'meetings'
  | 'no_contact' | 'stale_deals' | 'recent_customers' | 'tasks' | 'timeline'
  | 'inbox' | 'notes' | 'section';

export type KpiMetric =
  | 'total_leads' | 'new_leads' | 'qualified_leads' | 'people' | 'companies'
  | 'open_deals' | 'pipeline_value' | 'forecast' | 'won_revenue' | 'conversion'
  | 'avg_ticket' | 'avg_cycle' | 'won_count' | 'lost_count' | 'pending_activities'
  | 'proposals_sent' | 'proposals_accepted' | 'custom';

export interface WidgetConfig {
  metric?: KpiMetric;
  chart?: 'area' | 'bar' | 'line' | 'donut' | 'list';
  period?: 'inherit' | '7d' | '30d' | '90d' | '12m';
  ownerId?: string;
  teamId?: string;
  color?: string;
  source?: string;
  notes?: string;
  custom?: { entity: 'leads' | 'deals' | 'people' | 'companies' | 'tasks'; agg: 'count' | 'sum'; field?: string; filterField?: string; filterValue?: string };
}

export interface Widget {
  id: ID;
  type: WidgetType;
  title: string;
  description?: string;
  w: number; // 1..12 columns (desktop)
  h: number; // rows
  locked?: boolean;
  required?: boolean;
  visible: { desktop: boolean; tablet: boolean; mobile: boolean };
  config: WidgetConfig;
}

export interface DashboardLayout {
  id: ID;
  name: string;
  roles: RoleKey[];
  isDefault?: boolean;
  allowPersonal: boolean;
  shared: boolean;
  ownerId?: ID;
  widgets: Widget[];
  updatedAt: ISODate;
}

/* ---------------- Appearance ---------------- */

export interface ColorSet {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  bg2: string;
  text: string;
  text2: string;
  border: string;
  button: string;
  buttonText: string;
  sidebar: string;
  topbar: string;
  card: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  charts: string[];
}

export interface Appearance {
  mode: 'dark' | 'light' | 'auto';
  colors: { dark: ColorSet; light: ColorSet };
  gradient: boolean;
  glass: {
    enabled: boolean;
    cardAlpha: number;
    bgOpacity: number;
    blur: number;
    saturation: number;
    borderAlpha: number;
    borderWidth: number;
    shadow: number;
    innerGlow: number;
    highlight: number;
    sidebarAlpha: number;
    topbarAlpha: number;
    modalAlpha: number;
    widgetAlpha: number;
  };
  type: {
    family: string;
    baseSize: number;
    titleSize: number;
    numberSize: number;
    weight: number;
    lineHeight: number;
    letterSpacing: number;
    titleStyle: 'normal' | 'uppercase' | 'tight';
    navSize: number;
    buttonSize: number;
  };
  space: {
    density: 'compact' | 'balanced' | 'comfortable';
    cardPadding: number;
    gap: number;
    margin: number;
    sidebarWidth: number;
    topbarHeight: number;
    radius: number;
    rowHeight: number;
    iconSize: number;
    widgetRow: number;
  };
  a11y: { reduceMotion: boolean; highContrast: boolean; autoLite: boolean; motionPref?: 'system' | 'full' | 'reduce' };
}

export interface AppearancePreset { id: ID; name: string; builtin?: boolean; appearance: Appearance; layout?: Widget[]; }

/* ---------------- Tenant ---------------- */

export interface TenantData {
  org: OrgSettings;
  users: User[];
  teams: Team[];
  tags: Tag[];
  customFields: CustomField[];
  leads: Lead[];
  people: Person[];
  companies: Company[];
  pipelines: Pipeline[];
  deals: Deal[];
  activities: Activity[];
  tasks: Task[];
  events: CalEvent[];
  conversations: Conversation[];
  proposals: Proposal[];
  automations: Automation[];
  automationRuns: AutomationRun[];
  goals: Goal[];
  audit: AuditEntry[];
  notifications: Notification[];
  savedFilters: SavedFilter[];
  sessions: Session[];
  dashboards: DashboardLayout[];
  activeDashboardId: ID;
  presets: AppearancePreset[];
  appearance: Appearance;
  quickNotes: string;
  dismissedDuplicates: string[];
}

export interface Tenant { id: ID; name: string; data: TenantData; }
