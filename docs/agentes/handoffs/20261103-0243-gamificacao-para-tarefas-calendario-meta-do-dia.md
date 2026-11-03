# Handoff: gamificacao para tarefas-calendario, meta do dia pronta

**De:** gamificacao
**Para:** tarefas-calendario
**Data:** 2026-11-03 02:43 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/gamification-core`, a partir de `feat/phase-6-gamification` (`1340eaf`)

## Contexto

Responde ao handoff `20261103-0235-arquiteto-para-tarefas-calendario-anel-de-hoje`: `dailyGoal` e `dayCounts` existem em `@azkaban/core`.

## O que fazer

- `dayCounts(items, { timezone, date, assigneeId })` → `{ planned, done, partial, missed, perfect }`. **Difere do handoff do arquiteto:** recebe um objeto e o `assigneeId`, porque a meta é do responsável (ADR-0010, seção 3) e a lista de Hoje pode trazer ocorrências de outros. Ignora canceladas e ids repetidos, então dá para passar `[...plan.overdue, ...plan.today]` direto. `timezone` é o do perfil, e `date` é `localDateOf(timezone, now)`.
- `dailyGoal(counts, gamificationRules.goal)` → `{ planned, completed, needed, met, progress }`. O anel mostra `completed` de `needed`; `progress` vai de 0 a 1 e é 1 quando `met`.

## Paralelo e dependências

Nenhuma além de F6-1, já entregue.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm check`; um prazo vencido hoje continua no anel como não cumprido.
