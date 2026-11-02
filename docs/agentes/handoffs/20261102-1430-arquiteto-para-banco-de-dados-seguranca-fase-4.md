# Handoff: arquiteto para banco-de-dados, segurança da Fase 4

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-02 14:30 (BRT)
**Branch:** `docs/notifications-security-decisions`, a partir de `feat/phase-4-notifications` (`15f5424`)

## Contexto

Decisões da revisão de segurança da Fase 4 no ADR-0008, seção 17. O handoff `20261102-1420-revisor-seguranca-para-banco-de-dados-notificacoes` traz os achados e os PoCs; este diz o que fazer.

## O que foi entregue

ADR-0008, seção 17, e dois valores novos em `notificationRules` (`packages/config/src/notifications.ts`): `renotifyCooldown: { minutes: 10, types: ['occurrence_missed', 'occurrence_resolved', 'proof_disputed'] }` e `pushSubscriptionRetentionDays: 90`.

## Contratos criados ou alterados

`notificationRules`, com espelho a fazer. `internalPathSchema` em `packages/contracts` (não afeta o banco).

## O que o destinatário precisa fazer

Uma migration nova (não edite as já integradas):

1. **Espelho.** `app_settings.notification_rules` recebe `renotifyCooldown` e `pushSubscriptionRetentionDays`, iguais aos de `packages/config`. Até lá, `pnpm db:check-permissions` acusa a diferença.
2. **SEG4-1.** Em `enqueue_notification`, antes do `insert` no sino: se `p_type` está em `renotifyCooldown.types` e existe linha de `notifications` com o mesmo `user_id`, `type`, `occurrence_id` e `data = p_data`, com `created_at > now() - renotifyCooldown.minutes`, retorne `null` sem gravar nada. A chave do evento continua a linha do histórico. `occurrence_id` nulo não entra na checagem (nada a comparar). O índice único `(user_id, dedupe_key)` já filtra por usuário; um índice novo só se o plano mostrar necessidade.
3. **SEG4-2.** Em `register_push_subscription`, o `on conflict (endpoint) do update` ganha `where s.user_id = excluded.user_id or (s.p256dh = excluded.p256dh and s.auth = excluded.auth)`. Sem linha devolvida, `raise exception 'forbidden' using errcode = '42501'`. O mesmo dono continua atualizando chaves e agente.
4. **SEG4-3.** Em `can_receive_notification`, o ramo de `proof_in_review` passa a `public.can_view_task_for(p_user, t) and t.archived_at is null and t.group_id is not null and t.visibility = 'group' and public.proof_user_can(p_user, t.group_id, 'proof.review')`.
5. **SEG4-5.** No cron diário de `delete_expired_notifications`, apagar `push_subscriptions` com `coalesce(last_success_at, created_at) < now() - pushSubscriptionRetentionDays`, lido de `notification_rules()`.
6. Atualizar `rls_tasks.test.sql:1052`, cuja descrição deixou de ser verdade (pendência do `backend-funcoes`), se ainda não foi.

## Bloqueios e dúvidas

Nenhum. Coordene a pilha com o orquestrador: o QA está com ela.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`. Casos pgTAP mínimos:

- SEG4-1: como Duda, alternar `set_occurrence_status` entre `done` e `pending` 50 vezes numa tarefa de Caio: Caio tem 1 `occurrence_resolved` e no máximo 1 linha de outbox. Recuar o `created_at` dessa linha 11 minutos e repetir uma volta: 2. Outro status (`partial`) dentro da janela: nova linha. Duas antecedências de lembrete da mesma ocorrência: duas linhas. Contestar e desfazer em laço: 1 `proof_disputed`.
- SEG4-2: Eva chama `register_push_subscription` com o endpoint de Duda e chaves diferentes: `forbidden`, e a linha continua de Duda. Com as mesmas chaves: passa a ser de Eva. Duda com chaves novas no próprio endpoint: atualiza.
- SEG4-3: um papel com `proof.review` e sem acesso à tarefa (ou tarefa arquivada) não recebe `proof_in_review`.
- SEG4-5: inscrição com `created_at` de 91 dias e sem `last_success_at` sai; com `last_success_at` de 10 dias fica.
- Mutação em ao menos SEG4-1 e SEG4-2 (caminho crítico): desligar a checagem e ver o teste falhar.
