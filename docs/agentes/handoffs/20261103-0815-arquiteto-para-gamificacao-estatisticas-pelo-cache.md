# Handoff: arquiteto para gamificacao, ponto de partida do `CelebrationHost` pelo cache (QA8-3)

**De:** arquiteto
**Para:** gamificacao
**Data:** 2026-11-03 08:15 (BRT)
**Branch:** `docs/phase-8-perf-decisions`

## Contexto

ADR-0012, seção 10, meta 2 (agora 14 chamadas REST ao abrir Hoje). `user_stats` sai duas vezes: o `StreakChip` pela consulta `[...gamificationKey, 'stats']` e o `CelebrationHost` por `source.getStats()` direto, no ponto de partida.

## O que o destinatário precisa fazer

- No `CelebrationHost`, o ponto de partida (`before`) usa `queryClient.fetchQuery({ queryKey: [...gamificationKey, 'stats'], queryFn: source.getStats })`, que pega carona na consulta em voo do `StreakChip`.
- A leitura depois de cada rajada (`flush`) continua indo ao servidor: ela precisa do valor novo.
- Os quatro `xp_events` e `user_achievements` do marco e do `catchUp` ficam como estão (ADR).

## Como testar

`pnpm check`. Na pilha A, `pnpm exec playwright test e2e/performance.spec.ts e2e/gamification.spec.ts --project=app`: `user_stats` uma vez ao abrir Hoje, e as comemorações como antes.
