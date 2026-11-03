# Quadro de tarefas

Status: a fazer, em andamento, bloqueado, em revisão, feito. Handoffs em [handoffs/](handoffs/).

## Fase 0: Fundação

| ID   | Título                                                    | Agente       | Status     | Depende de | Branch                   | Handoff |
| ---- | --------------------------------------------------------- | ------------ | ---------- | ---------- | ------------------------ | ------- |
| F0-1 | Documentação base, agentes, ADRs e quadro                 | orquestrador | em revisão | —          | chore/phase-0-foundation | —       |
| F0-2 | Scaffold do monorepo, config, i18n, tokens e tela inicial | orquestrador | em revisão | F0-1       | chore/phase-0-foundation | —       |
| F0-3 | Lint, fronteiras, hooks, CI e Supabase local              | orquestrador | em revisão | F0-2       | chore/phase-0-foundation | —       |

## Fase 1: Contas e grupos

| ID   | Título                                                                                  | Agente             | Status  | Depende de | Branch | Handoff |
| ---- | --------------------------------------------------------------------------------------- | ------------------ | ------- | ---------- | ------ | ------- |
| F1-1 | Contratos de perfil, grupo, papel e contexto                                            | arquiteto          | a fazer | F0         | —      | —       |
| F1-2 | Migrations de profiles, groups, members, invites, permissões, areas e contexts, com RLS | banco-de-dados     | a fazer | F1-1       | —      | —       |
| F1-3 | Testes de RLS de grupos e seeds de áreas e permissões                                   | banco-de-dados     | a fazer | F1-2       | —      | —       |
| F1-4 | Tema claro e escuro, componentes base, conceito de mascote, /design-system              | design-system      | a fazer | F1-1       | —      | —       |
| F1-5 | Login por e-mail, senha e link mágico; perfil                                           | auth-grupos        | a fazer | F1-2, F1-4 | —      | —       |
| F1-6 | Grupos, convites por link, código e QR, papéis, posse                                   | auth-grupos        | a fazer | F1-5       | —      | —       |
| F1-7 | `can()` em core e teste de espelho com o banco                                          | auth-grupos        | a fazer | F1-2       | —      | —       |
| F1-8 | Áreas e contextos: abas, sub-abas e cadastro                                            | tarefas-calendario | a fazer | F1-6       | —      | —       |
| F1-9 | Onboarding com boas-vindas e login                                                      | auth-grupos        | a fazer | F1-5       | —      | —       |

## Fase 2: Tarefas e calendário

| ID    | Título                                                                  | Agente             | Status  | Depende de | Branch | Handoff |
| ----- | ----------------------------------------------------------------------- | ------------------ | ------- | ---------- | ------ | ------- |
| F2-1  | Contratos de tarefa, ocorrência e estado                                | arquiteto          | a fazer | F1         | —      | —       |
| F2-2  | Migrations de tasks, occurrences, history e xp_events, com RLS e testes | banco-de-dados     | a fazer | F2-1       | —      | —       |
| F2-3  | Máquina de estados em core                                              | tarefas-calendario | a fazer | F2-1       | —      | —       |
| F2-4  | Recorrência: RRULE, EXDATE e fuso em core                               | tarefas-calendario | a fazer | F2-1       | —      | —       |
| F2-5  | Job de materialização de ocorrências                                    | backend-funcoes    | a fazer | F2-2, F2-4 | —      | —       |
| F2-6  | Criar, editar, duplicar, reagendar e excluir tarefa, com criação rápida | tarefas-calendario | a fazer | F2-3       | —      | —       |
| F2-7  | Editor de recorrência: só esta, esta e próximas, todas                  | tarefas-calendario | a fazer | F2-4, F2-6 | —      | —       |
| F2-8  | Tela Hoje e abas Trabalho e Doméstico com sub-abas                      | tarefas-calendario | a fazer | F2-6       | —      | —       |
| F2-9  | Calendário: mês, semana, dia, filtros, dia perfeito                     | tarefas-calendario | a fazer | F2-6       | —      | —       |
| F2-10 | Visão Equipe                                                            | tarefas-calendario | a fazer | F2-8       | —      | —       |
| F2-11 | ADR de concluído atrasado                                               | arquiteto          | a fazer | F2-3       | —      | —       |
| F2-12 | Registrar eventos de XP nas transições                                  | tarefas-calendario | a fazer | F2-3       | —      | —       |

## Fase 3: Prova por foto

| ID   | Título                                                                                                                     | Agente          | Status  | Depende de | Branch | Handoff |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- | ---------- | ------ | ------- |
| F3-1 | ADR de prova por foto e limitações                                                                                         | arquiteto       | a fazer | F2         | —      | —       |
| F3-2 | Migrations de proof_challenges e task_proofs, bucket privado imutável, trigger que bloqueia verde sem prova, testes de RLS | banco-de-dados  | a fazer | F3-1       | —      | —       |
| F3-3 | Edge Function `proof-validate` e emissão de desafio                                                                        | backend-funcoes | a fazer | F3-2       | —      | —       |
| F3-4 | Adapter de câmera web e nativo, geolocalização opcional                                                                    | prova-foto      | a fazer | F3-1       | —      | —       |
| F3-5 | Fluxo de captura, marca d'água, hash, compressão e upload                                                                  | prova-foto      | a fazer | F3-3, F3-4 | —      | —       |
| F3-6 | Revisão do admin e sub-estado em análise                                                                                   | prova-foto      | a fazer | F3-5       | —      | —       |
| F3-7 | Retenção das fotos                                                                                                         | backend-funcoes | a fazer | F3-2       | —      | —       |

