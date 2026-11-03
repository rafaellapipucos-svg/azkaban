# Quadro de tarefas

Status: a fazer, em andamento, bloqueado, em revisão, feito. Handoffs em [handoffs/](handoffs/).

## Fase 0: Fundação

| ID   | Título                                                    | Agente       | Status | Depende de | Branch                   | Handoff |
| ---- | --------------------------------------------------------- | ------------ | ------ | ---------- | ------------------------ | ------- |
| F0-1 | Documentação base, agentes, ADRs e quadro                 | orquestrador | feito  | —          | chore/phase-0-foundation | —       |
| F0-2 | Scaffold do monorepo, config, i18n, tokens e tela inicial | orquestrador | feito  | F0-1       | chore/phase-0-foundation | —       |
| F0-3 | Lint, fronteiras, hooks, CI e Supabase local              | orquestrador | feito  | F0-2       | chore/phase-0-foundation | —       |

## Fase 1: Contas e grupos

| ID   | Título                                                                                  | Agente             | Status | Depende de | Branch                | Handoff |
| ---- | --------------------------------------------------------------------------------------- | ------------------ | ------ | ---------- | --------------------- | ------- |
| F1-1 | Contratos de perfil, grupo, papel e contexto                                            | arquiteto          | feito  | F0         | feat/phase-1-accounts | —       |
| F1-2 | Migrations de profiles, groups, members, invites, permissões, areas e contexts, com RLS | banco-de-dados     | feito  | F1-1       | feat/phase-1-accounts | —       |
| F1-3 | Testes de RLS de grupos e seeds de áreas e permissões                                   | banco-de-dados     | feito  | F1-2       | feat/phase-1-accounts | —       |
| F1-4 | Tema claro e escuro, componentes base, conceito de mascote, /design-system              | design-system      | feito  | F1-1       | feat/phase-1-accounts | —       |
| F1-5 | Login por e-mail, senha e link mágico; perfil                                           | auth-grupos        | feito  | F1-2, F1-4 | feat/phase-1-accounts | —       |
| F1-6 | Grupos, convites por link, código e QR, papéis, posse                                   | auth-grupos        | feito  | F1-5       | feat/phase-1-accounts | —       |
| F1-7 | `can()` em core e teste de espelho com o banco                                          | auth-grupos        | feito  | F1-2       | feat/phase-1-accounts | —       |
| F1-8 | Áreas e contextos: abas, sub-abas e cadastro                                            | tarefas-calendario | feito  | F1-6       | feat/phase-1-accounts | —       |
| F1-9 | Onboarding com boas-vindas e login                                                      | auth-grupos        | feito  | F1-5       | feat/phase-1-accounts | —       |

## Fase 2: Tarefas e calendário

| ID    | Título                                                                  | Agente             | Status | Depende de | Branch                 | Handoff                                                             |
| ----- | ----------------------------------------------------------------------- | ------------------ | ------ | ---------- | ---------------------- | ------------------------------------------------------------------- |
| F2-1  | Contratos de tarefa, ocorrência e estado                                | arquiteto          | feito  | F1         | feat/tasks-contracts   | —                                                                   |
| F2-2  | Migrations de tasks, occurrences, history e xp_events, com RLS e testes | banco-de-dados     | feito  | F2-1       | feat/tasks-db          | 20261101-0935-arquiteto-para-banco-de-dados-tarefas.md              |
| F2-3  | Máquina de estados em core                                              | tarefas-calendario | feito  | F2-1       | feat/tasks-core        | 20261101-0935-arquiteto-para-tarefas-calendario-tarefas.md          |
| F2-4  | Recorrência: RRULE, EXDATE e fuso em core                               | tarefas-calendario | feito  | F2-1       | feat/tasks-core        | 20261101-0935-arquiteto-para-tarefas-calendario-tarefas.md          |
| F2-5  | Job de materialização de ocorrências                                    | backend-funcoes    | feito  | F2-2, F2-4 | feat/tasks-materialize | 20261101-1006-banco-de-dados-para-backend-funcoes-materializacao.md |
| F2-6  | Criar, editar, duplicar, reagendar e excluir tarefa, com criação rápida | tarefas-calendario | feito  | F2-3       | feat/tasks-screens     | —                                                                   |
| F2-7  | Editor de recorrência: só esta, esta e próximas, todas                  | tarefas-calendario | feito  | F2-4, F2-6 | feat/tasks-screens     | —                                                                   |
| F2-8  | Tela Hoje e abas Trabalho e Doméstico com sub-abas                      | tarefas-calendario | feito  | F2-6       | feat/tasks-screens     | —                                                                   |
| F2-9  | Calendário: mês, semana, dia, filtros, dia perfeito                     | tarefas-calendario | feito  | F2-6       | feat/tasks-calendar    | —                                                                   |
| F2-10 | Visão Equipe                                                            | tarefas-calendario | feito  | F2-8       | feat/tasks-calendar    | —                                                                   |
| F2-11 | ADR de concluído atrasado                                               | arquiteto          | feito  | F2-1       | feat/tasks-contracts   | —                                                                   |
| F2-12 | Cálculo de XP para a tela; a gravação é do banco, em F2-2               | tarefas-calendario | feito  | F2-3       | feat/tasks-screens     | —                                                                   |

