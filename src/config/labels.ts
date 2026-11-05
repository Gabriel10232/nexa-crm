import type {
  ActionType, ActivityType, Channel, ContactType, EventType, LeadStatus, Lifecycle, ProposalStatus,
  TaskType, Temperature, TriggerType, GoalMetric,
} from '../types';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: Tone }> = {
  novo: { label: 'Novo', tone: 'info' },
  em_contato: { label: 'Em contato', tone: 'accent' },
  aguardando: { label: 'Aguardando resposta', tone: 'warning' },
  qualificado: { label: 'Qualificado', tone: 'success' },
  reuniao: { label: 'Reunião agendada', tone: 'accent' },
  proposta: { label: 'Proposta enviada', tone: 'info' },
  convertido: { label: 'Convertido', tone: 'success' },
  desqualificado: { label: 'Desqualificado', tone: 'neutral' },
  perdido: { label: 'Perdido', tone: 'danger' },
};

export const TEMPERATURE: Record<Temperature, { label: string; tone: Tone }> = {
  frio: { label: 'Frio', tone: 'info' },
  morno: { label: 'Morno', tone: 'warning' },
  quente: { label: 'Quente', tone: 'danger' },
};

export const LIFECYCLE: Record<Lifecycle, { label: string; tone: Tone }> = {
  lead: { label: 'Lead', tone: 'info' },
  prospect: { label: 'Prospect', tone: 'accent' },
  cliente: { label: 'Cliente', tone: 'success' },
  parceiro: { label: 'Parceiro', tone: 'warning' },
  fornecedor: { label: 'Fornecedor', tone: 'neutral' },
};

export const CONTACT_TYPES: Record<ContactType, string> = {
  proprietario: 'Proprietário', socio: 'Sócio', diretor: 'Diretor', gerente: 'Gerente',
  comprador: 'Comprador', financeiro: 'Financeiro', influenciador: 'Influenciador',
  usuario_final: 'Usuário final', operacional: 'Contato operacional', outro: 'Outro',
};

export const ACTIVITY: Record<ActivityType, { label: string; icon: string }> = {
  call: { label: 'Ligação', icon: 'Phone' },
  email: { label: 'E-mail', icon: 'Mail' },
  whatsapp: { label: 'WhatsApp', icon: 'MessageCircle' },
  meeting: { label: 'Reunião', icon: 'Users' },
  note: { label: 'Nota', icon: 'StickyNote' },
  file: { label: 'Arquivo', icon: 'Paperclip' },
  proposal: { label: 'Proposta', icon: 'FileText' },
  deal: { label: 'Negociação', icon: 'Handshake' },
  status: { label: 'Status', icon: 'Flag' },
  change: { label: 'Alteração', icon: 'History' },
  task: { label: 'Tarefa', icon: 'CheckSquare' },
  system: { label: 'Sistema', icon: 'Zap' },
  message: { label: 'Mensagem', icon: 'MessagesSquare' },
};

export const TASK_TYPES: Record<TaskType, string> = {
  tarefa: 'Tarefa', ligacao: 'Ligação', followup: 'Follow-up', email: 'E-mail', reuniao: 'Reunião', visita: 'Visita',
};

export const EVENT_TYPES: Record<EventType, { label: string; tone: Tone }> = {
  reuniao: { label: 'Reunião', tone: 'accent' },
  ligacao: { label: 'Ligação', tone: 'info' },
  tarefa: { label: 'Tarefa', tone: 'neutral' },
  followup: { label: 'Follow-up', tone: 'warning' },
  demonstracao: { label: 'Demonstração', tone: 'success' },
  visita: { label: 'Visita', tone: 'danger' },
  evento: { label: 'Evento', tone: 'info' },
};

export const CHANNELS: Record<Channel, { label: string; icon: string }> = {
  email: { label: 'E-mail', icon: 'Mail' },
  whatsapp: { label: 'WhatsApp', icon: 'MessageCircle' },
  telefone: { label: 'Telefone', icon: 'Phone' },
  sms: { label: 'SMS', icon: 'Smartphone' },
  chat: { label: 'Chat do site', icon: 'MessagesSquare' },
  instagram: { label: 'Instagram Direct', icon: 'Instagram' },
};

