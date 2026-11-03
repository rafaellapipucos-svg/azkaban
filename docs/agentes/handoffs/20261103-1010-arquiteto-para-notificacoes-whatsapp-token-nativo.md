# Handoff: arquiteto para notificacoes-whatsapp, token nativo em `enableThisDevice` (BL-19)

**De:** arquiteto
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 10:10 (BRT)
**Branch:** `feat/backlog-contracts`

## Contexto

ADR-0012, seção 11 (contrato do push nativo). Origem: handoff `20261103-0650-notificacoes-whatsapp-para-backend-funcoes-e-banco-de-dados-push-nativo`, item 3. Depende do BL-14 (e, por ele, do BL-5) e do BL-17.

## Contratos criados ou alterados

`packages/contracts/src/notifications.ts`: `nativePushSubscriptionInputSchema` (argumento de `register_native_push_subscription`), `nativePushAndroidChannelId`, `nativePushDataSchema`.

## O que o destinatário precisa fazer

1. `packages/platform/src/push.native.ts`: o canal Android usa `nativePushAndroidChannelId` do contrato no lugar da constante local `'default'` (mesmo valor; o despacho manda esse `channelId`).
2. Repositório de notificações em `packages/data`: `registerNativeDevice({ token, userAgent })`, validando com `nativePushSubscriptionInputSchema`, pela RPC do BL-5. `invalid_push_subscription` cai na falha genérica.
3. `enableThisDevice` no nativo: `nativePushToken(...)` e, com token, o registro acima. Sem token (flag desligada, sem `projectId`, permissão negada), o mesmo estado de "não suportado" de hoje.
4. `features.nativePush` continua `false` até as contas do BL-29.

## Como testar

`pnpm check`, com teste de unidade do repositório (token inválido não chama a RPC). Receber de verdade só com build nativo e as contas do humano.
