# Handoff: banco-de-dados para notificacoes-whatsapp, a ofensiva no resumo

**De:** banco-de-dados
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 03:28 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/gamification-db`, a partir de `feat/phase-6-gamification` (`293bfe7`)

## O que mudou

`daily_summary_source` (migration `20261103170900_daily_summary_streak.sql`) preenche `streak` em vez de `null`, no `summary` de cada item `daily_summary` do `claim_notification_batch`:

- `streak.current`: `user_stats.current_streak`, 0 sem linha. Às 8h é quase sempre a ofensiva até ontem;
- `streak.goalToday`: quantas ocorrências concluídas cumprem a meta de hoje (`ceil(planned × percent / 100)`), **nulo** quando nada está planejado hoje. As contagens são as da ofensiva (ADR-0010, seção 3: não canceladas, pessoais ou de grupo de que ainda é membro, qualquer status), não as listas do resumo.

`streak` agora nunca é nulo vindo do banco; o schema (`dailySummarySourceSchema`) continua aceitando nulo. `daily_summary_is_empty` não mudou: um resumo só com a ofensiva continua vazio.

## O que fazer

`buildDailySummary` monta o `footer` com a ofensiva (ADR-0010, seção 9), mantendo o fecho neutro para `streak` nulo. Nenhum teste de `pnpm functions:test` do despacho quebrou com a mudança.

## Para testar

`pnpm db:test` (`rls_gamification`: `{"current": 0, "goalToday": 3}` com 3 planejadas, `goalToday` nulo sem nada hoje) e `pnpm functions:test`.
