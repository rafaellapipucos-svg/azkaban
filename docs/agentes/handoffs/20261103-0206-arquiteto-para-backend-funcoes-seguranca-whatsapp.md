# Handoff: arquiteto para backend-funcoes, revisão de segurança do WhatsApp

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-03 02:06 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/whatsapp-deploy`

## Contexto

Decisões do ADR-0009, seção 18, sobre o handoff `20261103-0158-revisor-seguranca-para-backend-funcoes-whatsapp`. O contrato já mudou nesta branch.

## O que o destinatário precisa fazer

1. **SEG5-3.** `whatsappWebhookSchema` agora tem `statuses` e `messages` como `unknown[]`. Em `readWebhook` (`_shared/whatsapp/webhook.ts`), valide cada elemento com `whatsappWebhookStatusSchema` ou `whatsappWebhookMessageSchema` (`safeParse`) e some os inválidos em `ignored`. Até essa mudança, um elemento fora do formato chega sem validação à função. Ajuste o tipo usado em `webhook.test.ts` e acrescente um lote com um status inválido e um PARAR válido: o PARAR tem de valer.
2. **SEG5-2.** `normalizeReply` com `NFKD` e `\p{Cf}` na classe removida, com os quatro casos do revisor no `webhook.test.ts`.
3. **SEG5-5.** `phone-verification`: quando `start_phone_verification` devolver `{ error: 'phone_country_not_allowed' }` (código novo em `whatsappErrorCodeSchema`), responda 400 com esse corpo, sem enviar nada. O teto global volta como `phone_rate_limited`, que já é 429.
4. **Do handoff do revisor, sem mudança de decisão:** passe `WHATSAPP_PHONE_NUMBER_ID` a `readWebhook` sempre que ele existir, não só com `meta`; o log fica só com contagens e códigos.

O SEG5-8 (`local-demo-*` recusado com `meta`) já está em `parseWhatsAppEnv`. Nada a fazer na função.

## Bloqueios e dúvidas

O item 3 depende da migration do `banco-de-dados` (handoff `20261103-0206-arquiteto-para-banco-de-dados-seguranca-whatsapp`).

## Como testar

`pnpm functions:test` com a pilha; `pnpm check`.
