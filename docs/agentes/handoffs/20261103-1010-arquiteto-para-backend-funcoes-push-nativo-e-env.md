# Handoff: arquiteto para backend-funcoes, `NativePushChannel`, número do WhatsApp pelo env e a garantia do 503 (BL-14)

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-03 10:10 (BRT)
**Branch:** `feat/backlog-contracts`

## Contexto

ADR-0012, seções 11 (contrato do push nativo) e 18 (503). Origem: handoff `20261103-0650-notificacoes-whatsapp-para-backend-funcoes-e-banco-de-dados-push-nativo`, item 2, e LOG de 2026-11-03 02:18. Depende do BL-5 (colunas `kind` e `expo_token`).

## Contratos criados ou alterados

- `packages/contracts/src/notifications.ts`: `nativePushMessageSchema`, `nativePushDataSchema`, `nativePushAndroidChannelId`, `expoPushTokenSchema`.
- `packages/config/src/whatsapp-env.ts`: o ramo `console` aceita `WHATSAPP_PHONE_NUMBER_ID` opcional (vazio é ausente; fora de `^\d{5,20}$` não passa).

## O que o destinatário precisa fazer

1. **`NativePushChannel`** no despacho, no mesmo canal `web_push`: as inscrições `expo` do usuário recebem uma mensagem validada por `nativePushMessageSchema` (`title` e `body` iguais aos do Web Push, `data` com `v`, `notificationId`, `type` e `url`, `channelId: nativePushAndroidChannelId`, `ttl: notificationRules.pushTtlSeconds`), em lote, para a API de push da Expo. `DeviceNotRegistered` no ticket apaga a inscrição, como 404 e 410 na web; os outros erros seguem a classificação de repetição. A resposta da Expo é validada dentro da função. Recibos (segunda chamada) ficam opcionais; se entrarem, o mesmo tratamento.
2. **Provedor falso nos testes**, injetado como o `fetch` do `MetaCloudProvider`: nenhum teste chama a Expo. Sem credenciais: a API aceita envio sem token de acesso, mas `EXPO_ACCESS_TOKEN`, se um dia existir, é segredo da função, só com o nome no `.env.example`.
3. **Número do WhatsApp pelo env (BL-4):** `whatsapp-webhook` (e quem mais ler) usa `whatsappEnv()?.WHATSAPP_PHONE_NUMBER_ID`, sem `Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')`. Um número malformado agora deixa o WhatsApp "não configurado", também no `console`; o comentário do webhook que diz que o `console` descarta a chave sai.
4. **Garantia do 503:** um teste no `functions:imports` (ou junto dele, sem pilha) que falha se algum `index.ts` ou `_shared` fora de testes responder 503, e nenhuma função repassa ao cliente o status de serviço de fora. Esse é o fundamento da repetição do cliente (BL-10).

## Como testar

Pilha B funções: `pnpm functions:test`; e `pnpm check`. Não rodar junto com a E2E na A.
