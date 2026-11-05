/* NEXA Copilot — SIMULATED assistant.
 * No language model is connected. Answers are computed with deterministic rules
 * over the local CRM data and are always labelled as demonstrative.
 * To connect a real model, implement `CopilotProvider.ask` calling your backend. */
import type { TenantData, User } from '../types';
import { goalProgress, leadsWithoutContact, scoped, staleDeals } from './metrics';
import { daysBetween, money, normalize, relTime } from '../lib/utils';
import { LEAD_STATUS } from '../config/labels';

export interface CopilotAnswer {
  text: string;
  bullets?: string[];
  links?: { label: string; to: string }[];
  action?: { kind: 'create_task'; title: string; dueDays: number };
  draft?: string;
}

export const SUGGESTIONS = [
  'Mostre as oportunidades com maior chance de fechamento.',
  'Quais leads estão sem contato há mais de uma semana?',
  'Quais vendedores estão abaixo da meta?',
  'Detecte oportunidades paradas.',
  'Identifique leads prioritários.',
  'Crie uma tarefa: ligar para a Lumen amanhã',
  'Gere um relatório do mês.',
];

const has = (q: string, ...k: string[]) => k.some(x => q.includes(x));

export function sentiment(text: string): 'positivo' | 'neutro' | 'negativo' {
  const t = normalize(text);
  const neg = ['lento', 'problema', 'reclam', 'ruim', 'cancel', 'insatisf', 'atras', 'erro', 'urgente', 'demorando'].filter(w => t.includes(w)).length;
  const pos = ['otimo', 'perfeito', 'obrigad', 'gostei', 'excelente', 'interesse', 'parabens', 'adorei'].filter(w => t.includes(w)).length;
  return neg > pos ? 'negativo' : pos > neg ? 'positivo' : 'neutro';
}

