/* Deterministic demo-data generator. All names, documents, e-mails and phones
 * are fictitious (e-mails use the reserved `.example` domain). */
import type {
  Activity, Automation, CalEvent, Company, CompanySize, Conversation, Deal, Goal, Lead, LeadStatus,
  Notification, Person, Proposal, Task, TenantData, User, Team, Tag, ContactType, Lifecycle, Temperature,
  TaskType, EventType, Channel, ProposalStatus, ActivityType, AuditEntry, Session,
} from '../types';
import { DEFAULT_APPEARANCE, BUILTIN_PRESETS } from '../config/appearance';
import { defaultDashboards } from '../config/widgets';
import { OPERATION_TEMPLATES, buildPipeline } from '../config/templates';
import { DAY, deepClone, monthKey } from '../lib/utils';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcelo', 'Natália', 'Otávio', 'Paula', 'Renato', 'Sabrina', 'Tiago', 'Vanessa', 'Wagner', 'Yasmin', 'André', 'Beatriz', 'Caio', 'Daniela', 'Eduardo', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Juliana', 'Leonardo', 'Mariana', 'Nicolas', 'Priscila', 'Rodrigo', 'Simone', 'Vinícius', 'Letícia', 'Murilo'];
const LAST = ['Andrade', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Freitas', 'Gomes', 'Hartmann', 'Lacerda', 'Macedo', 'Nogueira', 'Pacheco', 'Queiroz', 'Rezende', 'Siqueira', 'Teixeira', 'Valente', 'Xavier', 'Zanetti', 'Moreira', 'Prado', 'Sampaio', 'Vieira', 'Camargo'];
const CITIES: [string, string, string][] = [['São Paulo', 'SP', '11'], ['Campinas', 'SP', '19'], ['Curitiba', 'PR', '41'], ['Maringá', 'PR', '44'], ['Belo Horizonte', 'MG', '31'], ['Rio de Janeiro', 'RJ', '21'], ['Porto Alegre', 'RS', '51'], ['Florianópolis', 'SC', '48'], ['Goiânia', 'GO', '62'], ['Recife', 'PE', '81'], ['Salvador', 'BA', '71'], ['Brasília', 'DF', '61']];
const JOBS = ['Diretor comercial', 'Gerente de operações', 'Coordenador de compras', 'CEO', 'Sócio-fundador', 'Analista financeiro', 'Head de marketing', 'Gerente de TI', 'Supervisor administrativo', 'Diretora de RH'];
const DEPTS = ['Comercial', 'Operações', 'Compras', 'Diretoria', 'Financeiro', 'Marketing', 'TI', 'RH'];
const CAMPAIGNS = ['Black Friday B2B', 'Webinar Produtividade', 'Lançamento Q4', 'Indique e ganhe', 'Feira Expo Negócios', '—'];
const LOST = ['Preço acima do orçamento', 'Escolheu concorrente', 'Sem retorno do cliente', 'Projeto adiado', 'Sem fit com a solução', 'Sem verba aprovada'];

const COMPANY_DEF: [string, string, string, CompanySize][] = [
  ['Lumen Logística', 'Lumen Logística e Transportes Ltda', 'Serviços', 'Média'],
  ['Vértice Engenharia', 'Vértice Engenharia e Projetos S.A.', 'Indústria', 'Grande'],
  ['Horizonte Saúde', 'Clínica Horizonte Saúde Integrada Ltda', 'Saúde', 'Média'],
  ['Atlas Educação', 'Instituto Atlas de Educação Ltda', 'Educação', 'Média'],
  ['Brisa Imóveis', 'Brisa Negócios Imobiliários Ltda', 'Imobiliário', 'Pequena'],
  ['Nimbus Software', 'Nimbus Tecnologia da Informação Ltda', 'Tecnologia', 'Pequena'],
  ['Ferro & Cia', 'Ferro e Companhia Indústria Metalúrgica Ltda', 'Indústria', 'Grande'],
  ['Solaris Energia', 'Solaris Energia Renovável S.A.', 'Serviços', 'Média'],
  ['Cardume Agência', 'Cardume Comunicação Digital Ltda', 'Agência de marketing', 'Micro'],
  ['Prisma Consultoria', 'Prisma Gestão e Consultoria Empresarial Ltda', 'Consultoria', 'Pequena'],
  ['Monte Verde Alimentos', 'Monte Verde Indústria de Alimentos Ltda', 'Comércio', 'Grande'],
  ['Orla Seguros', 'Orla Corretora de Seguros Ltda', 'Seguros', 'Pequena'],
  ['Quartzo Varejo', 'Quartzo Comércio Varejista Ltda', 'Comércio', 'Média'],
  ['Trilha Turismo', 'Trilha Viagens e Turismo Ltda', 'Serviços', 'Micro'],
];

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');

function genCPF(r: () => number) {
  const n = Array.from({ length: 9 }, () => Math.floor(r() * 10));
  const d = (arr: number[]) => { const s = arr.reduce((a, v, i) => a + v * (arr.length + 1 - i), 0); const x = (s * 10) % 11; return x === 10 ? 0 : x; };
  n.push(d(n)); n.push(d(n));
  const s = n.join(''); return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
function genCNPJ(r: () => number) {
  const n = [...Array.from({ length: 8 }, () => Math.floor(r() * 10)), 0, 0, 0, 1];
  const calc = (arr: number[]) => { const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = arr.reduce((a, v, i) => a + v * w[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  n.push(calc(n)); n.push(calc(n));
  const s = n.join(''); return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}

export interface SeedOptions { orgName: string; seed: number; template: string; scale: number; segment: string; }

export function generateTenant(opt: SeedOptions): TenantData {
  const r = rng(opt.seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
  const NOW = Date.now();
  const ago = (d: number, h = int(8, 18)) => { const x = new Date(NOW - d * DAY); x.setHours(h, pick([0, 15, 30, 45]), 0, 0); return x.toISOString(); };
  const ahead = (d: number, h = int(8, 18)) => ago(-d, h);
  const tpl = OPERATION_TEMPLATES[opt.template] ?? OPERATION_TEMPLATES.b2b;
  const dom = slug(opt.orgName).slice(0, 12) + '.example';
  const phone = (ddd: string) => `(${ddd}) 90000-${String(int(1000, 9999))}`;
  let seq = 0; const id = (p: string) => `${p}_${opt.seed}_${(++seq).toString(36)}`;

  /* ---------- Users & teams ---------- */
  const teams: Team[] = [
    { id: 'team_ent', name: 'Comercial Enterprise', department: 'Comercial' },
    { id: 'team_smb', name: 'Comercial SMB', department: 'Comercial' },
    { id: 'team_cs', name: 'Atendimento & CS', department: 'Customer Success' },
  ];
  const U = (n: string, role: User['role'], teamId: string, title: string, color: string, last: number): User =>
    ({ id: `u_${slug(n.split(' ')[0])}`, name: n, email: `${slug(n.split(' ')[0])}.${slug(n.split(' ')[1])}@${dom}`, role, teamId, active: true, lastAccessAt: new Date(NOW - last * 3600000).toISOString(), color, title });
  const users: User[] = [
    U('Marina Duarte', 'owner', 'team_ent', 'CEO', '#7FA7B5', 1),
    U('Rafael Lima', 'admin', 'team_ent', 'Administrador do CRM', '#C8B88A', 3),
    U('Camila Rocha', 'manager', 'team_ent', 'Gerente comercial', '#8C9EC4', 2),
    U('Bruno Tavares', 'supervisor', 'team_smb', 'Supervisor de vendas', '#6FA58A', 6),
    U('Lucas Fernandes', 'seller', 'team_ent', 'Executivo de contas', '#5E8AA3', 0.5),
    U('Júlia Martins', 'seller', 'team_ent', 'Executiva de contas', '#E0B66E', 4),
    U('Pedro Alves', 'seller', 'team_smb', 'Vendedor', '#E88383', 9),
    U('Sofia Ramos', 'seller', 'team_smb', 'Vendedora', '#B39DDB', 20),
    U('Ana Ribeiro', 'support', 'team_cs', 'Analista de atendimento', '#86B4C6', 5),
    U('Thiago Moura', 'analyst', 'team_ent', 'Analista de dados', '#9BA8AB', 30),
    U('Beatriz Costa', 'readonly', 'team_smb', 'Diretoria (leitura)', '#CCD0CF', 72),
  ];
  teams[0].leadId = 'u_camila'; teams[1].leadId = 'u_bruno'; teams[2].leadId = 'u_ana';
  const sellers = users.filter(u => ['seller', 'manager', 'supervisor'].includes(u.role));
  const ownerTeam = (uid: string) => users.find(u => u.id === uid)!.teamId;

  const tags: Tag[] = [
    { id: 'tg1', name: 'VIP', color: '#C8B88A' }, { id: 'tg2', name: 'Decisor', color: '#7FA7B5' },
    { id: 'tg3', name: 'Recorrente', color: '#6FA58A' }, { id: 'tg4', name: 'Urgente', color: '#E88383' },
    { id: 'tg5', name: 'Evento', color: '#8C9EC4' }, { id: 'tg6', name: 'Indicação', color: '#86B4C6' },
    { id: 'tg7', name: 'Reativação', color: '#E0B66E' }, { id: 'tg8', name: 'Enterprise', color: '#5E8AA3' },
  ];
  const tagNames = tags.map(t => t.name);
  const someTags = () => (r() < 0.55 ? [pick(tagNames)] : []).concat(r() < 0.2 ? [pick(tagNames)] : []).filter((v, i, a) => a.indexOf(v) === i);

  const scale = opt.scale;
  /* ---------- Companies ---------- */
  const companies: Company[] = COMPANY_DEF.slice(0, Math.max(6, Math.round(14 * scale))).map(([trade, legal, seg, size], i) => {
    const [city, st, ddd] = pick(CITIES);
    return {
      id: id('co'), tradeName: trade, legalName: legal, cnpj: genCNPJ(r), segment: seg, size,
      website: `https://www.${slug(trade)}.example`, email: `contato@${slug(trade)}.example`, phone: phone(ddd), whatsapp: phone(ddd),
      address: `Av. ${pick(LAST)}, ${int(100, 2900)}`, city, state: st, cep: `${int(10000, 99999)}-${int(100, 999)}`,
      revenue: size === 'Grande' ? int(80, 400) * 1e6 : size === 'Média' ? int(10, 60) * 1e6 : int(5, 90) * 1e5,
      employees: size === 'Grande' ? int(500, 3000) : size === 'Média' ? int(80, 400) : int(4, 60),
      source: pick(tpl.sources), ownerId: pick(sellers).id, status: i < 9 ? 'ativo' : pick(['ativo', 'em_negociacao', 'inativo'] as const),
      category: (i < 8 ? 'cliente' : i < 10 ? 'prospect' : i === 10 ? 'parceiro' : i === 11 ? 'fornecedor' : 'prospect') as Lifecycle,
      tags: i < 3 ? ['VIP', 'Enterprise'] : someTags(), notes: i % 3 === 0 ? 'Conta estratégica — revisar plano de expansão trimestralmente.' : undefined,
      createdAt: ago(int(60, 400)),
    };
  });

  /* ---------- People ---------- */
  const usedNames = new Set<string>();
  const personName = () => { let n = ''; do { n = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(n)); usedNames.add(n); return n; };
  const people: Person[] = [];
  const CT: ContactType[] = ['diretor', 'comprador', 'financeiro', 'gerente', 'influenciador', 'usuario_final', 'socio', 'operacional'];
  companies.forEach((co, ci) => {
    const n = ci < 4 ? 4 : ci < 9 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const name = personName();
      const [, , ddd] = CITIES.find(c => c[0] === co.city) ?? pick(CITIES);
      const created = ago(int(20, 300));
      people.push({
        id: id('pe'), name, jobTitle: pick(JOBS), department: pick(DEPTS), companyId: co.id,
        email: `${slug(name.split(' ')[0])}.${slug(name.split(' ')[1])}@${slug(co.tradeName)}.example`,
        phone: phone(ddd), whatsapp: phone(ddd), linkedin: `linkedin.com/in/${slug(name)}-demo`,
        contactType: k === 0 ? 'diretor' : pick(CT), influence: (k === 0 ? 5 : int(1, 4)) as Person['influence'], decisionMaker: k === 0,
        relationship: pick(['ativo', 'ativo', 'promotor', 'novo', 'frio'] as const), preference: pick(['email', 'whatsapp', 'telefone', 'reuniao'] as const),
        lifecycle: co.category, city: co.city, state: co.state, ownerId: co.ownerId, tags: k === 0 ? ['Decisor'] : someTags(),
        createdAt: created, companyHistory: [{ companyId: co.id, from: created }], source: co.source,
      });
    }
  });
  // Independent individuals (pessoas físicas)
  const indN = Math.round(14 * scale);
  for (let k = 0; k < indN; k++) {
    const name = personName(); const [city, st, ddd] = pick(CITIES);
    people.push({
      id: id('pe'), name, cpf: genCPF(r), birthDate: `${int(1965, 2001)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
      email: `${slug(name.split(' ')[0])}${int(10, 99)}@email.example`, phone: phone(ddd), whatsapp: phone(ddd),
      address: `Rua ${pick(LAST)}, ${int(10, 999)}`, city, state: st, cep: `${int(10000, 99999)}-${int(100, 999)}`,
      lifecycle: k < 7 ? 'cliente' : 'lead', source: pick(tpl.sources), product: pick(tpl.products), value: int(2, 40) * 500,
      ownerId: pick(sellers).id, tags: someTags(), createdAt: ago(int(10, 250)), companyHistory: [], preference: pick(['whatsapp', 'email'] as const),
      nextContactAt: r() < 0.5 ? ahead(int(1, 12)) : undefined,
    });
  }

  /* ---------- Leads ---------- */
  const STATUSES: LeadStatus[] = ['novo', 'novo', 'em_contato', 'em_contato', 'aguardando', 'qualificado', 'qualificado', 'reuniao', 'proposta', 'convertido', 'desqualificado', 'perdido'];
  const leads: Lead[] = [];
  const leadN = Math.round(48 * scale);
  for (let k = 0; k < leadN; k++) {
    const business = r() < 0.6;
    const name = personName(); const [city, st, ddd] = pick(CITIES);
    const linkCo = business && r() < 0.3 ? pick(companies) : undefined;
    const coName = linkCo?.tradeName ?? (business ? `${pick(LAST)} ${pick(['Tecnologia', 'Comércio', 'Serviços', 'Distribuidora', 'Engenharia', 'Educacional'])}` : undefined);
    const status = pick(STATUSES);
    const created = int(0, 120);
    const owner = pick(sellers).id;
    const lastC = status === 'novo' ? undefined : int(0, Math.min(created, 25));
    leads.push({
      id: id('ld'), kind: business ? 'business' : 'individual', name, companyName: coName, companyId: linkCo?.id,
      jobTitle: business ? pick(JOBS) : undefined,
      email: `${slug(name.split(' ')[0])}.${slug(name.split(' ')[1])}@${coName ? slug(coName) : 'email'}.example`,
      phone: phone(ddd), whatsapp: phone(ddd), city, state: st,
      website: coName ? `https://${slug(coName)}.example` : undefined,
      cpf: business ? undefined : genCPF(r), cnpj: business && !linkCo ? genCNPJ(r) : linkCo?.cnpj,
      source: pick(tpl.sources), campaign: pick(CAMPAIGNS), product: pick(tpl.products),
      value: business ? int(4, 90) * 1000 : int(2, 30) * 500, temperature: pick(['frio', 'morno', 'quente'] as Temperature[]),
      ownerId: owner, teamId: ownerTeam(owner), status, tags: someTags(),
      createdAt: ago(created), lastContactAt: lastC !== undefined ? ago(lastC) : undefined,
      nextContactAt: ['convertido', 'desqualificado', 'perdido'].includes(status) ? undefined : r() < 0.7 ? ahead(int(-3, 10)) : undefined,
      score: int(15, 98), notes: r() < 0.3 ? 'Demonstrou interesse após conteúdo educativo. Prefere contato no período da tarde.' : undefined,
      lostReason: status === 'perdido' ? pick(LOST) : undefined,
      archivedAt: k % 17 === 16 ? ago(int(1, 10)) : undefined,
    });
  }
  // Intentional duplicate for the duplicate-detection demo
  if (leads.length > 3 && people.length > 3) {
    const p = people[1];
    leads[2] = { ...leads[2], name: p.name, email: p.email, companyName: companies[0].tradeName, kind: 'business', status: 'novo', archivedAt: undefined };
    leads[5] = { ...leads[5], name: leads[4].name, email: leads[4].email, phone: leads[4].phone, archivedAt: undefined };
  }

  /* ---------- Pipelines & deals ---------- */
  const mainPipe = buildPipeline('pipe_main', tpl.label === 'Vendas B2B' ? 'Vendas' : tpl.label, opt.template);
  const pipelines = [mainPipe, buildPipeline('pipe_renew', 'Renovações & Upsell', 'servicos')];
  const openStages = mainPipe.stages.filter(s => s.kind === 'open');
  const deals: Deal[] = [];
  const contactFor = () => { const p = pick(people); return { personId: p.id, companyId: p.companyId }; };
  const openN = Math.round(30 * scale);
  for (let k = 0; k < openN; k++) {
    const st = pick(openStages); const c = contactFor();
    const co = companies.find(x => x.id === c.companyId);
    const owner = co?.ownerId ?? pick(sellers).id;
    const product = pick(tpl.products);
    const opened = int(5, 90); const entered = int(0, Math.min(opened, 30));
    deals.push({
      id: id('dl'), name: `${product} — ${co?.tradeName ?? people.find(p => p.id === c.personId)!.name}`, ...c,
      product, value: int(3, 120) * 1000, probability: st.probability, pipelineId: mainPipe.id, stageId: st.id, status: 'open',
      ownerId: owner, openedAt: ago(opened), expectedClose: ahead(int(-5, 60)), stageEnteredAt: ago(entered),
      source: pick(tpl.sources), priority: pick(['baixa', 'media', 'alta'] as const), files: [],
      notes: r() < 0.4 ? 'Cliente pediu comparativo com solução atual e cronograma de implantação.' : undefined,
    });
  }
  const renewStages = pipelines[1].stages.filter(s => s.kind === 'open');
  for (let k = 0; k < Math.round(5 * scale); k++) {
    const co = companies[k % companies.length]; const st = pick(renewStages);
    deals.push({
      id: id('dl'), name: `Renovação anual — ${co.tradeName}`, companyId: co.id, personId: people.find(p => p.companyId === co.id)?.id,
      product: 'Renovação', value: int(10, 60) * 1000, probability: st.probability, pipelineId: 'pipe_renew', stageId: st.id, status: 'open',
      ownerId: co.ownerId, openedAt: ago(int(5, 40)), expectedClose: ahead(int(5, 50)), stageEnteredAt: ago(int(0, 20)),
      source: 'Base de clientes', priority: 'media', files: [],
    });
  }
  // Closed history across 12 months
  const closedN = Math.round(70 * scale);
  for (let k = 0; k < closedN; k++) {
    const thisMonth = k < Math.round(5 * scale);
    const won = thisMonth || r() < 0.62; const c = contactFor(); const co = companies.find(x => x.id === c.companyId);
    const closed = thisMonth ? int(0, Math.max(0, new Date().getDate() - 1)) : int(0, 360); const cycle = int(10, 75);
    const growth = 1 + (360 - closed) / 500; // revenue trending up
    const product = pick(tpl.products);
    deals.push({
      id: id('dl'), name: `${product} — ${co?.tradeName ?? people.find(p => p.id === c.personId)!.name}`, ...c,
      product, value: Math.round(int(4, 70) * 1000 * growth * (thisMonth ? 0.55 : 1)), probability: won ? 100 : 0, pipelineId: mainPipe.id,
      stageId: won ? 'pipe_main_won' : 'pipe_main_lost', status: won ? 'won' : 'lost', ownerId: co?.ownerId ?? pick(sellers).id,
      openedAt: ago(closed + cycle), expectedClose: ago(closed), closedAt: ago(closed), stageEnteredAt: ago(closed),
      source: pick(tpl.sources), lostReason: won ? undefined : pick(LOST), priority: 'media', files: [],
    });
  }
  if (deals[0]) deals[0].files = [{ id: 'f1', name: 'escopo-tecnico-v2.pdf', size: 482000, addedAt: ago(4), by: deals[0].ownerId }];

  /* ---------- Activities (timeline) ---------- */
  const activities: Activity[] = [];
  const ACT: ActivityType[] = ['call', 'email', 'whatsapp', 'meeting', 'note'];
  const TITLES: Record<string, string[]> = {
    call: ['Ligação de alinhamento', 'Ligação de qualificação', 'Retorno sobre proposta'],
    email: ['Envio de material comercial', 'Resposta sobre prazos', 'Envio de case de sucesso'],
    whatsapp: ['Confirmação de reunião', 'Dúvida sobre integração', 'Envio de link da demo'],
    meeting: ['Reunião de diagnóstico', 'Demonstração da plataforma', 'Reunião de negociação'],
    note: ['Observação interna', 'Contexto da conta', 'Próximos passos combinados'],
  };
  const BODIES = ['Cliente reforçou que o principal desafio é a falta de visibilidade do funil.', 'Combinado retorno até sexta com aprovação da diretoria.', 'Pediu ajuste no escopo de implantação e prazo de 45 dias.', 'Interesse alto; decisor participará da próxima conversa.', 'Comparando com outra solução; sensível a preço.'];
  people.forEach(p => {
    const n = int(1, 5);
    for (let k = 0; k < n; k++) {
      const t = pick(ACT);
      const d = deals.find(x => x.personId === p.id && x.status === 'open');
      activities.push({ id: id('ac'), type: t, title: pick(TITLES[t]), body: pick(BODIES), at: ago(int(0, 80)), userId: p.ownerId, refs: { personId: p.id, companyId: p.companyId, dealId: r() < 0.5 ? d?.id : undefined } });
    }
  });
  companies.forEach(co => {
    activities.push({ id: id('ac'), type: 'note', title: 'Conta criada no CRM', body: `Origem: ${co.source}`, at: co.createdAt, userId: co.ownerId, refs: { companyId: co.id } });
    activities.push({ id: id('ac'), type: 'meeting', title: 'Reunião geral com a empresa', body: pick(BODIES), at: ago(int(1, 60)), userId: co.ownerId, refs: { companyId: co.id } });
  });
  deals.filter(d => d.status === 'open').forEach(d => {
    activities.push({ id: id('ac'), type: 'deal', title: 'Oportunidade criada', body: `${d.product} · valor inicial`, at: d.openedAt, userId: d.ownerId, refs: { dealId: d.id, personId: d.personId, companyId: d.companyId } });
    activities.push({ id: id('ac'), type: 'status', title: `Movida para ${mainPipe.stages.concat(pipelines[1].stages).find(s => s.id === d.stageId)?.name}`, at: d.stageEnteredAt, userId: d.ownerId, refs: { dealId: d.id, companyId: d.companyId, personId: d.personId } });
  });
  leads.forEach(l => {
    activities.push({ id: id('ac'), type: 'system', title: 'Lead capturado', body: `Origem: ${l.source}${l.campaign && l.campaign !== '—' ? ` · Campanha: ${l.campaign}` : ''}`, at: l.createdAt, userId: l.ownerId, refs: { leadId: l.id } });
    if (l.lastContactAt) activities.push({ id: id('ac'), type: pick(['call', 'email', 'whatsapp'] as ActivityType[]), title: 'Primeiro contato', body: pick(BODIES), at: l.lastContactAt, userId: l.ownerId, refs: { leadId: l.id } });
  });

  /* ---------- Tasks ---------- */
  const TT: [TaskType, string][] = [['ligacao', 'Ligar para'], ['followup', 'Follow-up com'], ['email', 'Enviar proposta revisada para'], ['tarefa', 'Preparar apresentação para'], ['reuniao', 'Confirmar reunião com'], ['visita', 'Visita técnica em']];
  const tasks: Task[] = [];
  for (let k = 0; k < Math.round(40 * scale); k++) {
    const [type, verb] = pick(TT); const p = pick(people); const co = companies.find(c => c.id === p.companyId);
    const due = int(-6, 14); const done = due < -1 ? r() < 0.7 : r() < 0.2;
    tasks.push({ id: id('tk'), title: `${verb} ${co?.tradeName ?? p.name}`, type, due: ahead(due), done, doneAt: done ? ago(Math.max(0, -due)) : undefined, ownerId: p.ownerId, priority: pick(['baixa', 'media', 'alta'] as const), refs: { personId: p.id, companyId: p.companyId } });
  }

  /* ---------- Events ---------- */
  const ET: [EventType, string][] = [['reuniao', 'Reunião de diagnóstico'], ['demonstracao', 'Demonstração da plataforma'], ['ligacao', 'Call de alinhamento'], ['followup', 'Follow-up da proposta'], ['visita', 'Visita presencial'], ['evento', 'Webinar com clientes']];
  const events: CalEvent[] = [];
  for (let k = 0; k < Math.round(34 * scale); k++) {
    const [type, title] = pick(ET); const p = pick(people); const co = companies.find(c => c.id === p.companyId);
    const d = int(-10, 21); const h = int(8, 17);
    const start = new Date(NOW + d * DAY); start.setHours(h, pick([0, 30]), 0, 0);
    if (start.getDay() === 0) start.setDate(start.getDate() + 1);
    if (start.getDay() === 6) start.setDate(start.getDate() + 2);
    const end = new Date(start.getTime() + pick([30, 45, 60, 90]) * 60000);
    const deal = deals.find(x => x.personId === p.id && x.status === 'open');
    events.push({ id: id('ev'), title: `${title} · ${co?.tradeName ?? p.name}`, type, start: start.toISOString(), end: end.toISOString(), participants: [p.ownerId], ownerId: p.ownerId, refs: { personId: p.id, companyId: p.companyId, dealId: deal?.id }, reminderMin: 15, location: type === 'visita' ? `${co?.address ?? 'Endereço do cliente'}` : 'Google Meet (link gerado após integração)', done: d < 0 });
  }

  /* ---------- Conversations ---------- */
  const CH: Channel[] = ['email', 'whatsapp', 'whatsapp', 'telefone', 'chat', 'instagram', 'sms'];
  const THREADS = [
    { s: 'Dúvida sobre prazo de implantação', m: ['Olá! Qual seria o prazo de implantação para 25 usuários?', 'Oi! Para 25 usuários o prazo médio é de 15 dias úteis. Posso agendar uma call?', 'Perfeito, pode ser quinta às 10h?'], sent: 'positivo' as const },
    { s: 'Solicitação de 2ª via de boleto', m: ['Bom dia, preciso da segunda via do boleto deste mês.', 'Bom dia! Já solicitei ao financeiro, envio em instantes.'], sent: 'neutro' as const },
    { s: 'Reclamação: lentidão no relatório', m: ['O relatório mensal está demorando muito para carregar, isso atrapalha nossa reunião.', 'Sentimos muito! Vamos verificar agora mesmo.', 'Ainda está lento, precisamos de uma solução hoje.'], sent: 'negativo' as const },
    { s: 'Interesse no plano Enterprise', m: ['Vi a apresentação e gostaria de entender o plano Enterprise.', 'Que ótimo! Posso te enviar a proposta com os módulos?'], sent: 'positivo' as const },
    { s: 'Ajuste no contrato', m: ['Podemos alterar a data de vencimento para dia 15?', 'Vou verificar com o jurídico e retorno.'], sent: 'neutro' as const },
  ];
  const conversations: Conversation[] = [];
  for (let k = 0; k < Math.round(18 * scale); k++) {
    const th = THREADS[k % THREADS.length]; const p = people[(k * 3) % people.length];
    const base = int(0, 12);
    conversations.push({
      id: id('cv'), channel: CH[k % CH.length], personId: p.id, companyId: p.companyId, subject: th.s,
      status: k < 7 ? 'aberta' : k < 12 ? 'pendente' : 'resolvida', assigneeId: k % 3 === 0 ? 'u_ana' : p.ownerId, tags: k % 4 === 0 ? ['Urgente'] : [],
      sentiment: th.sent, unread: k < 6 ? int(1, 3) : 0, remindAt: k === 1 ? ahead(1) : undefined,
      messages: th.m.map((body, i) => ({ id: id('ms'), from: i % 2 === 0 ? 'contact' : 'user', userId: i % 2 ? p.ownerId : undefined, body, at: new Date(NOW - base * DAY - (th.m.length - i) * 3600000).toISOString() })),
    });
  }

  /* ---------- Proposals ---------- */
  const PS: ProposalStatus[] = ['rascunho', 'enviada', 'visualizada', 'negociacao', 'aceita', 'recusada', 'expirada'];
  const proposals: Proposal[] = [];
  const openDeals = deals.filter(d => d.status === 'open');
  for (let k = 0; k < Math.min(openDeals.length, Math.round(14 * scale)); k++) {
    const d = openDeals[k]; const status = PS[k % PS.length]; const created = int(2, 40);
    proposals.push({
      id: id('pr'), number: `PRO-${2026}-${String(100 + k).padStart(4, '0')}`, title: d.name, dealId: d.id, companyId: d.companyId, personId: d.personId, ownerId: d.ownerId,
      items: [
        { id: id('it'), description: d.product, qty: int(1, 3), price: Math.round(d.value * 0.7 / 100) * 100, discount: 0 },
        { id: id('it'), description: 'Implantação e treinamento', qty: 1, price: int(2, 8) * 1000, discount: pick([0, 5, 10]) },
      ],
      discount: pick([0, 3, 5]), tax: pick([0, 6, 9.25]), validUntil: status === 'expirada' ? ago(3) : ahead(int(5, 30)),
      paymentTerms: pick(['30 dias após assinatura', '3x sem juros', 'Mensal recorrente', '50% entrada + 50% na entrega']),
      notes: 'Valores válidos para contratação até a data de validade.', status, template: 'moderno', createdAt: ago(created),
      sentAt: status === 'rascunho' ? undefined : ago(Math.max(0, created - 1)), signedBy: status === 'aceita' ? people.find(p => p.id === d.personId)?.name : undefined,
    });
  }

  /* ---------- Automations ---------- */
  const autos: Automation[] = [
    { id: 'au1', name: 'Distribuir novos leads', description: 'Atribui ao vendedor disponível em rodízio.', active: true, trigger: { type: 'lead.created', params: {} }, conditions: [], actions: [{ type: 'assign_owner', params: { userId: '' } }, { type: 'create_task', params: { title: 'Primeiro contato com o lead', days: '1' } }], runs: 128, lastRunAt: ago(0), createdAt: ago(200) },
    { id: 'au2', name: 'Tarefa ao entrar em negociação', active: true, trigger: { type: 'deal.stage_changed', params: { stage: openStages[Math.min(5, openStages.length - 1)].id } }, conditions: [], actions: [{ type: 'create_task', params: { title: 'Preparar condições comerciais', days: '2' } }], runs: 42, lastRunAt: ago(2), createdAt: ago(180) },
    { id: 'au3', name: 'Lembrete: 3 dias sem resposta', active: true, trigger: { type: 'lead.no_response', params: { days: '3' } }, conditions: [{ field: 'status', op: 'neq', value: 'perdido' }], actions: [{ type: 'create_task', params: { title: 'Retomar contato (sem resposta)', days: '0' } }, { type: 'add_tag', params: { tag: 'Reativação' } }], runs: 87, lastRunAt: ago(1), createdAt: ago(150) },
    { id: 'au4', name: 'Boas-vindas ao ganhar venda', active: true, trigger: { type: 'deal.won', params: {} }, conditions: [], actions: [{ type: 'send_email', params: { subject: 'Bem-vindo(a)! Próximos passos da implantação' } }, { type: 'notify', params: { message: 'Venda ganha! Inicie o onboarding do cliente.' } }], runs: 36, lastRunAt: ago(3), createdAt: ago(140) },
    { id: 'au5', name: 'Follow-up de proposta', active: true, trigger: { type: 'proposal.sent', params: {} }, conditions: [], actions: [{ type: 'create_event', params: { title: 'Follow-up da proposta', days: '3' } }], runs: 25, lastRunAt: ago(5), createdAt: ago(120) },
    { id: 'au6', name: 'Reativar clientes inativos', active: false, trigger: { type: 'customer.inactive', params: { days: '30' } }, conditions: [], actions: [{ type: 'create_task', params: { title: 'Contato de reativação', days: '2' } }], runs: 9, lastRunAt: ago(20), createdAt: ago(100) },
    { id: 'au7', name: 'Alertar gestor: grande negócio', active: true, trigger: { type: 'deal.value_above', params: { amount: '80000' } }, conditions: [], actions: [{ type: 'notify', params: { message: 'Oportunidade acima de R$ 80 mil criada.' } }, { type: 'approval', params: { userId: 'u_camila' } }], runs: 6, lastRunAt: ago(8), createdAt: ago(90) },
  ];

  /* ---------- Goals ---------- */
  const mk = monthKey(new Date());
  const goals: Goal[] = [
    { id: 'g_co', scope: 'company', metric: 'revenue', period: mk, target: Math.round(420000 * scale) },
    { id: 'g_t1', scope: 'team', targetId: 'team_ent', metric: 'revenue', period: mk, target: Math.round(260000 * scale) },
    { id: 'g_t2', scope: 'team', targetId: 'team_smb', metric: 'revenue', period: mk, target: Math.round(160000 * scale) },
    { id: 'g_dep', scope: 'department', targetId: 'Comercial', metric: 'wonDeals', period: mk, target: 14 },
    ...sellers.map((s, i) => ({ id: `g_${s.id}`, scope: 'user' as const, targetId: s.id, metric: 'revenue' as const, period: mk, target: [90000, 80000, 70000, 60000, 55000, 50000][i % 6] })),
    ...sellers.map(s => ({ id: `gm_${s.id}`, scope: 'user' as const, targetId: s.id, metric: 'meetings' as const, period: mk, target: 12 })),
  ];

  const audit: AuditEntry[] = [
    { id: id('au'), at: ago(0, 9), userId: 'u_rafael', action: 'update', entity: 'Configurações', detail: 'Alterou regra de distribuição para rodízio' },
    { id: id('au'), at: ago(1, 14), userId: 'u_camila', action: 'create', entity: 'Meta', detail: 'Criou meta mensal da equipe Enterprise' },
    { id: id('au'), at: ago(2, 11), userId: 'u_marina', action: 'invite', entity: 'Usuário', detail: 'Convidou Sofia Ramos como Vendedora' },
    { id: id('au'), at: ago(3, 16), userId: 'u_lucas', action: 'export', entity: 'Leads', detail: 'Exportou 32 leads para CSV' },
  ];
  const notifications: Notification[] = [
    { id: id('nt'), at: ago(0, 10), title: '3 oportunidades paradas há mais de 14 dias', read: false, link: '/pipeline', kind: 'warning' },
    { id: id('nt'), at: ago(0, 8), title: 'Proposta visualizada pelo cliente', body: proposals[2]?.title, read: false, link: '/proposals', kind: 'info' },
    { id: id('nt'), at: ago(1, 15), title: 'Venda ganha 🎉', body: 'Júlia Martins fechou um novo contrato.', read: true, link: '/opportunities', kind: 'success' },
  ];
  const sessions: Session[] = [
    { id: 's1', userId: 'u_marina', device: 'Chrome · Windows', location: 'São Paulo, SP', startedAt: ago(0, 8), current: true },
    { id: 's2', userId: 'u_marina', device: 'Safari · iPhone', location: 'São Paulo, SP', startedAt: ago(2, 19) },
    { id: 's3', userId: 'u_lucas', device: 'Edge · Windows', location: 'Campinas, SP', startedAt: ago(0, 9) },
    { id: 's4', userId: 'u_camila', device: 'Chrome · macOS', location: 'Curitiba, PR', startedAt: ago(1, 13) },
  ];

  const dashboards = defaultDashboards();
  return {
    org: {
      name: opt.orgName, productName: 'NEXA CRM', segment: opt.segment, usersEstimate: '11-50', objective: 'Aumentar a conversão do funil',
      currency: 'BRL', locale: 'pt-BR', timezone: 'America/Sao_Paulo', onboarded: true, template: opt.template, distribution: 'round_robin',
      leadStatuses: [], lostReasons: LOST, categories: ['Cliente', 'Prospect', 'Parceiro', 'Fornecedor'], sources: tpl.sources, products: tpl.products,
      privacyPolicy: 'Os dados pessoais são tratados conforme a LGPD (Lei 13.709/2018), apenas para fins comerciais legítimos, com possibilidade de exclusão mediante solicitação do titular.',
      notifications: { email: true, push: true, staleDeals: true, dailyDigest: false },
      checklist: { company: true, pipeline: true, users: true, import: false, automation: true, integrations: false },
    },
    users, teams, tags, customFields: [
      { id: 'cf1', entity: 'lead', label: 'Nº de funcionários', type: 'number' },
      { id: 'cf2', entity: 'company', label: 'ERP utilizado', type: 'select', options: ['SAP', 'TOTVS', 'Omie', 'Outro'] },
    ],
    leads, people, companies, pipelines, deals, activities, tasks, events, conversations, proposals,
    automations: autos, automationRuns: [], goals, audit, notifications, savedFilters: [
      { id: 'sf1', entity: 'leads', name: 'Quentes sem contato', query: { temperature: 'quente', noContactDays: 7 } },
    ], sessions, dashboards, activeDashboardId: dashboards[0].id,
    presets: deepClone(BUILTIN_PRESETS), appearance: deepClone(DEFAULT_APPEARANCE), quickNotes: 'Revisar forecast com a Camila na sexta.\nLigar para a Lumen sobre renovação.', dismissedDuplicates: [],
  };
}

/** A completely empty organization: configuration only, no records and no users. */
export function blankTenant(orgName: string, template: string): TenantData {
  const t = generateTenant({ orgName: orgName || 'Minha empresa', seed: 7, template, scale: 0.3, segment: '' });
  return {
    ...t, users: [], teams: [{ id: 'team_main', name: 'Comercial', department: 'Comercial' }],
    tags: [], customFields: [], leads: [], people: [], companies: [], deals: [], activities: [], tasks: [], events: [], conversations: [], proposals: [],
    automations: [], automationRuns: [], audit: [], notifications: [], sessions: [], goals: [], savedFilters: [], quickNotes: '', dismissedDuplicates: [],
    pipelines: [buildPipeline('pipe_main', 'Vendas', template)],
    org: { ...t.org, name: orgName, segment: '', objective: '', usersEstimate: '1-10', onboarded: false, checklist: { company: false, pipeline: false, users: false, import: false, automation: false, integrations: false } },
  };
}
