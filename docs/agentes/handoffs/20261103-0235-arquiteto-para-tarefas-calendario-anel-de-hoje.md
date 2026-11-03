# Handoff: arquiteto para tarefas-calendario, anel de Hoje

**De:** arquiteto
**Para:** tarefas-calendario
**Data:** 2026-11-03 02:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/gamification-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

[ADR-0010](../../adr/0010-gamificacao-xp-ofensiva-conquistas-ranking.md), seção 10. O anel de Hoje passa a ser a meta diária da ofensiva, a mesma que o banco conta.

## O que fazer

Depois de F6-1 (`gamificacao`) publicar `dailyGoal` e `dayCounts` em `packages/core/src/gamification`:

- O anel conta as ocorrências cujo `occurrenceDay` é hoje, **inclusive as que estão em "Atrasadas"**, e não só `plan.today`. Hoje um prazo que vence às 10h sai do anel às 11h, e o anel melhora sozinho.
- Mostra `completed` de `needed` (`dailyGoal`, com `gamificationRules.goal`), cheio quando a meta é cumprida; o amarelo conta.
- `TodayScreen` ganha um slot para a ofensiva no cabeçalho, ao lado de `headerRight`; a rota o preenche com o `StreakChip` de `gamification`.
- `plan.goal` em `planToday` sai ou passa a usar o core novo; a escolha é sua.

## Paralelo e dependências

Depende de F6-1. Pequeno.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm check`; um prazo vencido hoje continua no anel como não cumprido.
