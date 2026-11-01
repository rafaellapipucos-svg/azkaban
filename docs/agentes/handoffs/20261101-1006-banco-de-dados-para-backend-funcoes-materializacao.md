# Handoff: banco-de-dados para backend-funcoes, materialização (F2-5)

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-01 10:06 (BRT)

## Contexto

Banco da Fase 2 na branch `feat/tasks-db`. Complementa o handoff do arquiteto sobre `materialize-occurrences`.

## O que foi entregue

- `tasks.exdates` é `date[]`: **dias locais no fuso da tarefa** (`(instante at time zone tasks.timezone)::date`), não instantes. A expansão pula a instância cujo dia local está na lista (ADR-0005, seção 8).
- `task_occurrences`: insira só `task_id, assignee_id, scheduled_start, scheduled_due`. `overdue_at` é calculado por trigger, `status` começa `pending`. Único em `(task_id, scheduled_start)`: use `on conflict (task_id, scheduled_start) do nothing`.
- `scheduled_due`: tarefa `timed` = início + `duration_min` (ou o início, sem duração); `all_day` = meia-noite local seguinte; `deadline` = `due_at`. O banco aplica a mesma regra à ocorrência única de tarefa avulsa (`occurrence_window`, interna).
- `tasks.materialized_until timestamptz`: o `edit_task` o zera para `now()` quando a agenda de uma série muda. `edit_task` apaga ou cancela as pendentes futuras e devolve os `task_id` para você materializar.
- Cron: migration `20261101130900_materialize_cron.sql` cria `public.call_materialize_occurrences()` e o job `materialize-occurrences-daily` (`0 6 * * *`, UTC). Lê do Vault `materialize_url` e `cron_secret`; sem os dois, não faz nada. Envia `POST` com corpo `{}` e headers `Content-Type: application/json` e `x-cron-secret`. Os segredos do Vault são seus/do deploy; a migration não os cria.
- Tarefas arquivadas (`archived_at`) e de quem saiu do grupo ficam por sua conta ignorar (o banco não impede o insert por service role).
- Job de vermelho (F4-6): um `update task_occurrences set status = 'missed'` basta. O trigger valida o par, escreve histórico (`changed_by` nulo) e XP.

## Como testar

`pnpm db:test`: bloco "Excluded days" e "service role" em `supabase/tests/rls_tasks.test.sql`.
