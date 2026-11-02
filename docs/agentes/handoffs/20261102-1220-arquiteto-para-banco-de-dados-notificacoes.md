# Handoff: arquiteto para banco-de-dados, notificações e vermelho automático (F4-1 e F4-6)

**De:** arquiteto | **Para:** banco-de-dados | **Data:** 2026-11-02 12:20 (BRT) | **Branch:** `feat/notifications-contracts`

## Contexto

A Fase 4 abre com o [ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md). Você é o primeiro da fila: `backend-funcoes` e `notificacoes-whatsapp` dependem das tabelas e RPCs abaixo. F4-6 passa a ser seu, porque o vermelho automático é só SQL (ADR-0008, seção 10). Peça ao orquestrador para trocar o dono no QUADRO.

## O que foi entregue

ADR-0008, contratos em `packages/contracts/src/notifications.ts` e regras em `packages/config/src/notifications.ts` e `tasks.ts`.

## Contratos criados ou alterados

- `notificationTypeSchema`, `deliveryChannelSchema`, `notificationPreferenceSchema`, `quietHoursSchema`, `localTimeSchema`, `notificationItemSchema` (o `data` de cada tipo), `pushSubscriptionInputSchema`, `pushDeviceSchema`, `pushPayloadSchema`, `notificationErrorCodeSchema`.
- `notificationRules` (espelho novo, chave `notification_rules`) e `notificationDefaults` (sem espelho).
- `taskRules.autoMissJob = { batchSize: 500, reopenGraceMinutes: 60 }`: muda o espelho `task_rules`.

## O que o destinatário precisa fazer

Uma migration por item, nesta ordem. Seções do ADR-0008 entre parênteses.

1. **Espelhos.** `app_settings`: linha `notification_rules` igual a `notificationRules`, e `task_rules` com `autoMissJob`. Funções `notification_rules()` como `proof_rules()`. Em `scripts/check-permission-mirror.mjs`, uma seção para `notification_rules`, como a de `proof_rules`.
2. **Enums.** `notification_type` e `delivery_channel` com os valores dos contratos (`whatsapp` já entra). `notification_outbox_status`: `pending`, `sending`, `sent`, `failed`, `cancelled`, `expired`.
3. **`profiles`** (3): `quiet_hours_start time` e `quiet_hours_end time`, padrão `'22:00'` e `'07:00'` lidos de `notificationRules.defaultQuietHours`, preenchendo as linhas existentes. `check` os dois nulos ou os dois preenchidos e diferentes. `grant update` nas duas colunas. Conferir que `group_member_profiles()` não as expõe.
4. **`notifications`** (3): colunas, `unique (user_id, dedupe_key)`, índice parcial de não lidas, RLS de `select` próprio, `grant update (read_at)` com política de linha própria. Sem `insert`/`delete` para o cliente. Entra na publicação `supabase_realtime`.
5. **`notification_preferences`** (3): chave `(user_id, type, channel)`, RLS própria, `insert`/`update`/`delete` por coluna (`type`, `channel`, `enabled`).
6. **`push_subscriptions`** (3): colunas, `endpoint` único até 1024, `select` só de `id`, `user_agent`, `created_at`, `last_success_at`, `delete` própria, sem `insert` direto. RPC `register_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)`: host em `notificationRules.pushEndpointHosts` (igual ou subdomínio, comparação no host já analisado, sem `like` no texto cru), senão `push_endpoint_not_allowed`; upsert por `endpoint`, trocando `user_id`; acima de `maxPushSubscriptionsPerUser`, apaga a mais antiga. Tamanhos e formato das chaves como em `pushSubscriptionInputSchema`, conferidos de novo no SQL.
7. **`notification_outbox`** (3): colunas, `unique (notification_id, channel)`, `check` de `last_error` até 64, índice parcial de fila, nenhum `grant` a `anon`/`authenticated`.
8. **`enqueue_notification(...)`** (4), interna: grava o sino com `on conflict do nothing` e, só se nasceu, uma linha de outbox por canal ativo com a preferência ligada (`coalesce(preferência, defaultChannels)`); em `web_push`, só com inscrição.
9. **Trigger de eventos** (2, 4): `after update of status, proof_review_status` em `task_occurrences`, com os destinatários, as exceções e as chaves da tabela da seção 2. Precisa de uma checagem de acesso por usuário dado, não por `auth.uid()`: crie `can_view_task_for(p_user, p_task)` ou equivalente. A chave do evento de status é o id da linha de `task_status_history` da transição; se a ordem dos triggers não deixar alcançá-la, use outro valor único por transição e registre.
10. **`enqueue_due_reminders()`** (4): âncora `scheduled_due` em `deadline` e `scheduled_start` nas outras; janela `(now() − reminderCatchUpMinutes, now()]`; só `pending`, tarefa não arquivada, responsável membro atual. Chave `task_reminder:<ocorrência>:<âncora em epoch>:<minutos>`. pg_cron a cada minuto.
11. **`claim_notification_batch(p_limit, p_lease_seconds, p_max_delay_hours)`** e **`report_notification_results(p_results jsonb)`** (5, 6), só `service_role`, com a ordem de checagens da seção 6 e a exceção de silêncio da seção 5. O claim devolve tipo, `data`, idioma, título, `requires_photo_proof`, e as inscrições (`id`, `endpoint`, `p256dh`, `auth`). O formato exato do JSON é combinado com `backend-funcoes`; registre-o no handoff para ela.
12. **Limpeza** (3): cron diário que apaga `notifications` mais velhas que `inboxRetentionDays`.
13. **`call_dispatch_notifications()`** e o cron por minuto: Vault `dispatch_notifications_url` e `cron_secret`, `raise exception 'dispatch_notifications_not_configured'` sem eles, como `call_proof_retention`.
14. **F4-6, `auto_miss_occurrences()`** (10): `pending` com `auto_miss_at <= now()`, tarefa não arquivada, responsável membro atual em tarefa de grupo, `status_changed_at` nulo ou mais velho que `reopenGraceMinutes`; lotes de `batchSize` com `for update skip locked`; `update` sem usuário. pg_cron a cada 5 minutos. Nada de fuso no job.
15. `pnpm db:types`.