## Fase 3: Prova por foto

| ID   | Título                                                                                                                     | Agente             | Status | Depende de | Branch                     | Handoff                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ | ---------- | -------------------------- | ------------------------------------------------------------------------------ |
| F3-1 | ADR de prova por foto e limitações                                                                                         | arquiteto          | feito  | F2         | feat/proof-contracts       | —                                                                              |
| F3-2 | Migrations de proof_challenges e task_proofs, bucket privado imutável, trigger que bloqueia verde sem prova, testes de RLS | banco-de-dados     | feito  | F3-1       | feat/proof-db              | 20261101-1708-arquiteto-para-banco-de-dados-prova-por-foto.md                  |
| F3-3 | Edge Functions `proof-validate` e `proof-url`; o desafio vem da RPC de F3-2                                                | backend-funcoes    | feito  | F3-2       | feat/proof-functions       | 20261101-1803-banco-de-dados-para-backend-funcoes-prova-por-foto.md            |
| F3-4 | Adapter de câmera web e nativo, geolocalização opcional                                                                    | prova-foto         | feito  | F3-1       | feat/proof-camera          | 20261101-1708-arquiteto-para-prova-foto-prova-por-foto.md                      |
| F3-5 | Fluxo de captura, marca d'água, hash, compressão e upload                                                                  | prova-foto         | feito  | F3-3, F3-4 | feat/proof-capture         | 20261101-1959-tarefas-calendario-para-prova-foto-ponto-de-entrada-da-camera.md |
| F3-6 | Revisão do admin e sub-estado em análise                                                                                   | prova-foto         | feito  | F3-5       | feat/proof-capture         | —                                                                              |
| F3-7 | Retenção das fotos                                                                                                         | backend-funcoes    | feito  | F3-2       | feat/proof-functions       | 20261101-1803-banco-de-dados-para-backend-funcoes-prova-por-foto.md            |
| F3-8 | Dados e telas: prova e atraso nas listas, tarefas e calendário                                                             | tarefas-calendario | feito  | F3-2       | fix/proof-task-rules-final | 20261101-1708-arquiteto-para-tarefas-calendario-prova-e-atraso.md              |
| F3-9 | Selo "em análise" nos componentes                                                                                          | design-system      | feito  | F3-1       | feat/proof-ui              | 20261101-1708-arquiteto-para-design-system-em-analise.md                       |

## Fase 4: Notificações

