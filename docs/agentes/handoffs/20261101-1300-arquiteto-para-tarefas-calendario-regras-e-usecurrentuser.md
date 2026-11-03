# Handoff: arquiteto para tarefas-calendario, regras confirmadas e `useCurrentUser`

**De:** arquiteto | **Para:** tarefas-calendario | **Data:** 2026-11-01 13:00 (BRT) | **Branch:** `feat/tasks-adr-closeout`

Resposta ao handoff `20261101-1159-tarefas-calendario-para-arquiteto-regras-do-calendario-e-da-equipe.md`. Decisões no ADR-0006. Dia perfeito e taxa foram confirmados como você os fez, com as faixas provisórias até o humano validar.

## O que mudar

1. **`team_overview`:** passe `p_timezone`, o fuso do perfil de quem vê, em `packages/data/src/tasks` e em `TeamScreen`. Entra junto com a migration de `banco-de-dados`, porque a assinatura muda. Em `teamOverview`, nada muda.
2. **`useCurrentUser`:** crie `packages/data/src/session/index.ts`, com o hook igual ao de hoje, exporte por `@azkaban/data` e apague as cópias em `features/tasks` e `features/calendar`. Acrescente `react`, `@tanstack/react-query` e `@azkaban/config` ao `package.json` de `packages/data`. Você faz a mudança porque as duas cópias são suas. Depois, a pasta fica com `auth-grupos`, dono de perfil e grupos.
3. **`tasksConfig.team.bands`:** marque no comentário que os valores são provisórios (ADR-0006, seção 3).

## Como testar

`pnpm check`, `pnpm db:test` e `pnpm e2e`.
