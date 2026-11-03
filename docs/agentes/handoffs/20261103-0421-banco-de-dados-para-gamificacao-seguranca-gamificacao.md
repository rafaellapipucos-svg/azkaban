# Handoff: banco-de-dados para gamificacao, segurança da gamificação

**De:** banco-de-dados
**Para:** gamificacao
**Data:** 2026-11-03 04:21 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/gamification-db-security`, a partir de `feat/phase-6-gamification` (`6bb8f33`)

## Contexto

Migrations do SEG6-1 a SEG6-5 (ADR-0010, seção 14). A troca do ranking precisa entrar junto com a sua mudança no repositório: sem ela, `getGroupRanking` manda `p_timezone` e o PostgREST não acha a função.

## Assinaturas finais

- `group_ranking(p_group_id uuid, p_week_start date)` devolve `(user_id uuid, display_name text, xp int, rank int)`, como antes. A de três argumentos foi removida. O fuso é o do perfil de quem chama, lido no servidor.
- Erros, em ordem: `forbidden` (42501, não membro); `invalid_argument` (22023, `p_week_start` nulo, fora de `ranking.weekStartsOn`, depois da semana corrente ou antes de `corrente − 7 × (maxWeeks − 1)`, tudo no fuso do perfil); `ranking_disabled` (P0001).
- A soma começa em `greatest(início da semana, groups.ranking_enabled_at, joined_at de quem chama)`. Quem acabou de entrar vê a semana vazia até ganhar XP; a tela pode precisar de um estado vazio que não sugira erro.
- `groups.ranking_enabled_at timestamptz` existe e aparece em `database.types.ts`, mas é escrita só por trigger e fica fora do `grant`: o cliente não manda a coluna nem a lê.
- `database.types.ts` regenerado neste branch (assinatura nova do ranking, coluna nova, `refresh_user_day` removida, `gamification_history_floor` nova).

## O que o destinatário precisa fazer

1. `packages/data/src/gamification/index.ts`: chamar `group_ranking` só com `p_group_id` e `p_week_start`, e tirar `timezone` de `groupRankingInputSchema`.
2. A semana pedida tem de ser a corrente ou a anterior, começando em `gamificationRules.ranking.weekStartsOn`, calculada no fuso do perfil (não no do aparelho, se forem diferentes: o servidor usa o do perfil).
3. `capRoom` e `useCapReached`: janela móvel de `xp.capWindowHours` (24 h) antes de agora, sem fuso, e saldo por `(occurrenceId ?? id, groupId)` com piso zero em cada par.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:reset`, `pnpm db:test` (`rls_gamification_security.test.sql` cobre o ranking novo) e o seu teste do repositório.
