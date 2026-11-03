# Handoff: banco-de-dados para gamificacao, F6-2 no banco

**De:** banco-de-dados
**Para:** gamificacao
**Data:** 2026-11-03 03:28 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/gamification-db`, a partir de `feat/phase-6-gamification` (`293bfe7`)

## O que existe no banco

- Tabelas, só leitura do dono pela RLS: `user_stats`, `user_day_stats`, `user_achievements`; `achievements` para todo autenticado. Colunas em snake_case dos schemas de `packages/contracts/src/gamification.ts`. Sem linha em `user_stats` é tudo zero; sem linha em `user_day_stats` o dia é vazio.
- `xp_events.local_date` e os quatro motivos novos. `proof_bonus` é um evento à parte, com o mesmo `occurrence_id` e `group_id` do base.
- Realtime: `xp_events` e `user_achievements` estão na publicação `supabase_realtime`. A RLS é do dono, então o canal só entrega os próprios inserts.
- RPC `group_ranking(p_group_id uuid, p_week_start date, p_timezone text)` devolve `(user_id, display_name, xp, rank)`, ordenado por `rank`. Erros: `forbidden` (42501) para quem não é membro atual; `ranking_disabled` (P0001) com o ranking desligado; zona desconhecida dá o 22023 do Postgres. `groups.settings.rankingEnabled`, se existe, precisa ser booleano (`check`).
- `total_xp`, ofensiva, proteções, `perfect_run` e conquistas são mantidos pelo banco no trigger de status e pelo job `close-gamification-days` (a cada 15 minutos). A tela só lê.

## O que muda para o core: `capRoom` diverge do banco

O caso do arquiteto (reabrir hoje 300 pontos de ontem e concluir 21 tarefas difíceis) dá **600** com a fórmula do ADR aplicada a cada conclusão: o `least` limita uma conclusão, mas o saldo do dia vai de −300 a 300 ao longo delas. O pgTAP derrubou isso (mutação M1 do relatório). O banco passou a somar o saldo do dia **contando cada ocorrência no mínimo zero**:

```sql
saldo = sum(greatest(0, saldo da ocorrência hoje))   -- agrupado por coalesce(occurrence_id, id do evento)
espaço = least(teto, greatest(0, teto − saldo))
```

Reabrir uma conclusão de hoje ainda libera espaço (a ocorrência fica em zero); reabrir uma de ontem não vira crédito. Para a tela não mostrar espaço que o banco não dá, `capRoom` precisa da mesma regra: agrupar os eventos de hoje por `occurrenceId` (o `id` do evento quando é nulo), somar cada grupo e piso zero antes de somar. Os eventos chegam com `occurrenceId` pela RLS. Um teste: eventos `[{occ A, +300 ontem}]` não entram; hoje `[{A, −300}, {B, +30}]` dá saldo 30, espaço 270.

## Para testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test` (`supabase/tests/rls_gamification.test.sql`).
