/* Integration registry. Every external integration is represented here with an
 * honest status. None is connected in the demo — the UI must never pretend otherwise. */

export type IntegrationStatus = 'not_connected' | 'simulated' | 'connected';

export interface Integration {
  key: string;
  name: string;
  category: 'Dados' | 'Autenticação' | 'Comunicação' | 'Agenda' | 'Cobrança' | 'Armazenamento' | 'Marketing' | 'Desenvolvedor' | 'IA';
  description: string;
  status: IntegrationStatus;
  envVar?: string;
  docs?: string;
}

export const INTEGRATIONS: Integration[] = [
  { key: 'database', name: 'Banco de dados (Postgres / Supabase)', category: 'Dados', description: 'Substitui o LocalStorageAdapter por um adapter remoto com o mesmo contrato.', status: 'simulated', envVar: 'VITE_API_URL' },
  { key: 'auth', name: 'Autenticação (OAuth / SSO)', category: 'Autenticação', description: 'AuthService simulado; trocar por Auth0, Clerk, Supabase Auth ou Cognito.', status: 'simulated', envVar: 'VITE_AUTH_DOMAIN' },
  { key: 'whatsapp', name: 'WhatsApp Business API', category: 'Comunicação', description: 'Envio e recebimento de mensagens na Inbox.', status: 'not_connected', envVar: 'WHATSAPP_TOKEN' },
  { key: 'email', name: 'E-mail transacional (SMTP / Resend / SES)', category: 'Comunicação', description: 'Envio de propostas, follow-ups e automações.', status: 'not_connected', envVar: 'EMAIL_API_KEY' },
  { key: 'gcal', name: 'Google Calendar', category: 'Agenda', description: 'Sincronização bidirecional de eventos.', status: 'not_connected' },
  { key: 'outlook', name: 'Outlook Calendar', category: 'Agenda', description: 'Sincronização via Microsoft Graph.', status: 'not_connected' },
  { key: 'stripe', name: 'Stripe', category: 'Cobrança', description: 'Assinaturas do SaaS e cobrança de propostas aceitas.', status: 'not_connected', envVar: 'STRIPE_KEY' },
  { key: 'storage', name: 'Armazenamento de arquivos (S3 / GCS)', category: 'Armazenamento', description: 'Anexos, propostas em PDF e logos.', status: 'not_connected' },
  { key: 'marketing', name: 'Ferramentas de marketing (RD, Meta Ads, Google Ads)', category: 'Marketing', description: 'Captura automática de leads de formulários e campanhas.', status: 'not_connected' },
  { key: 'webhooks', name: 'Webhooks', category: 'Desenvolvedor', description: 'Eventos de CRM enviados para URLs externas (simulado nas automações).', status: 'simulated' },
  { key: 'api', name: 'API pública NEXA', category: 'Desenvolvedor', description: 'Endpoints REST por entidade: /leads, /people, /companies, /deals…', status: 'not_connected' },
  { key: 'ai', name: 'Modelo de IA (Copilot)', category: 'IA', description: 'Copilot opera com respostas demonstrativas baseadas nos dados locais.', status: 'simulated', envVar: 'AI_API_KEY' },
];

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  not_connected: 'Não conectado',
  simulated: 'Simulado',
  connected: 'Conectado',
};

/** Simulated outbound call — always explicit about being a simulation. */
export async function simulateOutbound(kind: 'email' | 'whatsapp' | 'webhook' | 'sms', target: string) {
  await new Promise(r => setTimeout(r, 350));
  return { ok: true, simulated: true, message: `${kind.toUpperCase()} simulado para ${target} — nenhuma mensagem real foi enviada.` };
}
