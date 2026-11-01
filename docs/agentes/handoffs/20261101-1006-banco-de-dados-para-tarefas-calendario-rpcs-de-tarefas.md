# Handoff: banco-de-dados para tarefas-calendario, RPCs e leituras de tarefas (F2-2)

**De:** banco-de-dados
**Para:** tarefas-calendario
**Data:** 2026-11-01 10:06 (BRT)

## Contexto

Banco da Fase 2 pronto na branch `feat/tasks-db` (a partir de `feat/phase-2-tasks`, já com `3fc37db` e `cfce952`). Regras no ADR-0005. Tipos gerados em `packages/data/src/database.types.ts`.

## O que foi entregue

Tabelas `tasks`, `task_occurrences`, `task_status_history`, `xp_events`, `app_settings`, `occurrence_transitions`; as 5 chaves de permissão; triggers de `overdue_at`, de ocorrência única, de transição, de histórico e de XP; RPCs; cron.

## Contratos (banco)

**Leitura (RLS, sem RPC).** `select` direto, com join pelas chaves estrangeiras (`task_occurrences -> tasks -> contexts`). Todas as colunas de `tasks`, `task_occurrences`, `task_status_history` e `xp_events` são legíveis para `authenticated`; a RLS filtra. Para `OccurrenceListItem` basta `task_occurrences` com `tasks(...)` e `contexts(area_id)`.

**Criar tarefa.** `insert` em `tasks` com as colunas: `context_id, assignee_id, title, notes, schedule_type, start_at, due_at, duration_min, timezone, rrule, reminders, requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility`. `created_by` vem do padrão `auth.uid()`; `group_id` é preenchido por trigger. Todas as colunas do formulário são obrigatórias (sem padrão no banco), `reminders` inclusive (`[]`). Tarefa avulsa (`rrule` nula) ganha sua ocorrência no trigger; recorrente espera `materialize-occurrences`. Em lote, um `insert` com várias linhas.

**`set_occurrence_status(p_occurrence_id uuid, p_to_status occurrence_status, p_expected_status occurrence_status, p_reason text) returns task_occurrences`**
Erros (a mensagem é o código): `forbidden` (42501; também para ocorrência inexistente ou invisível, e tarefa arquivada), `status_conflict` (P0001), `invalid_transition` (23514), `reason_required` (22023), `late_window_expired` (P0001). Ordem: visibilidade, conflito, par válido, arquivada, ator, motivo, janela.

**`edit_task(p_occurrence_id uuid, p_scope task_edit_scope, p_task jsonb, p_rrule text, p_head_rrule text) returns uuid[]`**

- `p_task`: o formulário inteiro com as chaves camelCase de `TaskInput`, sem `recurrence`: `title, notes, contextId, assigneeId, scheduleType, startAt, dueAt, durationMin, timezone, reminders, requiresPhotoProof, requiresAdminApproval, requiresPartialReason, difficulty, priority, visibility`. Chave ausente vira erro de not null.
- `p_rrule`: a regra da parte editada, já pronta; **nula significa que a tarefa deixa de repetir**. Mande sempre a regra completa, também em `all` sem mudança de agenda (o banco compara a string para saber se a agenda mudou, então ela precisa ser estável).
- `p_head_rrule`: só em `this_and_following`; nulo equivale a `all`.
- `startAt`/`dueAt` do formulário são a âncora da série em `all` e `this_and_following`, e o instante da ocorrência em `this`.
- Devolve os `task_id` para chamar `materialize-occurrences` (vazio quando não há o que materializar).
- Erros: `forbidden`, `occurrence_not_pending` (P0001; `this` em não pendente, ou mudar a agenda de uma avulsa não pendente), `invalid_task` (22023), e os de integridade do trigger: `assignee_not_member` (22023), `personal_context_requires_private_self` (23514), `context_change_not_allowed` (23514), `context_not_found` (23503), fuso inválido (22023), violações de `check`.
- `exdates` é `date[]` (dias locais no fuso da tarefa): `this` grava o dia original; `all` nunca o toca; `this_and_following` repassa à tarefa nova só os dias a partir do pivô.

**`delete_task(p_occurrence_id uuid, p_scope task_edit_scope, p_head_rrule text) returns void`**
`this` passa por `set_occurrence_status` (erros `invalid_transition` e `forbidden`; grava o dia em `exdates` se a tarefa for recorrente). Em tarefa avulsa, `this` só cancela a ocorrência; `this_and_following` sem `p_head_rrule` equivale a `all` (arquiva).

**`team_overview(p_group_id uuid, p_from date, p_to date)`** devolve `user_id, display_name, date, pending, done, partial, missed, late`. Erros: `forbidden`, `invalid_range` (22023; `p_to < p_from` ou mais de 366 dias).

Funções de apoio chamáveis: `can_view_task(uuid)`, `can_edit_task(uuid)`, `can_delete_task(uuid)`.

## O que o destinatário precisa fazer

- Repositórios em `packages/data` que mapeiam estas chamadas e os códigos de erro para `taskErrorCodeSchema` / i18n. Os erros de integridade do trigger não estão em `taskErrorCodeSchema`: o arquiteto decide se entram.
- Depois de `edit_task`, chamar `materialize-occurrences` com os `taskIds` devolvidos.
- `edit_task`/`delete_task` não aceitam tarefa arquivada (`forbidden`).

## Bloqueios e dúvidas

Veja Riscos no relatório do `banco-de-dados`: "futuras" em `all` é `scheduled_start >= now()`; a razão (`status_reason`) é limpa ao reabrir.

## Como testar

`pnpm db:reset`, `pnpm db:test` (`supabase/tests/rls_tasks.test.sql`, 277 asserts), `pnpm db:check-permissions`.
