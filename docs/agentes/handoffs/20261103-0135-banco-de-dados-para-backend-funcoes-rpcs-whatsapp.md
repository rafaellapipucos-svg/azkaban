# Handoff: banco-de-dados para backend-funcoes, RPCs do WhatsApp

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-03 01:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/whatsapp-db`, a partir de `feat/phase-5-whatsapp` (`da2fd5d`)

## Contexto

Itens 1 a 10 do handoff `20261103-0030-arquiteto-para-banco-de-dados-whatsapp` (ADR-0009). Estas são as assinaturas finais. Os nomes que você propôs para os eventos de status foram mantidos.

## Assinaturas

Todas `security definer`, só `service_role`, salvo `confirm_phone_verification` (do app).

### `claim_notification_batch(p_limit int, p_lease_seconds int, p_max_delay_hours int, p_channels text[] default '{web_push}')` → `jsonb`

- `p_channels`: os canais que a execução sabe enviar (`web_push`, `whatsapp`). Vazio, nulo ou nome desconhecido levanta `invalid_argument` (22023). O padrão só existe para o despacho de hoje continuar subindo. Passe sempre o argumento.
- Resposta: `{ items, expired, cancelled, deferred }`, como antes.
- Cada item tem os campos de antes (`outboxId`, `notificationId`, `channel`, `type`, `data`, `occurrenceId`, `locale`, `taskTitle`, `requiresPhotoProof`, `attempts`, `scheduledFor`, `subscriptions`) e mais estes. **As chaves vêm sempre, com `null` quando não se aplicam:**
  - `timezone` (string): fuso do perfil, ou `America/Sao_Paulo` se o Postgres não conhece o nome;
  - `overdueAt` (instante ou `null`) e `occurrenceStatus` (`occurrence_status` ou `null`): da ocorrência, lidos na hora (seção 9);
  - `phone` (E.164 ou `null`): só em `channel = 'whatsapp'`;
  - `summary` (`dailySummarySourceSchema` ou `null`): só em `type = 'daily_summary'`.
- Novos `last_error` de linhas canceladas pelo claim: `whatsapp_not_ready`, `whatsapp_type_not_allowed`, `summary_empty`. O `daily_summary` expira em `scheduled_for + catchUpMinutes` (120) e não passa pelo silêncio.
- `daily_summary` só existe no canal `whatsapp`: a gravação recusa o push para ele, mesmo com preferência ligada.

### `report_notification_results(p_results jsonb)` → `int`

- Cada elemento como antes, e um `sent` de `whatsapp` aceita `whatsapp: { providerMessageId, waId, template, provider? }`.
- Grava a linha de `whatsapp_messages` (`purpose = 'notification'`, `status = 'accepted'`, `outbox_id`) na mesma transação.
- **`provider`** (`console` ou `meta`) é opcional, mas mande o `name` do provedor. Sem ele, um id `console.*` vira `console`, e o resto `meta`.
- `waId` fora de `^\d{6,15}$` e `template` fora de `^[a-z0-9_]+$` (até 512) viram `null`, em vez de derrubar o report e reenviar a mensagem. `providerMessageId` repetido é ignorado. Sem `whatsapp`, a linha da outbox fica `sent` e nada é gravado em `whatsapp_messages`.

### `start_phone_verification(p_user_id uuid, p_phone text)` → `jsonb`

- Sucesso: `{ verificationId, code, expiresAt, resendAt }`.
- Limite: `{ error: 'phone_rate_limited', retryAfterSeconds }`. É o maior entre a espera do reenvio, o limite por usuário e o limite por número.
- `p_phone` fora de E.164, ou usuário inexistente, levanta `invalid_argument` (22023): valide antes.
- O envio que falha depois conta no limite, porque a linha já existe.

### `record_whatsapp_statuses(p_events jsonb)` → `int` (linhas que mudaram)

- `p_events`: array de `{ providerMessageId, status, at, errorCode }`, exatamente o `StatusEvent` de `readWebhook`.
- `status` fora de `sent`/`delivered`/`read`/`failed` é ignorado.
- `at` em ISO, ou `null` (vale `now()`).
- `errorCode` só é gravado em `failed`, e só se casar com `^[a-z0-9_]{1,64}$`.
- O status só avança, e `failed` vale sobre qualquer um. Id desconhecido não faz nada.
- Não sendo array, levanta `invalid_argument`.

### `whatsapp_stop_by_wa_id(p_wa_id text)` → `int` (perfis que mudaram)

- Procura pelos dígitos do `phone_e164` ou por um `recipient_wa_id` já visto em `whatsapp_messages`.
- Grava o opt-out com `source = 'webhook'` só em perfis prontos, então repetir devolve 0.
- `p_wa_id` fora de `^\d{6,15}$` levanta `invalid_argument` (22023): o `from` do contrato já garante isso.

## Escritas diretas da service role (sem RPC)

- `whatsapp_console_messages (to_e164, message jsonb)`: o `ConsoleProvider` grava; `message` é objeto de até 16 KiB. A E2E lê aqui.
- `whatsapp_messages`, para `phone_code` e `stop_reply`: `user_id`, `purpose`, `template`, `provider`, `provider_message_id` (único, até 128), `recipient_wa_id` (só dígitos ou nulo). O `stop_reply` aceita `user_id` nulo, porque o número pode estar em várias contas. `status` nasce `accepted`.
- `anon` e `authenticated` não têm nenhum privilégio nas três tabelas.

## O que o destinatário precisa fazer

1. Passar `p_channels` no claim: `['whatsapp']` sempre, e `'web_push'` só com o VAPID.
2. Ler os campos novos no `itemSchema` (todos `nullable`) e repassar `timezone`, `overdueAt` e `occurrenceStatus` ao `PushSource`.
3. Mandar `whatsapp: { providerMessageId, waId, template, provider }` no `sent` do canal.
4. `phone-verification`, `whatsapp-webhook` e o `ConsoleProvider` com as assinaturas acima.

## Bloqueios e dúvidas

Nenhum. O pg_cron `enqueue-daily-summaries` roda a cada minuto na pilha local. Só pega perfis prontos, então não interfere nos testes atuais.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test` (`supabase/tests/rls_whatsapp.test.sql`).
