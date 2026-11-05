# NEXA CRM

CRM SaaS multiempresa, plug and play, com design **liquid glass** sobre a paleta
`#06141B · #11212D · #253745 · #4A5C6A · #9BA8AB · #CCD0CF`.

**Demo:** https://gabriel10232.github.io/nexa-crm/

> Ambiente de demonstração: dados 100% fictícios (e-mails no domínio reservado `.example`).
> Use o acesso rápido por perfil na tela de login ou qualquer e-mail de usuário demo com a senha `demo123`.

## O que tem

| Área | Destaques |
|---|---|
| Autenticação | Login simulado, perfis de demonstração, troca de organização, "Ver como" para testar permissões |
| Onboarding | Empresa, segmento, modelo de operação (B2B, Imobiliária, Agência, Clínica, Consultoria, Serviços), moeda, fuso, logo, identidade visual, importação CSV, checklist |
| Dashboard modular | Arrastar e soltar, redimensionar pelas bordas, adicionar/ocultar/duplicar/bloquear widgets, desfazer/refazer, salvamento automático, múltiplos layouts por perfil, widgets obrigatórios, visibilidade por dispositivo, indicador personalizado, filtros e comparação de período, exportação CSV/PDF |
| Personalizar aparência | Cores por tema, glassmorphism (transparência, blur, saturação, bordas, sombras, brilho, reflexo, sidebar/topbar/modais/widgets), tipografia, espaçamento, densidade, 9 presets, presets próprios, importar/exportar, acessibilidade (reduzir animações, desativar glass, alto contraste, modo leve automático) |
| Leads | Lista/cards, busca global, filtros avançados e salvos, colunas configuráveis, ações em massa, importação CSV, formulário de captura, distribuição automática, detecção e mescla de duplicados, conversão (pessoa, empresa, pessoa vinculada, cliente, oportunidade), arquivar/restaurar, exclusão definitiva com confirmação digitada, clonar, reabrir, motivo de perda |
| Pessoas e empresas | Entidades separadas, pessoas físicas independentes, pessoas vinculadas, várias pessoas por empresa, transferência entre empresas com histórico preservado, timeline que indica exatamente com quem foi a interação |
| Pipeline | Kanban com drag and drop, lista e tabela, múltiplos pipelines e etapas personalizadas, edição de valor no card, previsão ponderada, alerta de oportunidade parada, motivo obrigatório ao perder |
| Tarefas e agenda | Dia, semana, mês e lista; participantes, lembretes, reagendamento, vínculo com cliente e oportunidade |
| Inbox omnichannel | E-mail, WhatsApp, telefone, SMS, chat, Instagram (envio simulado), notas internas, respostas rápidas, templates, sentimento, distribuição, lembretes |
| Propostas | Itens, descontos, impostos, validade, condições, status, pré-visualização e impressão/PDF |
| Automações | Construtor visual Gatilho → Condição → Ação, teste em sandbox, histórico de execuções, verificações agendadas |
| NEXA Copilot | Assistente simulado (sem IA conectada) que responde a partir dos dados do CRM |
| Relatórios | 12 relatórios com filtros, comparação, CSV, PDF, agendamento e compartilhamento |
| Metas, equipe, configurações | Metas por vendedor/equipe/departamento/empresa, 8 perfis de acesso, convites, sessões, auditoria, campos personalizados, tags, listas, white-label, integrações |

## Arquitetura

```
src/
  types/            Modelo de domínio (Company ≠ Person ≠ Lead ≠ Deal)
  config/           Permissões, rótulos, presets de aparência, widgets, templates de operação
  data/seed.ts      Gerador determinístico de dados demo (2 organizações)
  store/            Store externo (useSyncExternalStore) + UI store (toasts, confirmações)
  services/
    storage.ts      StorageAdapter (LocalStorage hoje; troque por REST/Supabase)
    auth.ts         AuthService simulado (mesmo contrato de Auth0/Clerk/Supabase Auth)
    crm.ts          Toda escrita passa aqui: auditoria, timeline e automações consistentes
    automation.ts   Engine de automações
    metrics.ts      KPIs, séries, funil, metas, escopo de dados por equipe
    copilot.ts      Copilot simulado
    integrations.ts Registro honesto de integrações (nenhuma conectada)
  components/       Design system (ui, charts, RecordList, forms, detail)
  layout/           Shell, sidebar, topbar, busca global (Ctrl K)
  modules/          Uma pasta por área do produto, carregada sob demanda
  styles/app.css    Tokens CSS + material glass
```

### Levando para produção

1. **Banco de dados:** implemente `StorageAdapter` (ou troque `updateTenant` em `services/crm.ts` por chamadas de API). As coleções de `TenantData` mapeiam 1:1 para tabelas, com `orgId` para isolamento multiempresa.
2. **Autenticação:** substitua o corpo de `signIn`/`signOut`/`startSession` em `services/auth.ts`; `useSession()` continua igual para a interface.
3. **Integrações:** cada item em `services/integrations.ts` indica a variável de ambiente esperada. Ações de e-mail, WhatsApp e webhook passam por `simulateOutbound`, que é o ponto de troca.
4. **IA:** troque `ask()` em `services/copilot.ts` por uma chamada ao seu backend com o modelo de sua escolha.

## Rodando localmente

```bash
npm install
npm run dev        # http://localhost:5173/nexa-crm/
npm run build      # typecheck + build de produção
```

O deploy no GitHub Pages é feito pelo workflow `.github/workflows/deploy.yml` a cada push na `main`.
