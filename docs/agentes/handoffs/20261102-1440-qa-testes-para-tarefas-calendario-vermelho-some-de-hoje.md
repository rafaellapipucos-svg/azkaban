# Handoff: qa-testes para tarefas-calendario, vermelho some de Hoje

**De:** qa-testes
**Para:** tarefas-calendario
**Data:** 2026-11-02 14:40 (BRT, derivada de UTC menos 3)
**Branch:** `chore/qa-phase-4`, a partir de `feat/phase-4-notifications` (`15f5424`)

## Contexto

QA da Fase 4 no estado integrado. O job de vermelho automático (F4-6, `auto_miss_occurrences`) roda a cada 5 minutos, inclusive na pilha local, e já está ligado.

## O que foi entregue

`e2e/notifications-jobs.spec.ts`, com o teste `a task the job turned red, still inside the late window, stays on Hoje` marcado com `test.fail()` só na asserção do bug.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA4-1, média. Uma tarefa que o job deixou vermelha some de Hoje e da aba da área, embora ainda dê para concluí-la.**

`planToday` e `planArea` (`packages/core/src/tasks/today.ts`) põem em "Atrasadas" só o que `isOverdue` aceita, e `isOverdue` (`late.ts`) exige `status === 'pending'`. O comentário das duas diz "until the automatic-missed job exists (F4-6)". Agora ele existe: no máximo 5 minutos depois do fim do dia, a ocorrência passa a `missed`, deixa de ser "atrasada" e, como não é de hoje, sai das duas listas. Ela só aparece no calendário, no dia dela.

Efeitos:

- a seção "Atrasadas" de Hoje fica quase sempre vazia: só mostra algo nos minutos entre o fim do dia e o próximo ciclo do job, ou durante a carência de 60 minutos depois de reabrir;
- a janela de 72 horas continua valendo (`missed → done` com `late`, conferido na E2E nova), mas a pessoa não acha mais a tarefa onde costumava achar;
- quem cria uma tarefa para ontem (para registrar o que fez) a vê ficar vermelha em até 5 minutos, porque `status_changed_at` nasce nulo e a carência não vale.

Passo a passo:

1. `pnpm db:start`, entrar no app, criar uma tarefa para ontem às 9h pelo formulário completo (`/tasks/new?day=<ontem>&time=09:00`).
2. Hoje mostra a tarefa em "Atrasadas".
3. Esperar o cron (até 5 minutos) ou rodar `select public.auto_miss_occurrences();` no banco local.
4. Recarregar Hoje: a tarefa sumiu, e "Atrasadas" também. No calendário, no dia de ontem, ela está como "Não feito". O detalhe ainda oferece "Marcar como feito".

Sugestão, a decidir com o `arquiteto` se mudar o que a tela promete: "Atrasadas" passa a incluir as `missed` sem autor (`status_changed_by` nulo, o job) dentro da janela de atraso (`canResolveLate`), ou todas as `missed` dentro da janela. A lista vem de `listOccurrences`, que já traz o status. Quando corrigir, tire o `test.fail()` do teste.

## Bloqueios e dúvidas

Qual `missed` volta para Hoje (só a do job ou também a marcada pela pessoa) é decisão de produto pequena; a do job é o caso que a fase criou.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/notifications-jobs.spec.ts`. Hoje o teste com `test.fail()` passa porque falha; depois da correção ele passa a falhar até o `test.fail()` sair.