| ID   | Título                                                                                                     | Agente                | Status | Depende de | Branch                        | Handoff                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------- | ------ | ---------- | ----------------------------- | ------------------------------------------------------------------------------- |
| F4-1 | Migrations de preferências, push_subscriptions e outbox                                                    | banco-de-dados        | feito  | F2         | fix/notifications-db-security | —                                                                               |
| F4-2 | `dispatch-notifications` com pg_cron, idempotência e backoff                                               | backend-funcoes       | feito  | F4-1       | feat/notifications-dispatch   | —                                                                               |
| F4-3 | Canal in-app com Realtime e sino                                                                           | notificacoes-whatsapp | feito  | F4-1       | feat/notifications-ui         | —                                                                               |
| F4-4 | Web Push, PWA e service worker, com explicação para iPhone                                                 | notificacoes-whatsapp | feito  | F4-2       | feat/notifications-ui         | —                                                                               |
| F4-5 | Tela de preferências e horário de silêncio                                                                 | notificacoes-whatsapp | feito  | F4-1       | feat/notifications-ui         | —                                                                               |
| F4-6 | Job de vermelho automático                                                                                 | banco-de-dados        | feito  | F2-3       | feat/notifications-db         | —                                                                               |
| F4-7 | Avisos ao admin                                                                                            | notificacoes-whatsapp | feito  | F4-2       | feat/notifications-ui         | —                                                                               |
| F4-8 | Devolver `failed` e `deferred` da materialização ao cliente e criar `taskDefaults.materializationPastDays` | backend-funcoes       | feito  | F2         | feat/notifications-dispatch   | 20261101-1604-backend-funcoes-para-arquiteto-limite-de-cpu-da-materializacao.md |
| F4-9 | PWA, manifest, `theme-color` e título por tela, com marcos de página                                       | notificacoes-whatsapp | feito  | F4-4       | feat/notifications-shell      | 20261101-1509-tarefas-calendario-para-arquiteto-casca-do-app-resolvida.md       |

## Fase 5: WhatsApp

O provedor real (Meta) fica para o humano decidir (ADR-0009, seções 10 e 16); a fase usa o `ConsoleProvider`.

| ID   | Título                                                                                             | Agente                                                 | Status | Depende de       | Branch                                                        | Handoff                                                                            |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------ | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| F5-1 | ADR-0009, contratos e config do WhatsApp (verificação, opt-in, resumo, custos)                     | arquiteto                                              | feito  | F4               | docs/whatsapp-adr, docs/whatsapp-deploy                       | 20261103-0030-arquiteto-para-*-whatsapp.md                                         |
| F5-2 | Verificação de telefone e opt-in: telas e dados                                                    | notificacoes-whatsapp                                  | feito  | F5-1, F5-7       | feat/whatsapp-screens, fix/whatsapp-client-security           | 20261103-0135-banco-de-dados-para-notificacoes-whatsapp-rpcs-e-colunas.md          |
| F5-3 | Montagem do resumo diário em core, com testes                                                      | notificacoes-whatsapp                                  | feito  | F5-1             | feat/whatsapp-core                                            | 20261103-0030-arquiteto-para-notificacoes-whatsapp-whatsapp.md                     |
| F5-4 | `WhatsAppProvider`, `ConsoleProvider` e `MetaCloudProvider`                                        | backend-funcoes                                        | feito  | F5-1             | feat/whatsapp-providers                                       | 20261103-0030-arquiteto-para-backend-funcoes-whatsapp.md                           |
| F5-5 | Resumo diário: job SQL `enqueue_daily_summaries` (banco) e `WhatsAppChannel` no despacho (funções) | banco-de-dados, backend-funcoes                        | feito  | F5-3, F5-4, F5-7 | feat/whatsapp-db, feat/whatsapp-functions                     | 20261103-0135-banco-de-dados-para-backend-funcoes-rpcs-whatsapp.md                 |
| F5-6 | `whatsapp-webhook` (status e PARAR) e `phone-verification`                                         | backend-funcoes                                        | feito  | F5-4, F5-7       | feat/whatsapp-functions, chore/functions-stack-from-config    | 20261103-0206-arquiteto-para-backend-funcoes-seguranca-whatsapp.md                 |
| F5-7 | Migrations do WhatsApp: perfil, verificação, opt-in, mensagens, claim, retenção, RLS               | banco-de-dados                                         | feito  | F5-1             | feat/whatsapp-db, fix/whatsapp-db-security                    | 20261103-0030-arquiteto-para-banco-de-dados-whatsapp.md                            |
| F5-8 | Prazo do vermelho automático no push (handoff 1451)                                                | banco-de-dados, backend-funcoes, notificacoes-whatsapp | feito  | F5-1             | feat/whatsapp-db, feat/whatsapp-functions, feat/whatsapp-core | 20261102-1451-notificacoes-whatsapp-para-arquiteto-banco-de-dados-prazo-no-push.md |
| F5-9 | QA e revisão de segurança da fase (QA5-1 a QA5-4, SEG5-1 a SEG5-8)                                 | qa-testes, revisor-seguranca                           | feito  | F5-2 a F5-8      | chore/qa-phase-5, chore/security-phase-5                      | 20261103-0158-revisor-seguranca-para-*-whatsapp.md                                 |

