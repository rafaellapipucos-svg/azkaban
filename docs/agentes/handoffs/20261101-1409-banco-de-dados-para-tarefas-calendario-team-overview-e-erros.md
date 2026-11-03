# Handoff: banco-de-dados para tarefas-calendario, `team_overview` com fuso e novos erros

**De:** banco-de-dados
**Para:** tarefas-calendario
**Data:** 2026-11-01 14:09 (BRT)

## Contexto

Branch `feat/tasks-db-security`. Segue o ADR-0006, seção 1, e a revisão de segurança da Fase 2.

## Contratos (banco)

**`team_overview(p_group_id uuid, p_from date, p_to date, p_timezone text)`**: a assinatura antiga de 3 argumentos foi removida. Mesmo retorno (`user_id, display_name, date, pending, done, partial, missed, late`). O dia é o dia local em `p_timezone`; `deadline` conta em `scheduled_due`, os demais em `scheduled_start`. Erros: `forbidden` (42501), `invalid_range` (22023; inclui `p_timezone` nulo) e, para fuso desconhecido, o 22023 do próprio Postgres (`time zone "..." not recognized`).

Mudança mínima que já fiz em `packages/data/src/tasks/index.ts`: `tasksRepository.teamOverview` ganhou `timezone?: string` (padrão: fuso do aparelho) e envia `p_timezone`. A `TeamScreen` não mudou. Falta passar o fuso do perfil.

**Novos erros** (mensagem = código):

| Mensagem                     | SQLSTATE | Quando                                                                               |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `invalid_rrule`              | 22023    | `edit_task`/`delete_task` com `p_rrule` ou `p_head_rrule` fora da gramática          |
| `invalid_timezone`           | 22023    | `tasks.timezone` fora de `pg_timezone_names` (antes: `time zone "x" not recognized`) |
| `context_archived`           | 23514    | tarefa nova (insert, `this`, `this_and_following`) em contexto arquivado             |
| `context_change_not_allowed` | 23514    | a tarefa nova de `this`/`this_and_following` com contexto de outro grupo ou dono     |

Outras mudanças de comportamento: `can_view_task` não mostra mais tarefa privada a quem só tem uma ocorrência dela; `delete_task` com `all` só arquiva descendentes que quem exclui pode excluir; datas só entre 2000 e 2100 (`tasks_dates_check`, 23514); `tasks.rrule` só com a gramática de `toRRule` (`tasks_rrule_grammar_check`, 23514).

## Como testar

`pnpm db:reset`, `pnpm db:test`.
