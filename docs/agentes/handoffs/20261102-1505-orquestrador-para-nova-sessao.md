# Handoff: orquestrador para a próxima sessão (pausa da Fase 4)

**De:** orquestrador (sessão principal)
**Para:** a próxima sessão que assumir o papel de orquestrador
**Data:** 2026-11-02 15:05 (BRT)
**Branch de integração da Fase 4:** `feat/phase-4-notifications`, HEAD `754e02e` + este commit, no worktree `C:\dev\azkaban\.claude\worktrees\azkaban-fase-3-orquestracao-3590dc` (branch do worktree trocada para a da Fase 4). Push feito.

Leia também o handoff anterior, `20261102-1157-orquestrador-para-nova-sessao.md`: as regras de trabalho, as armadilhas (seção 6) e o modelo de prompt (seção 7) continuam valendo.

## 1. Regras que o humano reafirmou nesta sessão

- Responder em pt-BR. Só orquestrar: toda implementação vai para os subagentes de `.claude/agents/`, sempre com `model: opus`, `effort: high`, `isolation: worktree`.
- Autonomia para as Fases 4 a 8 e o backlog, sem parar para validar cada fase. Limites: sem gastar dinheiro, sem contratar fornecedor, sem tocar no Supabase hospedado, sem merge na `main`, sem commitar segredos, sem desativar RLS. Push de branches e abertura de PR estão autorizados.
- Ritmo: E2E uma vez por agente; mutação só em segurança, RLS, permissões e XP; meta de tempo em cada prompt; em paralelo tudo o que não usa a pilha local; só um agente com a pilha por vez.
- O humano autorizou e já foi feita a troca no `CLAUDE.md` (`functions:test` exige só `pnpm db:start`).

## 2. Fase 3: fechada

