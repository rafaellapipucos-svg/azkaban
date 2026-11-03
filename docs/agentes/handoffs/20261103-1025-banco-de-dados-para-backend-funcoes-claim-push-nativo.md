# Handoff: banco-de-dados para backend-funcoes, inscrições nativas no claim (BL-5 para BL-14)

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-03 10:25 (BRT)
**Branch:** `feat/backlog-db`

## Contexto

ADR-0012, seção 11. O BL-5 pôs `kind` e `expo_token` em `push_subscriptions` e a RPC `register_native_push_subscription`.

## Contratos criados ou alterados

Nenhum em `packages/contracts`. Muda o JSON de `claim_notification_batch` (migration `20261105100200_claim_native_push.sql`): cada item de `subscriptions` passa a dizer o tipo.

- `web`: `{ id, kind: 'web', endpoint, p256dh, auth }` (o de antes, mais `kind`).
- `expo`: `{ id, kind: 'expo', expoToken }`, sem `endpoint` nem chaves.

## O que o destinatário precisa fazer

1. Em `supabase/functions/dispatch-notifications/index.ts`, `itemSchema.subscriptions` vira uma união discriminada por `kind`. Hoje o schema exige `endpoint`, `p256dh` e `auth` em toda inscrição: um usuário com uma linha `expo` faria o item inteiro sair como inválido (`failed`), inclusive para os navegadores dele. Não acontece enquanto `features.nativePush` está `false` (nada chama a RPC nativa), mas precisa entrar no BL-14 antes do BL-19.
2. `report_notification_results` não muda: `goneSubscriptionIds` e `deliveredSubscriptionIds` servem aos dois tipos (`DeviceNotRegistered` vai em `gone`).
3. `export_user_data` já tira `expo_token` (`20261105100300`); o `account-export` não precisa mudar, mas o teste de integração pode incluir um token entre os segredos que não aparecem.

## Como testar

`pnpm functions:test` na pilha B de funções; o pgTAP `supabase/tests/rls_native_push.test.sql` mostra o formato.
