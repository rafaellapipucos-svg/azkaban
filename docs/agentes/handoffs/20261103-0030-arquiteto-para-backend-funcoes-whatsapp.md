# Handoff: arquiteto para backend-funcoes, WhatsApp da Fase 5

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-03 00:30 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/whatsapp-adr`, a partir de `feat/phase-4-notifications` (`e54968d`)

## Contexto

F5-1 decidiu o WhatsApp no [ADR-0009](../../adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md). Você entrega o provedor, o canal no despacho e duas funções novas. **Nenhuma chamada real à Meta**: o `MetaCloudProvider` é testado com `fetch` falso.

## Contratos e config

- `packages/contracts/src/whatsapp.ts`: `whatsappOutboundSchema`, `whatsappSendResultSchema`, `whatsappWebhookSchema`, `whatsappSignatureSchema`, `phoneVerificationRequestSchema`, `phoneVerificationStartedSchema`, `phoneVerificationErrorSchema`, `dailySummarySourceSchema` e `dailySummaryRenderSchema`.
  - Ele importa `./common`, `./notifications` e `./tasks`, e `tasks` importa `./recurrence`: mapeie no `deno.json` como já é feito com `common`.
- `packages/config/src/whatsapp.ts` (`whatsappDefaults`, `whatsappRules`) e `whatsapp-env.ts` (`parseWhatsAppEnv`, que importa `zod`).
- `supabase/functions/.env.example` já tem os cinco nomes.

## O que fazer

1. **Provedores** (seção 1): `ConsoleProvider` (log sem telefone, código ou texto; grava `whatsapp_console_messages`; `console.<uuid>`) e `MetaCloudProvider` (payloads de `template` nomeado, `code` com o botão e `text`; mapa de respostas; `redirect: 'manual'`; tempo de `sendTimeoutMs`). Testes em Node com `fetch` falso: cada payload, 2xx, 429 com `Retry-After`, 5xx, rede, tempo, 3xx, `131026` e `130429`, e que o token não aparece em nada que saia do provedor.
2. **Despacho** (seção 2):
   - `p_channels` no claim, com o push só quando o VAPID existe, e 500 só sem canal nenhum;
   - o `itemSchema` com os campos novos;
   - `WhatsAppChannel`, que monta o resumo com `buildDailySummary` (core, do `notificacoes-whatsapp`; use um dublê até chegar), o idioma de `templateLanguages` e o template de `whatsappDefaults.templates`;
   - `sent` com `{ providerMessageId, waId, template }` no report;
   - repasse de `timezone`, `overdueAt` e `occurrenceStatus` ao `PushSource` (seção 9).
3. **`phone-verification`** (seção 3): JWT do usuário, corpo até 1 KiB, `start_phone_verification` com service role, envio `code`, linha em `whatsapp_messages` com `purpose = 'phone_code'`, e as respostas 200, 429 e 502 do contrato. Nunca logue o telefone nem o código.
4. **`whatsapp-webhook`** (seção 7): `verify_jwt = false` em `supabase/config.toml`, `GET` com `sameSecret`, `POST` com `readLimited(webhookMaxBytes)`, HMAC por `crypto.subtle.verify` sobre os bytes brutos, filtro por `phone_number_id` em `meta`, `record_whatsapp_statuses`, palavras de parada normalizadas e `whatsapp_stop_by_wa_id`, confirmação `text` por tentativa única, e as respostas da seção. Testes:
   - assinatura certa, errada, ausente, com outro formato, e de um corpo reserializado (precisa falhar);
   - corpo de 1 MiB + 1;
   - `PARAR`, `Parar.`, `stop`, `Pare` e o botão "Parar" param; "não quero parar" não;
   - evento repetido não confirma de novo;
   - payload assinado e inválido dá 200.
5. Acrescente os testes novos a `functions:test`.

## Paralelo e dependências

- 1 e as partes puras de 4 (assinatura, normalização, mapeamento de status) não dependem de ninguém.
- 2, 3 e a integração de 4 precisam das migrations do `banco-de-dados` (handoff irmão). Combine com ele os nomes finais dos argumentos.
- O canal usa `buildDailySummary` do `notificacoes-whatsapp`; até lá, teste com um renderizador falso.

## Bloqueios e dúvidas

Com `console`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` ficam vazios no `.env.example`. Os testes do caminho assinado podem rodar em Node com o segredo injetado. Se precisar deles na função servida, um valor local de demonstração, como o `CRON_SECRET`, pede aprovação do orquestrador.

## Como testar

`pnpm check`; com a pilha, `pnpm functions:test`.
