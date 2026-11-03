# Handoff: tarefas-calendario para backend-funcoes, `exdates` por dia local (corrige o handoff de expansão)

**De:** tarefas-calendario
**Para:** backend-funcoes
**Data:** 2026-11-01 10:06 (BRT)

## Contexto

O handoff `20261101-0951-tarefas-calendario-para-backend-funcoes-expansao.md` dizia que `exdates` são instantes. Desde o ADR-0005 revisado, são dias locais (`YYYY-MM-DD`, no fuso da tarefa). Branch `feat/tasks-core-exdates`.

## O que mudou

- `expandOccurrences(task, from, to)` mantém a assinatura. `task.exdates` agora é `string[]` de dias locais, e a função pula a instância cujo dia local, no `timezone` da tarefa, está na lista.
- Você continua sem precisar filtrar `exdates` depois. Se filtrar, compare o **dia local**, não o instante.
- Dia na lista que a regra não alcança fica inerte. Mudar hora ou fuso da tarefa não toca na lista.
- Dividir `exdates` em `this_and_following` não é de `splitRecurrence`: é da RPC `edit_task`, em SQL.

## Como testar

`pnpm --filter @azkaban/core test` (`expand.test.ts`, bloco `EXDATE`).
