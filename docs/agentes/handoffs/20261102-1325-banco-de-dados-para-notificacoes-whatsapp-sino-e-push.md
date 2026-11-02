# Handoff: banco-de-dados para notificacoes-whatsapp, sino, preferências e push (F4-3, F4-4, F4-5, F4-7)

**De:** banco-de-dados | **Para:** notificacoes-whatsapp | **Data:** 2026-11-02 13:25 (BRT, derivada de UTC menos 3) | **Branch:** `feat/notifications-db`

## Contexto

As tabelas e RPCs de F4-1 estão no banco, e `packages/data/src/database.types.ts` foi gerado. Os avisos nascem sozinhos por trigger e varredura, em qualquer caminho; o cliente só lê, marca como lido e escolhe preferências.

## O que foi entregue

- **`notifications`** (sino): `id`, `user_id`, `type`, `occurrence_id` (nulo se a ocorrência sumiu), `group_id`, `data`, `dedupe_key`, `created_at`, `read_at`. O cliente lê as próprias linhas e escreve só `read_at`. Sem `insert` nem `delete`. Está na publicação `supabase_realtime`: `postgres_changes` com filtro `user_id=eq.<id>`. O título vem por embed `task_occurrences(tasks(title))`, que segue a RLS: sem acesso, nulo.
- **`data` por tipo** (igual a `notificationItemSchema`):
  - `task_reminder`: `{ leadMinutes, anchorAt }`;
  - `occurrence_missed`: `{ byUserId }`, nulo quando foi o job;
  - `occurrence_resolved`: `{ status, byUserId }`;
  - `proof_in_review`: `{ proofId, groupId }`;
  - `proof_disputed`: `{ proofId, toStatus }`.
- **`notification_preferences`**: chave `(user_id, type, channel)`, `enabled`, `updated_at`. `insert`, `update` e `delete` das próprias linhas, com `type`, `channel` e `enabled` (o `user_id` vem do padrão `auth.uid()`). Upsert com `onConflict: 'user_id,type,channel'` funciona. Sem linha vale `notificationRules.defaultChannels`.
- **`profiles.quiet_hours_start` e `quiet_hours_end`** (`time`, padrão 22:00 e 07:00, já preenchidos). Os dois nulos desligam; iguais ou só um nulo levantam `23514`. O banco responde `22:00:00`; corte para `HH:mm`.
- **`push_subscriptions`**: o cliente lê só `id`, `user_agent`, `created_at` e `last_success_at`, **listando as colunas** (`select('*')` dá `42501`). Apaga as próprias linhas. Inserir só pela RPC.
- **`register_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent) returns uuid`**: erros na mensagem, `push_endpoint_not_allowed` (fora da lista, `http`, porta que não 443, `@`, barra invertida, ponto final, acima de 1024) e `invalid_push_subscription` (chaves fora do base64url de 65 e 16 bytes, rótulo acima de 256). Idempotente por `endpoint`; outra conta no mesmo navegador vira a dona; acima de 10, a mais antiga sai (nunca a que acabou de registrar).

## Contratos criados ou alterados

Nenhum. Tudo segue `packages/contracts/src/notifications.ts`.

## O que o destinatário precisa fazer

- Repositórios em `packages/data` para o sino (lista, contador por `read_at is null`, marcar uma e todas), preferências, silêncio e aparelhos, e a assinatura do Realtime.
- Ao sair da conta: cancelar a inscrição no navegador e `delete` da linha pelo `id`.
- `invalid_push_subscription` não está em `notificationErrorCodeSchema`: o contrato a trata como falha genérica. Se quiser texto próprio, peça ao `arquiteto`.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm db:test` (`supabase/tests/rls_notifications.test.sql`).
