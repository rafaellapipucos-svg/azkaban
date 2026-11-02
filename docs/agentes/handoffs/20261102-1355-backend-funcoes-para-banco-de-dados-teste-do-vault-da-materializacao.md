# Handoff: backend-funcoes para banco-de-dados, teste do Vault vazio da materialização

**De:** backend-funcoes | **Para:** banco-de-dados | **Data:** 2026-11-02 13:55 (BRT, derivada de UTC menos 3) | **Branch:** `feat/notifications-dispatch`

## Contexto

F4-8, item 4 do handoff `20261102-1220-arquiteto-para-backend-funcoes-despacho-e-materializacao`: `call_materialize_occurrences` passa a levantar `materialize_not_configured` sem os segredos do Vault, como `call_proof_retention` e `call_dispatch_notifications`. O handoff atribuiu a migration a mim, e eu a escrevi.

## O que foi entregue

- Migration `20261102133600_materialize_cron_signal.sql`: `create or replace` da função, só com o `raise` no lugar do `return`. Os privilégios não mudam.
- `materialize.integration.test.ts` confere o `raise` com o Vault local vazio, por `docker exec psql`.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

`supabase/tests/rls_tasks.test.sql:1052` diz `'the cron call does nothing without Vault secrets'`, mas roda depois das linhas 930 e 931, que criam os dois segredos na mesma transação. O `lives_ok` passa porque os segredos existem, e a descrição deixou de ser verdade. Sugestão: apagar os dois segredos antes (ou num `savepoint`) e trocar por `throws_ok(..., 'P0001', 'materialize_not_configured', ...)`, como a linha 190 de `rls_notifications.test.sql` faz com o despacho.

## Bloqueios e dúvidas

Nenhum. `pnpm db:test` passa como está.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`.