- `feat/phase-3-proof` em `5b80817`, com push. PR [#4](https://github.com/rafaellapipucos-svg/azkaban/pull/4) para `feat/phase-2-tasks`, **CI verde**, incluindo a E2E com Chrome e câmera falsa (58 de 58 no `ubuntu-latest`). Auto-fix não ligado (perguntado ao humano, sem resposta). Nada mergeado.
- Verificação final local em banco limpo: tudo verde (ver a entrada de 12:54 no LOG).
- Pendências humanas da Fase 3 já foram apresentadas (base legal, 365 dias, contato de privacidade, custo de storage, senha do banco hospedado, painel, riscos aceitos da seção 20 do ADR-0007). Sem resposta ainda.

## 3. Fase 4: estado

Integrado em `feat/phase-4-notifications`:

| Item                                              | Estado                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| ADR-0008 e contratos                              | feito (arquiteto), seção 17 com as decisões da revisão de segurança                                        |
| F4-1 banco e F4-6 vermelho automático             | feito (`banco-de-dados`); F4-6 mudou de dono no QUADRO                                                     |
| F4-2 despacho Web Push e F4-8 materialização      | feito (`backend-funcoes`), push sem biblioteca, testado contra o vetor da RFC 8291                         |
| F4-3 sino, F4-4 push, F4-5 preferências, F4-7     | feito (`notificacoes-whatsapp`)                                                                            |
| F4-9 casca PWA, título por tela, marcos, `TabBar` | feito (`notificacoes-whatsapp`, `design-system`, títulos por cada dono)                                    |
| Lado cliente de F4-8 e sino em Hoje               | feito (`tarefas-calendario`)                                                                               |
| QA da fase                                        | feito; QA4-1 a QA4-4 corrigidos e integrados (E2E dessas correções ainda **não rodou**)                    |
| Revisão de segurança                              | feita; correções de cliente integradas (SEG4-6, 7, 8 e `safeInternalPath`)                                 |
| Correções de banco SEG4-1, 2, 3 e 5               | feito (`banco-de-dados`, `1af2bca`), integrado em `90de6fb`: `db:test` 1227, PoCs fechados, mutações pegas |

**Atualização às 15:10:** o `banco-de-dados` terminou antes da pausa, e a branch `fix/notifications-db-security` já está integrada. O espelho de `notification_rules` entrou, então `db:check-permissions` volta a passar. Na E2E dele, sem chave VAPID, deram 66 ok, 2 pulados e nenhuma falha. A E2E rodou antes da integração das correções QA4-1 a QA4-4, por isso o `test.fail()` do QA4-1 ainda aparecia.

### O que falta, em ordem

1. ~~Retomar `fix/notifications-db-security`~~: feito.
2. **Verificação final da Fase 4, em banco limpo,** com `bash docs/agentes/ferramentas/verificar-fase.sh <checkout> <arquivo.log>`. O script cobre `install`, `db:start`, `db reset`, `db:test`, `db:check-permissions`, `turbo typecheck test --force`, `lint`, `boundaries`, `build:web`, `functions:test`, `e2e` duas vezes e `db:test` de novo. Antes, copie `supabase/functions/.env.example` para `supabase/functions/.env`. Para a E2E rodar também os testes de push, passe só pelo ambiente uma `EXPO_PUBLIC_VAPID_PUBLIC_KEY` gerada em memória; sem a chave, 1 ou 2 testes ficam pulados de propósito. Rode em segundo plano. Depois faça a varredura de segredos no diff `feat/phase-3-proof..feat/phase-4-notifications`.
3. Se a E2E falhar nas correções novas (QA4-1 em `notifications-jobs.spec.ts`, QA4-2 e QA4-3 no aviso ao vivo), chame o dono.
4. Entrada do orquestrador no LOG, QUADRO da Fase 4 como "feito", push e PR de `feat/phase-4-notifications` para `feat/phase-3-proof`. Acompanhe o CI por `ccd_pr`, sem polling.
5. Resumo da Fase 4 ao humano, com as perguntas da seção 4 abaixo. Depois, siga para a Fase 5 sem esperar.

## 4. Perguntas ao humano ainda sem resposta (Fase 4)

- Padrões da seção 16 do ADR-0008:
  - silêncio das 22h às 7h, ligado;
  - push ligado para lembrete, "em análise" e contestação;
  - o vermelho automático não avisa o admin;
  - um lembrete que cai dentro do silêncio toca mesmo assim;
  - sem ações na notificação;
  - sem antecedência padrão;
  - o sino guarda 30 dias;
  - novos: 10 minutos sem repetir o mesmo aviso e 90 dias de retenção das inscrições de push.
- Esconder o conteúdo na tela bloqueada? Se sim, ligado ou desligado por padrão.
- Para quem tem `task.manage_group`, as vermelhas do grupo ficam em "Atrasadas" sem prazo (QA4-1). Isso pode virar ruído.
- Auto-fix no PR #4.

## 5. Já anotado para a Fase 5 e o backlog

- **F5-1 (arquiteto), ADR do WhatsApp:** inclua a decisão do handoff `20261102-1451-notificacoes-whatsapp-para-arquiteto-banco-de-dados-prazo-no-push.md`. O push ainda não diz até quando dá para concluir o vermelho. Ou o claim devolve `overdue_at` e `status`, ou o ADR-0008, seção 10, passa a dizer que só o sino mostra o prazo. O WhatsApp entra como outra implementação de `NotificationChannel` (`supabase/functions/dispatch-notifications/dispatch.ts`) e `whatsapp` já existe no enum. Primeiro com provider mock; o provedor real é decisão do humano.
- **CSP completa:** primeiro como `Report-Only`, conferida no navegador, com `_headers` gerado no build (ADR-0008, seção 17).
- **`PushSetupCard` no onboarding:** o onboarding não tem passo com sessão. Fica no backlog, se o humano quiser.
- **Limite diário de prova** (nonces emitidos juntos chegam a 59 por dia): decisão do arquiteto, já no handoff anterior.

## 6. Como integrar (o que esta sessão fez)

- A Fase 3 foi integrada no checkout principal `C:\dev\azkaban`, que ainda está em `feat/phase-3-proof`. A Fase 4 é integrada no worktree desta sessão, em `feat/phase-4-notifications`, que já tem `node_modules`.
- Cada branch de agente entra com `git merge --no-ff -q <branch> -m "chore: integrate ..." -m "Co-Authored-By: ..."`. Quando só o LOG conflita, rode `node docs/agentes/ferramentas/log-merge.cjs LOG_DE_ALTERACOES.md`: ele mantém todas as entradas em ordem de data. Depois, `git add` e commit com a mesma mensagem. Para reordenar sem conflito, use `--sort-from "AAAA-MM-DD HH:mm"`.
- Depois de integrar, `pnpm install --frozen-lockfile` (o lockfile muda com frequência) e `pnpm check`.
- **Remover worktrees com `rmSync` foi negado pelo classificador de permissões.** Há dezenas de worktrees integrados em `.claude/worktrees/`. Não tente de novo sem o humano autorizar. Ele tem o comando.
- Nos worktrees dos agentes, o PowerShell fica bloqueado. Eles calculam a hora como UTC menos 3 e registram isso no LOG.
- O pg_cron roda de verdade na pilha local: o vermelho automático a cada 5 minutos, os lembretes a cada minuto e o despacho, que falha sem Vault de propósito. Testes novos que deixem uma ocorrência passada pendente usam `shieldFromAutoMiss` (`e2e/proof-fixtures.ts`). Testes que contem o sino tiram os lembretes padrão.
