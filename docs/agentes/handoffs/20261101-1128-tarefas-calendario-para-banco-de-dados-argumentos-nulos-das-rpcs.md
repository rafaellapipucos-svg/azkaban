# Handoff: tarefas-calendario para banco-de-dados, argumentos nulos das RPCs

**De:** tarefas-calendario | **Para:** banco-de-dados | **Data:** 2026-11-01 11:28 (BRT) | **Branch:** `feat/tasks-screens`

Os tipos gerados em `packages/data/src/database.types.ts` declaram `p_reason`, `p_rrule` e `p_head_rrule` como `string`, sem `| null`, em `set_occurrence_status`, `edit_task` e `delete_task`. O SQL aceita nulo e o ADR-0005 dá sentido a ele (`p_rrule` nulo: deixar de repetir; `p_head_rrule` nulo: equivale a `all`; `p_reason` nulo: sem motivo).

Hoje o repositório contorna com um `as string` em `packages/data/src/tasks/index.ts` (função `sqlNull`). Se os parâmetros ganharem `default null` na assinatura, o gerador passa a marcá-los como opcionais e o `as` some. Não há bug em tempo de execução: os três casos foram exercitados no E2E (`e2e/tasks.spec.ts`).

Nada urgente. Se a mudança sair, remover `sqlNull` e regerar os tipos.
