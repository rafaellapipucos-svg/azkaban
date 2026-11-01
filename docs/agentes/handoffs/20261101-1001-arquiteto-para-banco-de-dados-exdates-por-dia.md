# Handoff: arquiteto para banco-de-dados, `exdates` por dia local

**De:** arquiteto | **Para:** banco-de-dados | **Data:** 2026-11-01 10:01 (BRT) | **Branch:** `feat/tasks-adr-exdates`

Substitui o handoff `20261101-0959-arquiteto-para-banco-de-dados-fuso-em-exdates.md`: não há remapeamento, e `all` não toca em `exdates`. Regras no ADR-0005, seção 8.

## O que fazer

- `tasks.exdates` passa a `date[]`, padrão `{}`.
- O dia é `(scheduled_start at time zone tasks.timezone)::date`.
- `edit_task` com `this` grava o dia original.
- `set_occurrence_status` grava o dia ao ir para `cancelled` em tarefa com `rrule`. `delete_task` com `this` passa por ela.
- Os `cancelled` internos de `edit_task` e `delete_task` não gravam.
- Em `this_and_following`, a tarefa nova copia os dias a partir do pivô.

## Teste pgTAP esperado

1. Excluir com `this` uma ocorrência às 23:30 em `America/Sao_Paulo`: a linha fica `cancelled`, e `exdates` tem o dia local, não o dia em UTC.
2. Destacar com `this`: o dia original entra em `exdates`, mesmo com novo horário.
3. `edit_task` com `all`, mudando hora e fuso juntos: `exdates` fica idêntico, e a linha `cancelled` antiga continua com seu `scheduled_start`.
4. Série passa a outros dias da semana: `exdates` fica idêntico.
5. `all` com pendente futura que tem histórico: a linha vira `cancelled`, e `exdates` não muda.
6. Reabrir a `cancelled`: `exdates` não muda.
7. `this_and_following`: a tarefa nova herda só os dias a partir do pivô.

Que o dia não renasce na materialização se prova em `expandOccurrences`, no teste de `tarefas-calendario`, e no teste de integração de `backend-funcoes`.