## Fase 6: Gamificação

| ID   | Título                                         | Agente         | Status  | Depende de | Branch | Handoff |
| ---- | ---------------------------------------------- | -------------- | ------- | ---------- | ------ | ------- |
| F6-1 | Motor de XP, níveis e ofensiva em core         | gamificacao    | a fazer | F2-12      | —      | —       |
| F6-2 | Migrations e seeds de user_stats e conquistas  | banco-de-dados | a fazer | F6-1       | —      | —       |
| F6-3 | Anel de meta, telas de progresso e conquistas  | gamificacao    | a fazer | F6-2       | —      | —       |
| F6-4 | Comemorações: mascote, confete, som e vibração | gamificacao    | a fazer | F6-3       | —      | —       |
| F6-5 | Ranking opcional por grupo                     | gamificacao    | a fazer | F6-3       | —      | —       |

## Fase 7: Lista de compras

| ID   | Título                                                                                                  | Agente                                                               | Status  | Depende de  | Branch                                                                        | Handoff                                                             |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------- | ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| F7-1 | ADR-0011, contratos, config e seed do catálogo; migrations, RLS, RPCs e Realtime; permissões no cliente | arquiteto, banco-de-dados, auth-grupos                               | feito   | F1          | docs/shopping-adr, feat/shopping-db, feat/shopping-permissions                | 20261103-0230-arquiteto-para-*-compras.md                           |
| F7-2 | Montar lista com stepper, busca, item avulso, nota e catálogo do grupo                                  | compras                                                              | feito   | F7-1        | feat/shopping-core-ui, feat/shopping-live, fix/shopping-qa7                   | 20261103-0254-banco-de-dados-para-compras-compras.md                |
| F7-3 | Modo no mercado com tempo real                                                                          | compras                                                              | feito   | F7-2        | feat/shopping-live                                                            | —                                                                   |
| F7-4 | Finalizar, histórico, nova lista, renomear, excluir e compartilhar                                      | compras                                                              | feito   | F7-3        | feat/shopping-live, fix/shopping-qa7                                          | —                                                                   |
| F7-5 | Vincular a tarefa e XP de compra                                                                        | compras, banco-de-dados                                              | a fazer | F7-3, F6-2  | —                                                                             | ADR-0011, seções 8, 9 e 16; entra depois de integrar as Fases 6 e 7 |
| F7-6 | QA e revisão de segurança da fase (QA7-1 a QA7-4, SEG7-1 a SEG7-6), barra de seis abas                  | qa-testes, revisor-seguranca, design-system, compras, banco-de-dados | feito   | F7-1 a F7-4 | chore/qa-phase-7, chore/security-phase-7, fix/shopping-*, fix/tabbar-six-tabs | 20261103-0321-revisor-seguranca-para-*-compras.md                   |

## Fase 8: Polimento

| ID   | Título                                                               | Agente                | Status  | Depende de         | Branch | Handoff |
| ---- | -------------------------------------------------------------------- | --------------------- | ------- | ------------------ | ------ | ------- |
| F8-1 | Revisão de acessibilidade e reduzir movimento                        | qa-testes             | a fazer | F7                 | —      | —       |
| F8-2 | E2E: login, tarefa, foto e resumo com mock                           | qa-testes             | a fazer | F5                 | —      | —       |
| F8-3 | LGPD: exportar dados, excluir conta, transparência para funcionários | auth-grupos           | a fazer | F5                 | —      | —       |
| F8-4 | Rate limiting em OTP e convites; desafios ficam em F3-2              | backend-funcoes       | a fazer | F5                 | —      | —       |
| F8-5 | Fila offline simples                                                 | tarefas-calendario    | a fazer | F2                 | —      | —       |
| F8-6 | Performance e animações                                              | design-system         | a fazer | F7                 | —      | —       |
| F8-7 | EAS, ícones, splash, deep links e push nativo                        | notificacoes-whatsapp | a fazer | F7                 | —      | —       |
| F8-8 | ADR e configuração de hospedagem web                                 | arquiteto             | a fazer | resposta do humano | —      | —       |
