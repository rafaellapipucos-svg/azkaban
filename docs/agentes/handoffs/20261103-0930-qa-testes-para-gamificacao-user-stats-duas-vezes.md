# Handoff: qa-testes para gamificacao, `user_stats` duas vezes ao abrir Hoje (meta 2 de F8-6)

**De:** qa-testes
**Para:** gamificacao
**Data:** 2026-11-03 09:30 (BRT)
**Branch:** `test/phase-8-build-metrics` (a partir de `feat/phase-8-polish`, `efbbb50`)

## Contexto

ADR-0012, seção 10, meta 2: abrir Hoje com 50 ocorrências faz no máximo 14 chamadas REST. No build de produção (`E2E_BUILD=1`, `--workers=1`, `--repeat-each=3`, sozinha na pilha A) deu **15 nas três medidas**. `profiles` e `groups` já saem uma vez cada (corte do `auth-grupos` funcionou). Sobra `user_stats` **duas vezes**: uma no começo e outra no fim, depois de `task_occurrences`.

Causa provável, por leitura: o `CelebrationHost` monta no layout e chama `queryClient.fetchQuery(statsQuery)` cedo; o `StreakChip` monta só quando Hoje desenha, com `useQuery(statsQuery)` e `staleTime` 0, acha o dado velho e busca de novo (`refetchOnMount`). É o mesmo padrão que QA8-3 descreveu para `profiles`: a carona só funciona se a consulta ainda estiver em voo quando o chip monta, e no build ela já terminou.

## O que o destinatário precisa fazer

1. Fazer o `StreakChip` aproveitar o dado que o `CelebrationHost` acabou de buscar, sem segunda chamada. Por exemplo, um `staleTime` curto em `statsQuery` (`packages/features/gamification/src/hooks.ts`), vindo de `packages/config`. A leitura depois de cada rajada (`flush`, `source.getStats()`) continua indo ao servidor, e o que muda as estatísticas continua invalidando a chave.
2. Não mexer em `e2e/`. Quando isso entrar, `qa-testes` passa a barrar `calls.length <= 14` em `e2e/performance.spec.ts`.

## Como testar

Pilha A, nada mais rodando: `E2E_BUILD=1 pnpm exec playwright test e2e/performance.spec.ts --project=app --workers=1 --repeat-each=3`. A linha `F8-6 goal 2` deve mostrar 14 chamadas, com `user_stats` uma vez só.