export function ask(d: TenantData, user: User, raw: string, ctx?: { personId?: string; companyId?: string; dealId?: string; leadId?: string }): CopilotAnswer {
  const q = normalize(raw);
  const deals = scoped(d, user, d.deals).filter(x => !x.archivedAt);
  const open = deals.filter(x => x.status === 'open');
  const nameOf = (id?: string) => d.people.find(p => p.id === id)?.name ?? d.companies.find(c => c.id === id)?.tradeName ?? '';

  if (has(q, 'resum') && (ctx?.personId || ctx?.companyId || ctx?.dealId || ctx?.leadId)) {
    const acts = d.activities.filter(a => (ctx.personId && a.refs.personId === ctx.personId) || (ctx.companyId && a.refs.companyId === ctx.companyId) || (ctx.dealId && a.refs.dealId === ctx.dealId) || (ctx.leadId && a.refs.leadId === ctx.leadId)).sort((a, b) => b.at.localeCompare(a.at));
    const types = acts.reduce<Record<string, number>>((m, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {});
    return {
      text: `Resumo de ${acts.length} interações registradas. Última interação ${relTime(acts[0]?.at)}.`,
      bullets: [
        `Composição: ${Object.entries(types).map(([k, v]) => `${v} ${k}`).join(', ') || 'sem interações'}.`,
        ...acts.slice(0, 4).map(a => `${new Date(a.at).toLocaleDateString('pt-BR')} — ${a.title}${a.body ? `: ${a.body.slice(0, 80)}` : ''}`),
        'Próximo passo sugerido: confirmar decisor e enviar resumo por escrito em até 48h.',
      ],
    };
  }
  if (has(q, 'follow', 'mensagem', 'responder', 'resposta')) {
    const p = ctx?.personId ? d.people.find(x => x.id === ctx.personId) : undefined;
    const first = p?.name.split(' ')[0] ?? 'tudo bem';
    return {
      text: 'Rascunho de mensagem gerado (exemplo demonstrativo). Revise antes de enviar.',
      draft: `Olá, ${first}! Passando para dar sequência à nossa última conversa. Preparei um resumo com os pontos que alinhamos e os próximos passos sugeridos. Faz sentido conversarmos 20 minutos esta semana para fecharmos os detalhes? Fico à disposição.`,
    };
  }
  if (has(q, 'crie uma tarefa', 'criar tarefa', 'crie tarefa', 'tarefa:')) {
    const title = raw.replace(/.*tarefa:?/i, '').trim() || 'Nova tarefa';
    const days = has(q, 'amanha') ? 1 : has(q, 'semana que vem', 'proxima semana') ? 7 : has(q, 'hoje') ? 0 : 1;
    return { text: `Entendi: "${title}" com prazo em ${days === 0 ? 'hoje' : `${days} dia(s)`}. Confirme para criar.`, action: { kind: 'create_task', title: title.charAt(0).toUpperCase() + title.slice(1), dueDays: days } };
  }
  if (has(q, 'maior chance', 'probabilidade', 'fechamento')) {
    const top = [...open].sort((a, b) => b.probability * b.value - a.probability * a.value).slice(0, 5);
    return { text: 'Oportunidades com maior valor ponderado (probabilidade × valor):', bullets: top.map(x => `${x.name} — ${x.probability}% · ${money(x.value)}`), links: [{ label: 'Abrir pipeline', to: '/pipeline' }] };
  }
  if (has(q, 'sem contato', 'sem resposta')) {
    const l = leadsWithoutContact(d, user, 7).slice(0, 6);
    return { text: `${leadsWithoutContact(d, user, 7).length} leads estão sem contato há mais de 7 dias. Os mais antigos:`, bullets: l.map(x => `${x.name}${x.companyName ? ` (${x.companyName})` : ''} — ${daysBetween(x.lastContactAt ?? x.createdAt)} dias · ${LEAD_STATUS[x.status].label}`), links: [{ label: 'Ver leads', to: '/leads' }] };
  }
  if (has(q, 'meta', 'abaixo')) {
    const g = d.goals.filter(x => x.scope === 'user' && x.metric === 'revenue').map(x => ({ u: d.users.find(u => u.id === x.targetId)!, p: goalProgress(d, x), g: x })).filter(x => x.u);
    const below = g.filter(x => !x.p.onTrack);
    return { text: below.length ? `${below.length} vendedor(es) abaixo do ritmo esperado da meta mensal:` : 'Todos os vendedores estão no ritmo da meta. 🎯', bullets: below.map(x => `${x.u.name} — ${x.p.pct.toFixed(0)}% de ${money(x.g.target)} (esperado ~${((x.p.expected / x.g.target) * 100).toFixed(0)}%)`), links: [{ label: 'Abrir metas', to: '/goals' }] };
  }
  if (has(q, 'parad', 'risco', 'perda')) {
    const s = staleDeals(d, user, 14).slice(0, 6);
    return { text: `Detectei ${staleDeals(d, user, 14).length} oportunidades sem avanço há 14+ dias (risco de perda):`, bullets: s.map(x => `${x.name} — ${daysBetween(x.stageEnteredAt)} dias na etapa · ${money(x.value)}`), links: [{ label: 'Ver pipeline', to: '/pipeline' }] };
  }
  if (has(q, 'prioritar', 'prioridade', 'quentes')) {
    const l = scoped(d, user, d.leads).filter(x => !x.archivedAt && !['convertido', 'perdido', 'desqualificado'].includes(x.status)).sort((a, b) => (b.score + (b.temperature === 'quente' ? 20 : 0)) - (a.score + (a.temperature === 'quente' ? 20 : 0))).slice(0, 6);
    return { text: 'Leads prioritários (pontuação + temperatura):', bullets: l.map(x => `${x.name} — score ${x.score} · ${x.temperature} · ${money(x.value)}`), links: [{ label: 'Abrir leads', to: '/leads' }] };
  }
  if (has(q, 'relatorio', 'report', 'mes')) {
    const won = deals.filter(x => x.status === 'won' && x.closedAt && daysBetween(x.closedAt) <= 30);
    const lost = deals.filter(x => x.status === 'lost' && x.closedAt && daysBetween(x.closedAt) <= 30);
    return { text: 'Relatório em linguagem natural — últimos 30 dias (dados de exemplo):', bullets: [
      `Foram ganhas ${won.length} oportunidades, somando ${money(won.reduce((a, x) => a + x.value, 0))}.`,
      `${lost.length} foram perdidas; principal motivo: ${mode(lost.map(x => x.lostReason ?? '—')) ?? '—'}.`,
      `O pipeline aberto soma ${money(open.reduce((a, x) => a + x.value, 0))} em ${open.length} oportunidades.`,
      `Taxa de conversão: ${won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0}%.`,
    ], links: [{ label: 'Relatórios completos', to: '/reports' }] };
  }
  if (has(q, 'sentimento')) {
    const c = d.conversations.slice(0, 5);
    return { text: 'Classificação de sentimento das conversas recentes:', bullets: c.map(x => `${x.subject} — ${sentiment(x.messages.map(m => m.body).join(' '))}`) };
  }
  if (has(q, 'reuniao', 'ata')) {
    return { text: 'Resumo de reunião (modelo demonstrativo):', bullets: ['Participantes alinharam objetivo de reduzir ciclo de vendas em 20%.', 'Cliente solicitou integração com ERP e treinamento da equipe.', 'Próximos passos: enviar proposta revisada até sexta e agendar demo técnica.'] };
  }
  if (has(q, 'produto', 'sugira', 'upsell')) {
    return { text: 'Sugestões de produtos com base em compras de contas similares (exemplo):', bullets: d.org.products.slice(0, 3).map((p, i) => `${p} — afinidade ${90 - i * 12}%`) };
  }
  return {
    text: 'Posso ajudar com análises do seu pipeline, leads e metas. Experimente um destes comandos:',
    bullets: SUGGESTIONS.slice(0, 5),
  };

  function mode(arr: string[]) { const m: Record<string, number> = {}; arr.forEach(a => (m[a] = (m[a] || 0) + 1)); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0]; }
  void nameOf;
}