## Fase 4: Notificações

| ID   | Título                                                       | Agente                | Status  | Depende de | Branch | Handoff |
| ---- | ------------------------------------------------------------ | --------------------- | ------- | ---------- | ------ | ------- |
| F4-1 | Migrations de preferências, push_subscriptions e outbox      | banco-de-dados        | a fazer | F2         | —      | —       |
| F4-2 | `dispatch-notifications` com pg_cron, idempotência e backoff | backend-funcoes       | a fazer | F4-1       | —      | —       |
| F4-3 | Canal in-app com Realtime e sino                             | notificacoes-whatsapp | a fazer | F4-1       | —      | —       |
| F4-4 | Web Push, PWA e service worker, com explicação para iPhone   | notificacoes-whatsapp | a fazer | F4-2       | —      | —       |
| F4-5 | Tela de preferências e horário de silêncio                   | notificacoes-whatsapp | a fazer | F4-1       | —      | —       |
| F4-6 | Job de vermelho automático                                   | backend-funcoes       | a fazer | F2-3       | —      | —       |
| F4-7 | Avisos ao admin                                              | notificacoes-whatsapp | a fazer | F4-2       | —      | —       |

## Fase 5: WhatsApp

| ID   | Título                                                      | Agente                | Status  | Depende de | Branch | Handoff |
| ---- | ----------------------------------------------------------- | --------------------- | ------- | ---------- | ------ | ------- |
| F5-1 | ADR de provedor de WhatsApp e custos                        | arquiteto             | a fazer | F4         | —      | —       |
| F5-2 | Verificação de telefone e opt-in                            | notificacoes-whatsapp | a fazer | F5-1       | —      | —       |
| F5-3 | Montagem do resumo diário em core, com testes               | notificacoes-whatsapp | a fazer | F5-1       | —      | —       |
| F5-4 | `WhatsAppProvider`, `ConsoleProvider` e `MetaCloudProvider` | backend-funcoes       | a fazer | F5-1       | —      | —       |
| F5-5 | Job `daily-summary`                                         | backend-funcoes       | a fazer | F5-3, F5-4 | —      | —       |
| F5-6 | `whatsapp-webhook`: status e PARAR                          | backend-funcoes       | a fazer | F5-4       | —      | —       |

## Fase 6: Gamificação

| ID   | Título                                         | Agente         | Status  | Depende de | Branch | Handoff |
| ---- | ---------------------------------------------- | -------------- | ------- | ---------- | ------ | ------- |
| F6-1 | Motor de XP, níveis e ofensiva em core         | gamificacao    | a fazer | F2-12      | —      | —       |
| F6-2 | Migrations e seeds de user_stats e conquistas  | banco-de-dados | a fazer | F6-1       | —      | —       |
| F6-3 | Anel de meta, telas de progresso e conquistas  | gamificacao    | a fazer | F6-2       | —      | —       |
| F6-4 | Comemorações: mascote, confete, som e vibração | gamificacao    | a fazer | F6-3       | —      | —       |
| F6-5 | Ranking opcional por grupo                     | gamificacao    | a fazer | F6-3       | —      | —       |

## Fase 7: Lista de compras

| ID   | Título                                          | Agente         | Status  | Depende de | Branch | Handoff |
| ---- | ----------------------------------------------- | -------------- | ------- | ---------- | ------ | ------- |
| F7-1 | Contratos, migrations, RLS e seed do catálogo   | banco-de-dados | a fazer | F1         | —      | —       |
| F7-2 | Montar lista com stepper, busca e item avulso   | compras        | a fazer | F7-1       | —      | —       |
| F7-3 | Modo no mercado com tempo real                  | compras        | a fazer | F7-2       | —      | —       |
| F7-4 | Finalizar, histórico, nova lista e compartilhar | compras        | a fazer | F7-3       | —      | —       |
| F7-5 | Vincular a tarefa e XP de compra                | compras        | a fazer | F7-3, F6-1 | —      | —       |

## Fase 8: Polimento

| ID   | Título                                                               | Agente                | Status  | Depende de         | Branch | Handoff |
| ---- | -------------------------------------------------------------------- | --------------------- | ------- | ------------------ | ------ | ------- |
| F8-1 | Revisão de acessibilidade e reduzir movimento                        | qa-testes             | a fazer | F7                 | —      | —       |
| F8-2 | E2E: login, tarefa, foto e resumo com mock                           | qa-testes             | a fazer | F5                 | —      | —       |
| F8-3 | LGPD: exportar dados, excluir conta, transparência para funcionários | auth-grupos           | a fazer | F5                 | —      | —       |
| F8-4 | Rate limiting em OTP, desafios e convites                            | backend-funcoes       | a fazer | F5                 | —      | —       |
| F8-5 | Fila offline simples                                                 | tarefas-calendario    | a fazer | F2                 | —      | —       |
| F8-6 | Performance e animações                                              | design-system         | a fazer | F7                 | —      | —       |
| F8-7 | EAS, ícones, splash, deep links e push nativo                        | notificacoes-whatsapp | a fazer | F7                 | —      | —       |
| F8-8 | ADR e configuração de hospedagem web                                 | arquiteto             | a fazer | resposta do humano | —      | —       |
