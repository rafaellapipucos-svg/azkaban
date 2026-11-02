# Handoff: banco-de-dados para backend-funcoes, despacho das notificações (F4-2)

**De:** banco-de-dados | **Para:** backend-funcoes | **Data:** 2026-11-02 13:25 (BRT, derivada de UTC menos 3) | **Branch:** `feat/notifications-db`

## Contexto

F4-1 e F4-6 estão no banco (ADR-0008). A outbox nasce sozinha, por trigger e pela varredura de lembretes. Falta a Edge Function `dispatch-notifications`, que o cron já chama.

## O que foi entregue

- `claim_notification_batch(p_limit int, p_lease_seconds int, p_max_delay_hours int) returns jsonb`, só `service_role`. Valores de `notificationDefaults` (`dispatchBatchSize`, `leaseSeconds`, `maxDelayHours`). Qualquer um menor que 1 levanta `invalid_argument`.
- `report_notification_results(p_results jsonb) returns int`, só `service_role`.
- `call_dispatch_notifications()` e o cron `dispatch-notifications` a cada minuto. Vault: `dispatch_notifications_url` e `cron_secret`; sem eles, `dispatch_notifications_not_configured`. Corpo `{}` e cabeçalho `x-cron-secret`, como `proof-retention`.

## Contratos criados ou alterados

Nenhum em `packages/contracts`. O JSON abaixo é o formato combinado; se quiser um schema zod, ele é seu.

**Resposta do claim:**

```json
{
  "items": [
    {
      "outboxId": "uuid",
      "notificationId": "uuid",
      "channel": "web_push",
      "type": "task_reminder",
      "data": { "leadMinutes": 30, "anchorAt": "2026-11-02T13:00:00+00:00" },
      "occurrenceId": "uuid",
      "locale": "pt-BR",
      "taskTitle": "Academia",
      "requiresPhotoProof": false,
      "attempts": 1,
      "scheduledFor": "2026-11-02T12:30:00+00:00",
      "subscriptions": [{ "id": "uuid", "endpoint": "https://...", "p256dh": "...", "auth": "..." }]
    }
  ],
  "expired": 0,
  "cancelled": 0,
  "deferred": 0
}
```

- `data` é o de `notificationItemSchema` para o `type`. O instante vem com o deslocamento da sessão (`+00:00` no cron), aceito por `instantSchema`.
- `attempts` já conta esta tentativa. Com `attempts >= retry.maxAttempts` e falha transitória, mande `failed`.
- `subscriptions` vem vazio fora de `web_push`. Nunca logue `endpoint`, `p256dh`, `auth`, `taskTitle` nem `user_id`.
- `expired`, `cancelled` e `deferred` são contagens para o log. O banco já resolveu essas linhas.
- O claim já confere, nesta ordem: atraso máximo, acesso do destinatário, lembrete de ocorrência que não está mais `pending`, "em análise" de foto que já não espera, silêncio (com a exceção do lembrete) e inscrição. Quem chega em `items` está em `sending`, com a concessão em `locked_until`.

**Entrada do report**, um item por linha reivindicada:

```json
[
  { "outboxId": "uuid", "status": "sent", "deliveredSubscriptionIds": ["uuid"] },
  { "outboxId": "uuid", "status": "retry", "code": "push_server_error", "retryAfterSeconds": 120 },
  {
    "outboxId": "uuid",
    "status": "failed",
    "code": "push_forbidden",
    "goneSubscriptionIds": ["uuid"]
  }
]
```

- `status`: `sent`, `retry` ou `failed`; outro valor levanta `invalid_argument` e desfaz o report inteiro. `gone` não é status: as inscrições vão em `goneSubscriptionIds`, junto do status que a linha merece (`sent` se outra entregou, `failed` se não sobrou nenhuma).
- `retryAfterSeconds` é a espera já calculada pela função (backoff de `notificationDefaults.retry` ou o `Retry-After`, com o teto). O banco só soma a `now()`, com mínimo de 1 s.
- `code` é cortado em 64 caracteres. Use códigos curtos seus, nunca a mensagem do serviço de push.
- `deliveredSubscriptionIds` recebe `last_success_at`; `goneSubscriptionIds` são apagadas. As duas listas só valem entre as inscrições do destinatário da linha.
- Uma linha que não está mais em `sending` (a concessão venceu e outra execução a pegou) é ignorada. O retorno é o número de linhas atualizadas.

## O que o destinatário precisa fazer

1. `dispatch-notifications`, conforme a seção 6 do ADR-0008, com o host do endpoint conferido de novo antes do `POST` (`notificationRules.pushEndpointHosts`, o próprio host ou subdomínio, no host já analisado).
2. Registrar a função no `config.toml` e em `docs/implantacao.md`, com os dois segredos do Vault.
3. Testes de integração com a pilha: as linhas aparecem na outbox fazendo uma mudança de status ou chamando `enqueue_due_reminders()` como `postgres`.

## Bloqueios e dúvidas

Nenhum. Fora do banco: `pnpm functions:test` falha em 11 testes de `materialize-occurrences`, todos porque a resposta agora traz `failed: 0, deferred: 0` (padrão do contrato novo) e o teste espera só `inserted`. É de F4-8, seu.

## Como testar

`pnpm db:start`, `pnpm db:test` (`supabase/tests/rls_notifications.test.sql`, seções "Claim and report").
