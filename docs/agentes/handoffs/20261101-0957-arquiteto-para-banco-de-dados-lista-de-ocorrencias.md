# Handoff: arquiteto para banco-de-dados, leitura de `OccurrenceListItem`

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-01 09:57 (BRT)

## Contexto

`tarefas-calendario` precisou de mais campos na lista de ocorrências. Complementa o handoff `20261101-0935-arquiteto-para-banco-de-dados-tarefas.md` para `feat/tasks-db`.

## O que foi entregue

Branch `feat/tasks-contracts-list`, a partir de `feat/phase-2-tasks`.

## Contratos criados ou alterados

`OccurrenceListItem.task` ganhou `groupId`, `createdBy`, `assigneeId` e `difficulty`. O ADR-0005, seção 4, deixa explícito qual responsável vale para cada ator.

## O que o destinatário precisa fazer

**Leitura.** A lista é um `select` em `task_occurrences` com join em `tasks` e `contexts`, pelas chaves estrangeiras, sem RPC nova. Qualquer visão ou RPC de leitura que você criar para isso deve devolver, além das colunas da ocorrência:

| Coluna                          | Campo do contrato            |
| ------------------------------- | ---------------------------- |
| `tasks.title`                   | `task.title`                 |
| `tasks.context_id`              | `task.contextId`             |
| `tasks.group_id`                | `task.groupId` (novo)        |
| `tasks.created_by`              | `task.createdBy` (novo)      |
| `tasks.assignee_id`             | `task.assigneeId` (novo)     |
| `tasks.schedule_type`           | `task.scheduleType`          |
| `tasks.timezone`                | `task.timezone`              |
| `tasks.priority`                | `task.priority`              |
| `tasks.difficulty`              | `task.difficulty` (novo)     |
| `tasks.visibility`              | `task.visibility`            |
| `tasks.rrule`                   | `task.rrule`                 |
| `tasks.requires_partial_reason` | `task.requiresPartialReason` |
| `contexts.area_id`              | `areaId`                     |

Se `tasks` tiver `select` por coluna, inclua todas estas.

**Atores.** `can_edit_task` e `can_delete_task` comparam com `tasks.assignee_id`. O ator `assignee`, em `set_occurrence_status`, compara com `task_occurrences.assignee_id`. Depois de uma reatribuição por `all`, quem resolveu uma ocorrência antiga ainda a reabre como `assignee`, mas não edita a tarefa.

Nada mais muda: as outras decisões do ADR-0005 afetam só a string RRULE que o cliente envia.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:test`, com um caso de reatribuição por `all`: o antigo responsável reabre a ocorrência que resolveu e recebe `forbidden` ao editar a tarefa.
