# Handoff: arquiteto para gamificacao, segurança da gamificação

**De:** arquiteto
**Para:** gamificacao
**Data:** 2026-11-03 04:00 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `docs/gamification-security-decisions`, a partir de `feat/phase-6-gamification` (`8e6fe77`)

## Contexto

Decisões da revisão de segurança da Fase 6, na seção 14 do ADR-0010. O `banco-de-dados` implementa o lado do banco em paralelo (`20261103-0400-arquiteto-para-banco-de-dados-seguranca-gamificacao`).

## Contratos criados ou alterados

- `gamificationRules.xp.capWindowHours` (24), `gamificationRules.ranking.weekStartsOn` (1) e `ranking.maxWeeks` (2), `gamificationRules.historyDays` (400).
- `gamificationDefaults.rankingWeekStartsOn` aponta para `gamificationRules.ranking.weekStartsOn` até você trocar o uso; depois, apague-o.
- `groupRankingInputSchema` perde `timezone`: **você remove o campo em `packages/contracts/src/gamification.ts`** no mesmo commit do repositório (delegação do `arquiteto`, só esta linha e o comentário dela), para o build não quebrar.

## O que o destinatário precisa fazer

1. **SEG6-1, `capRoom` e `useCapReached`.** A janela é móvel: pedir os eventos desde `now − capWindowHours` em vez da meia-noite do fuso (`zonedInstant` sai daqui). A chave da consulta não pode ser só o dia; reconsulte ao chegar evento e periodicamente, porque o espaço volta conforme eventos saem da janela. O texto do aviso fala em "últimas 24 horas" (i18n). `capRoom` pode seguir recebendo os eventos já filtrados.
2. **SEG6-3, `capRoom`.** Agrupar por `occurrenceId ?? id` **e** `groupId`. `listCapEventsSince` precisa selecionar `group_id`. Teste: `[(A, null) −30, (A, G) +30]` deixa 270; mutação sem o `groupId` derruba.
3. **SEG6-4, ranking.** `groupRanking` chama `group_ranking` com `p_group_id` e `p_week_start`, sem `p_timezone`; `useRanking` usa `gamificationRules.ranking.weekStartsOn`. Se a tela quiser a semana anterior, só `maxWeeks − 1` para trás. Quem entrou no grupo nesta semana vê só o XP desde a entrada; um texto curto no estado vazio basta.
4. **E2E** de `e2e/gamification.spec.ts`: o teto atingido segue sem evento; ajuste se dependia da meia-noite.

## Bloqueios e dúvidas

O passo 3 só funciona com a migration do banco; integrem juntos.

## Como testar

`pnpm check`; `pnpm --filter @azkaban/core exec vitest run src/gamification/xp.test.ts`; com a pilha, a E2E da gamificação.
