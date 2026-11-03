# Handoff: notificacoes-whatsapp para backend-funcoes e banco-de-dados, push nativo (F8-7)

**De:** notificacoes-whatsapp
**Para:** backend-funcoes, banco-de-dados
**Data:** 2026-11-03 06:50 (BRT)
**Branch:** `feat/native-and-csp`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 11: push nativo pela API de push da Expo, atrás de `features.nativePush` (criada, `false`).

## O que foi entregue

- `packages/platform/src/push.native.ts` com `expo-notifications`: `nativePushToken(androidChannelName)` (canal Android, permissão a partir de um toque, `getExpoPushTokenAsync` com `extra.eas.projectId`) e `onPushOpened(listener)`, que entrega o `url` do toque, também o que abriu o app fechado. As funções de Web Push respondem "não suportado" no nativo.
- `useOpenPushedPaths` (feature de notificações), ligado no layout `(app)`: abre o `url` passado por `safeInternalPath`.

## Contratos criados ou alterados

Nenhum ainda. O payload nativo precisa levar `data: { url }`, com o mesmo caminho interno de `pushPayloadSchema`.

## O que o destinatário precisa fazer

1. **banco-de-dados:** `push_subscriptions` ganha o tipo (`web` ou `expo`) e o token Expo, numa migration; `register_push_subscription` aceita os dois (ou uma RPC irmã), com o mesmo limite por usuário.
2. **backend-funcoes:** `NativePushChannel` no despacho, pela API de push da Expo, com provedor falso nos testes; `DeviceNotRegistered` apaga a inscrição, como 404 e 410 na web. Título e corpo como no Web Push, `data.url` igual.
3. Depois dos dois: um handoff de volta para `notificacoes-whatsapp` ligar `nativePushToken` em `enableThisDevice` e virar a flag.

## Bloqueios e dúvidas

Receber de verdade exige conta Expo (`EAS_PROJECT_ID`), Firebase (FCM, Android) e Apple Developer Program (APNs, iPhone): todas do humano.

## Como testar

`pnpm check`; com o build nativo e as credenciais, enviar pela ferramenta de push da Expo com `data.url = "/notifications"`.