## Bloqueios e dúvidas

Nenhum. Se o índice de pendentes não cobrir a varredura de lembretes (âncora até 30 dias à frente), registre a medida e proponha o teto.

## Como testar

`pnpm db:start`, `pnpm db:test`, `pnpm db:check-permissions` (deve mostrar `Notification rules in sync`). pgTAP, no mínimo:

- RLS: um usuário não lê nem marca o sino, as preferências ou as inscrições de outro; não lê `endpoint`, `p256dh` nem `auth`, nem os próprios; não lê nem escreve a outbox; não chama `enqueue_*`, `claim_*`, `report_*` nem `auto_miss_occurrences`.
- `register_push_subscription`: `http://`, host fora da lista, `fcm.googleapis.com.evil.example` e `evilfcm.googleapis.com` recusados; subdomínio de `notify.windows.com` aceito; 11ª inscrição apaga a mais antiga; o mesmo endpoint com outro usuário muda de dono.
- Cada tipo da seção 2: quem recebe e quem não recebe, inclusive o próprio ator, o ex-membro, o admin em tarefa privada e o autor em `proof_in_review`. Repetir o evento não duplica sino nem outbox. `done → pending → done` gera dois avisos.
- Preferência desligada não cria outbox; ligada cria; sem inscrição de push não cria.
- Lembrete: só dentro da janela, só `pending`, e repetir a varredura não duplica.
- Claim: silêncio que cruza a meia-noite em `America/Sao_Paulo` e em outro fuso; a exceção do lembrete; `expired`; `cancelled` por perda de acesso e por ocorrência resolvida; concessão vencida volta à fila.
- `auto_miss_occurrences`: marca só o que passou de `auto_miss_at`; respeita a carência, a tarefa arquivada e o ex-membro; reagendada não fica vermelha pela agenda antiga; histórico com autor nulo, XP zero e aviso `occurrence_missed`; tarefa com foto vira `missed`, e `in_review` não muda; rodar duas vezes não muda nada.
- Mutação: tire a checagem de host, a exceção de silêncio e a carência, um de cada vez, e veja o teste falhar.
