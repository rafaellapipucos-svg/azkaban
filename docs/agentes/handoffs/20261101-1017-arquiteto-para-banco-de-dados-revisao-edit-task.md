# Handoff: arquiteto para banco-de-dados, correções em `edit_task`

**De:** arquiteto | **Para:** banco-de-dados | **Data:** 2026-11-01 10:17 (BRT) | **Branch:** `feat/tasks-adr-db-review`

Revisão das migrations `20261101130*`. As decisões relatadas foram confirmadas no ADR-0005, seção 8, com três correções. Nova migration com `create or replace function public.edit_task`. Não edite a migration existente.

## O que mudar

1. **Bug reproduzido: deixar de repetir.** Em `all` com `t.rrule` preenchida e `p_rrule` nulo, as pendentes passadas ficam ao lado da nova. A edição seguinte falha com `23505` em `task_occurrences_task_id_scheduled_start_key`, vinda de `tasks_after_update`. Reproduzi em transação com `rollback`. Nesse caso, o `delete` e o `update` para `cancelled` alcançam todas as pendentes, com a condição `(p_rrule is null or scheduled_start >= now())`.
2. **Um dia, uma ocorrência.** Depois dos `delete` e `cancelled`, com `p_rrule` não nulo, em `all` com agenda mudada e em `this_and_following`, acrescente a `exdates` da tarefa que manteve as linhas (`t.id` ou `new_id`), sem repetir, os dias `(scheduled_start at time zone t.timezone)::date` das linhas dela com `status <> 'cancelled'` e dia `>= (now() at time zone t.timezone)::date`.
3. **Reatribuir.** No ramo `not changed`, troque `scheduled_start >= now()` por `overdue_at > now()`.

## Teste pgTAP esperado

- Série que deixa de repetir com pendente passada: resta uma pendente, e uma segunda edição de agenda e de responsável passa.
- Às 10h, ocorrência de hoje às 9h pendente e amanhã às 9h: `all` para 15h mantém a linha de hoje e grava só o dia de hoje em `exdates`.
- O mesmo com a de hoje `done`, e com uma `done` em dia futuro.
- A linha de hoje `cancelled` pelo sistema não grava nada.
- `this_and_following` com pivô `done` e hora nova: o dia do pivô entra em `exdates` da tarefa nova.
- Reatribuir sem mudar a agenda: prazo já iniciado e no prazo passa ao novo responsável, e uma pendente com `overdue_at` vencido fica.

Os testes `exdates 3` e `exdates 4`, "a lista fica igual", seguem válidos se não houver linha resolvida de hoje em diante. Ajuste-os se houver.

Não mude nada mais: `backend-funcoes` e `packages/core` não são afetados.
