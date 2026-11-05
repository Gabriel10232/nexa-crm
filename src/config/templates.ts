import type { Pipeline, Stage } from '../types';

type StageDef = [string, number];

const STAGE_COLORS = ['#9BA8AB', '#86B4C6', '#7FA7B5', '#5E8AA3', '#8C9EC4', '#C8B88A', '#E0B66E'];

export const OPERATION_TEMPLATES: Record<string, { label: string; description: string; stages: StageDef[]; products: string[]; sources: string[] }> = {
  b2b: {
    label: 'Vendas B2B', description: 'Ciclo consultivo com diagnóstico, proposta e negociação.',
    stages: [['Prospecção', 10], ['Qualificação', 20], ['Diagnóstico', 35], ['Reunião', 50], ['Proposta', 65], ['Negociação', 80], ['Fechamento', 90]],
    products: ['Plano Growth', 'Plano Enterprise', 'Implantação', 'Consultoria', 'Suporte Premium', 'Licença anual'],
    sources: ['Site', 'Indicação', 'LinkedIn', 'Google Ads', 'Evento', 'Outbound', 'Parceiro'],
  },
  imobiliaria: {
    label: 'Imobiliária', description: 'Do primeiro contato à documentação e assinatura.',
    stages: [['Contato', 10], ['Visita agendada', 30], ['Visita realizada', 50], ['Proposta', 65], ['Documentação', 85], ['Assinatura', 95]],
    products: ['Apartamento', 'Casa', 'Sala comercial', 'Terreno', 'Locação'],
    sources: ['Portal imobiliário', 'Instagram', 'Indicação', 'Placa', 'Site'],
  },
  agencia: {
    label: 'Agência', description: 'Briefing, proposta criativa e contrato.',
    stages: [['Briefing', 15], ['Diagnóstico', 30], ['Proposta', 55], ['Negociação', 75], ['Contrato', 90]],
    products: ['Gestão de tráfego', 'Social media', 'Branding', 'Site institucional', 'Inbound'],
    sources: ['Indicação', 'Instagram', 'Site', 'LinkedIn', 'Evento'],
  },
  clinica: {
    label: 'Clínica', description: 'Agendamento, consulta, orçamento e tratamento.',
    stages: [['Agendamento', 20], ['Consulta', 45], ['Orçamento', 65], ['Tratamento', 90]],
    products: ['Consulta', 'Check-up', 'Procedimento', 'Pacote anual'],
    sources: ['Google', 'Instagram', 'Indicação', 'Convênio', 'Site'],
  },
  consultoria: {
    label: 'Consultoria', description: 'Diagnóstico aprofundado e proposta de escopo.',
    stages: [['Prospecção', 10], ['Diagnóstico', 35], ['Proposta', 60], ['Negociação', 80]],
    products: ['Diagnóstico', 'Projeto', 'Mentoria', 'Treinamento'],
    sources: ['Indicação', 'LinkedIn', 'Evento', 'Site'],
  },
  servicos: {
    label: 'Serviços gerais', description: 'Orçamento rápido e fechamento simples.',
    stages: [['Novo', 15], ['Orçamento', 45], ['Negociação', 75]],
    products: ['Serviço avulso', 'Contrato mensal', 'Manutenção'],
    sources: ['WhatsApp', 'Google', 'Indicação', 'Site'],
  },
};

export function buildPipeline(id: string, name: string, key: string): Pipeline {
  const tpl = OPERATION_TEMPLATES[key] ?? OPERATION_TEMPLATES.b2b;
  const stages: Stage[] = tpl.stages.map(([n, p], i) => ({
    id: `${id}_s${i}`, name: n, probability: p, kind: 'open', color: STAGE_COLORS[i % STAGE_COLORS.length],
  }));
  stages.push({ id: `${id}_won`, name: 'Ganho', probability: 100, kind: 'won', color: '#74C69D' });
  stages.push({ id: `${id}_lost`, name: 'Perdido', probability: 0, kind: 'lost', color: '#E88383' });
  return { id, name, stages };
}
