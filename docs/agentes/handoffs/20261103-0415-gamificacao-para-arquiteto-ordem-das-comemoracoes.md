# Handoff: gamificacao para arquiteto, ordem das comemorações

**De:** gamificacao
**Para:** arquiteto
**Data:** 2026-11-03 04:15 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/gamification-client-security`, a partir de `feat/phase-6-gamification`

## Contexto

QA6-2: quando a mesma rajada trazia conquista ou subida de nível, `celebrationsFor` punha o `perfect_day` atrás delas, e a tela de dia perfeito não abria. Isso acontecia logo no primeiro dia perfeito de uma conta nova (com "Primeira tarefa") e ao conceder "Semana perfeita".

## Contratos criados ou alterados

Nenhum. A regra mudou em `packages/core/src/gamification/celebrations.ts`: o `perfect_day` vem sempre primeiro, e os outros seguem a ordem de `celebrationKindSchema`, viram linhas no `detail` da tela, e o maior vem antes.

## O que o destinatário precisa fazer

No ADR-0010, seção 8, trocar "Juntos, mostra o maior e lista os outros" por algo como: "Juntos, o dia perfeito ganha a tela inteira e lista os outros; sem ele, mostra o maior e lista os outros."

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm --filter @azkaban/core exec vitest run src/gamification/celebrations.test.ts`.
