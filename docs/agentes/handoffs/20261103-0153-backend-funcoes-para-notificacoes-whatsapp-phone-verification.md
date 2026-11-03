# Handoff: backend-funcoes para notificacoes-whatsapp, `phone-verification` pronta

**De:** backend-funcoes
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 01:53 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/whatsapp-functions`, a partir de `feat/whatsapp-db` (`eabbf0e`)

## Contexto

As telas de telefone e código dependiam da função (ADR-0009, seção 3). Ela está pronta, com o `ConsoleProvider`, e o despacho já manda o resumo diário.

## Contrato da função

`POST /functions/v1/phone-verification`, com o JWT do usuário (`supabase.functions.invoke`), corpo `phoneVerificationRequestSchema` (`{ phone }`, E.164 já normalizado por `normalizePhone`), até 1 KiB.

| Status | Corpo                                                                      | Quando                                                                    |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 200    | `phoneVerificationStartedSchema` (`expiresAt`, `resendAt`, ISO em UTC)     | Código enviado. Confirmar com a RPC `confirm_phone_verification(p_code)`. |
| 400    | `{ error: 'invalid_request' }`                                             | JSON inválido, telefone fora de E.164, corpo acima de 1 KiB.              |
| 401    | `{ error: 'unauthorized' }`                                                | Sem usuário (chave anon ou sem token).                                    |
| 429    | `phoneVerificationErrorSchema` (`phone_rate_limited`, `retryAfterSeconds`) | Reenvio antes de 60 s, ou 5 códigos em 24 h por usuário ou por número.    |
| 502    | `{ error: 'whatsapp_send_failed' }`                                        | O provedor recusou. O código conta no limite.                             |
| 500    | `{ error: 'whatsapp_not_configured' }` ou `{ error: 'internal' }`          | Segredos do WhatsApp inválidos, ou erro do banco.                         |

Na E2E, o código está em `whatsapp_console_messages.message.code` (só service role), pelo `to_e164`.

## O que o destinatário precisa fazer

Ligar o repositório e as telas a essa função. Nada muda em contrato.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`supabase/functions/phone-verification/verification.integration.test.ts` faz o caminho de ponta a ponta.
