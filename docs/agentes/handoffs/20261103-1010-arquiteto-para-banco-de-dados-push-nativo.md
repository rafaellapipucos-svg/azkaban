# Handoff: arquiteto para banco-de-dados, inscrição de push nativo (BL-5)

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 10:10 (BRT)
**Branch:** `feat/backlog-contracts`

## Contexto

ADR-0012, seção 11, "Contrato do push nativo (BL-1)". Origem: handoff `20261103-0650-notificacoes-whatsapp-para-backend-funcoes-e-banco-de-dados-push-nativo`, item 1.

## Contratos criados ou alterados

`packages/contracts/src/notifications.ts`: `pushSubscriptionKindSchema`, `expoPushTokenSchema`, `nativePushSubscriptionInputSchema`. `pushSubscriptionInputSchema` e `pushDeviceSchema` não mudam.

## O que o destinatário precisa fazer

Uma migration na faixa `20261105100000`+:

1. `push_subscriptions.kind text not null default 'web'`, com `check (kind in ('web', 'expo'))`, e `expo_token text unique`, com a mesma regex de `expoPushTokenSchema` (`^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$`, até 256).
2. `endpoint`, `p256dh` e `auth` passam a aceitar nulo; um `check` amarra: `web` tem os três e `expo_token` nulo; `expo` tem `expo_token` e os três nulos. As linhas de hoje são `web`.
3. O `grant select` de colunas ao `authenticated` não ganha `expo_token` (é capacidade, como o endpoint). `kind` não precisa ir ao cliente agora.
4. RPC irmã `register_native_push_subscription(p_token text, p_user_agent text) returns uuid`, `security definer`, com o mesmo corpo de `register_push_subscription`: `forbidden` sem sessão, `invalid_push_subscription` para token fora da regex ou `user_agent` acima de 256, upsert por `expo_token` (aparelho que troca de conta passa à nova, `created_at` e `last_success_at` como na web) e a poda acima de `maxPushSubscriptionsPerUser` contando os dois tipos. Sem lista de hosts. `grant execute` só a `authenticated`.
5. A limpeza de inscrições velhas (`pushSubscriptionRetentionDays`) e a reivindicação do despacho passam a ver as linhas `expo`; o que o despacho lê de cada linha precisa trazer `kind` e `expo_token` (combine com o `backend-funcoes`, BL-14).
6. pgTAP: token válido entra e é do usuário; token inválido, `invalid_push_subscription`; o mesmo token em outra conta muda de dono; o limite poda o mais velho entre web e expo; `authenticated` não lê `expo_token`; `anon` não executa. `pnpm db:types`.

## Como testar

Pilha B db: `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm db:types` e `pnpm check`.
