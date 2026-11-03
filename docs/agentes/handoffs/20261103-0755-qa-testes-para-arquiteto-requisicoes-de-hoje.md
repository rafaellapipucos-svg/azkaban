# Handoff: qa-testes para arquiteto, requisições ao abrir Hoje (QA8-3)

**De:** qa-testes
**Para:** arquiteto (triagem entre os donos das consultas)
**Data:** 2026-11-03 07:55 (BRT)
**Branch:** `chore/qa-phase-8`

## Contexto

ADR-0012, seção 10, meta 2: abrir Hoje com 50 ocorrências faz no máximo 8 chamadas REST, sem N+1.

## Achado QA8-3 (média)

Ao recarregar Hoje com 50 ocorrências, foram **17** chamadas, todas antes de a rede ficar ociosa. Não é N+1: nenhuma rota passa de 3 chamadas, e o total não cresce com o número de ocorrências. Mas a meta de 8 não é cumprida:

`notifications` x3, `user_stats` x2, `profiles` x2, `groups` x2, `task_occurrences` x2, `xp_events` x2, `user_achievements` x2, `contexts`, `areas`.

As repetições de `notifications`, `xp_events` e `user_achievements` parecem vir do `catchUp` de `subscribeCaughtUp` no `ok` do Realtime. A segunda leitura de `profiles`, `groups`, `user_stats` e `task_occurrences` parece ser refetch, por chave de consulta diferente ou por invalidação na montagem.

## O que o destinatário precisa fazer

Decidir se a meta vale como está (e quem corta o quê) ou se ela muda no ADR. `e2e/performance.spec.ts` só barra o N+1 (no máximo 3 por rota); a contagem vai para o console e para as anotações.

## Como testar

Pilha A, `pnpm exec playwright test e2e/performance.spec.ts --project=app`.