export const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  enviada: { label: 'Enviada', tone: 'info' },
  visualizada: { label: 'Visualizada', tone: 'accent' },
  negociacao: { label: 'Em negociação', tone: 'warning' },
  aceita: { label: 'Aceita', tone: 'success' },
  recusada: { label: 'Recusada', tone: 'danger' },
  expirada: { label: 'Expirada', tone: 'neutral' },
};

export const TRIGGERS: Record<TriggerType, { label: string; hint: string; param?: { key: string; label: string; type: 'number' | 'stage' } }> = {
  'lead.created': { label: 'Lead criado', hint: 'Dispara quando um novo lead entra no CRM.' },
  'deal.stage_changed': { label: 'Oportunidade muda de etapa', hint: 'Dispara ao mover um card no pipeline.', param: { key: 'stage', label: 'Etapa de destino', type: 'stage' } },
  'lead.no_response': { label: 'Lead sem resposta', hint: 'Verificação diária de leads sem contato.', param: { key: 'days', label: 'Dias sem contato', type: 'number' } },
  'deal.won': { label: 'Venda ganha', hint: 'Dispara quando uma oportunidade é marcada como ganha.' },
  'deal.lost': { label: 'Venda perdida', hint: 'Dispara ao marcar uma oportunidade como perdida.' },
  'proposal.sent': { label: 'Proposta enviada', hint: 'Dispara quando o status muda para Enviada.' },
  'customer.inactive': { label: 'Cliente inativo', hint: 'Clientes sem interação no período.', param: { key: 'days', label: 'Dias de inatividade', type: 'number' } },
  'deal.value_above': { label: 'Valor acima de limite', hint: 'Oportunidade criada/alterada acima do valor.', param: { key: 'amount', label: 'Valor mínimo', type: 'number' } },
};

export const ACTIONS: Record<ActionType, { label: string; fields: { key: string; label: string; type?: 'text' | 'number' | 'user' | 'status' | 'stage' | 'tag' }[] }> = {
  create_task: { label: 'Criar tarefa', fields: [{ key: 'title', label: 'Título da tarefa' }, { key: 'days', label: 'Prazo (dias)', type: 'number' }] },
  change_status: { label: 'Alterar status', fields: [{ key: 'status', label: 'Novo status', type: 'status' }] },
  assign_owner: { label: 'Alterar responsável', fields: [{ key: 'userId', label: 'Responsável (vazio = rodízio)', type: 'user' }] },
  add_tag: { label: 'Adicionar tag', fields: [{ key: 'tag', label: 'Tag', type: 'tag' }] },
  notify: { label: 'Enviar notificação', fields: [{ key: 'message', label: 'Mensagem' }] },
  send_email: { label: 'Enviar e-mail (simulado)', fields: [{ key: 'subject', label: 'Assunto' }] },
  create_event: { label: 'Criar evento', fields: [{ key: 'title', label: 'Título' }, { key: 'days', label: 'Daqui a (dias)', type: 'number' }] },
  move_deal: { label: 'Mover oportunidade', fields: [{ key: 'stage', label: 'Etapa', type: 'stage' }] },
  update_field: { label: 'Atualizar campo', fields: [{ key: 'field', label: 'Campo' }, { key: 'value', label: 'Valor' }] },
  webhook: { label: 'Disparar webhook', fields: [{ key: 'url', label: 'URL do webhook' }] },
  approval: { label: 'Solicitar aprovação', fields: [{ key: 'userId', label: 'Aprovador', type: 'user' }] },
};

export const GOAL_METRICS: Record<GoalMetric, { label: string; money?: boolean }> = {
  revenue: { label: 'Receita', money: true },
  sales: { label: 'Quantidade de vendas' },
  meetings: { label: 'Número de reuniões' },
  contacts: { label: 'Número de contatos' },
  newCustomers: { label: 'Novos clientes' },
  wonDeals: { label: 'Oportunidades ganhas' },
};

export const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export const SEGMENTS = ['Tecnologia', 'Serviços', 'Imobiliário', 'Educação', 'Saúde', 'Agência de marketing', 'Consultoria', 'Seguros', 'Vendas B2B', 'Comércio', 'Indústria', 'Prestador de serviços'];
