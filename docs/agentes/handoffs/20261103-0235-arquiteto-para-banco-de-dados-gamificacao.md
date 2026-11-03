# Handoff: arquiteto para banco-de-dados, gamificação da Fase 6

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 02:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/gamification-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

A gamificação está decidida no [ADR-0010](../../adr/0010-gamificacao-xp-ofensiva-conquistas-ranking.md). Isto é F6-2, que no QUADRO depende de F6-1, mas não precisa: o ADR traz as regras e os casos canônicos, e você e `gamificacao` trabalham ao mesmo tempo. O banco é o único escritor de tudo aqui.

## O que foi entregue

- ADR-0010.
- `packages/config/src/gamification.ts`: `gamificationRules` (**espelho**, chave `gamification_rules`) e `gamificationDefaults` (sem espelho).
- `packages/contracts/src/tasks.ts`: `xpEventReasonSchema` com `proof_bonus`, `perfect_day`, `perfect_day_reverted` e `shopping_completed`; `cappedXpEventReasons`; `xpEventSchema.localDate`.
- `packages/contracts/src/gamification.ts`: `userStatsSchema`, `userDayStatsSchema`, `achievementKindSchema`, `achievementSchema`, `userAchievementSchema`, `groupRankingInputSchema`, `groupRankingRowSchema`, `rankingErrorCodeSchema`.
- `packages/contracts/src/groups.ts`: `groupSettingsSchema` (`rankingEnabled` opcional).
- `scripts/check-permission-mirror.mjs` já compara `gamification_rules`; acusa a chave ausente até a sua migration.

## O que fazer

Uma migration por mudança, com pgTAP. Seções do ADR entre parênteses.

1. **Espelho:** `app_settings.gamification_rules` = `gamificationRules`.
2. **`xp_events`** (1): `local_date date`; `check` de `reason` com os quatro motivos novos; `check` de que `local_date` é preenchida exatamente em `perfect_day` e `perfect_day_reverted`; índices `(user_id, created_at)` e `(group_id, created_at)`.
3. **`occurrence_award_xp`** (1 e 2): depois da compensação, `pg_advisory_xact_lock` por usuário; espaço no teto = `least(dailyCap, greatest(0, dailyCap − saldo dos motivos com teto gravados hoje no fuso do perfil))` (atualizado em 2026-11-03: o espaço nunca passa do teto, nem quando uma compensação de XP de outro dia deixa o saldo de hoje negativo; é a fórmula de `capRoom`); base com `min(base, espaço)`; `proof_bonus` com o que sobrar, só em `done` com `current_proof_id`. `in_review` segue sem nada. A lista dos motivos com teto é `cappedXpEventReasons`.
4. **Tabelas** (4, 5 e 7): `user_stats` (`userStatsSchema`), `user_day_stats` (`userDayStatsSchema`, chave `(user_id, local_date)`), `achievements` com seed da seção 5, `user_achievements` (chave `(user_id, achievement_key)`). RLS: select só do dono nas três do usuário, select para `authenticated` em `achievements`; nenhuma escrita do cliente; cascata por `user_id`.
5. **`total_xp`** (4): trigger `after insert` em `xp_events`, upsert somando `amount`.
6. **`refresh_user_day(user, date)`, `refold_streak(user, from)` e `grant_achievements(user)`** (3, 4 e 5): chamadas no `after update of status` de `task_occurrences`, para o dia da ocorrência no fuso do perfil do responsável (`scheduled_due` em `deadline`, `scheduled_start` nos outros). Contagens: não canceladas, tarefa pessoal ou grupo de que ainda é membro, `in_review` como `done`. Conta inteira para a meta. Bônus do dia por conciliação com o saldo de `local_date`, nunca em dia futuro.
7. **Job** (4): `close_gamification_days()`, pg_cron a cada 15 minutos, lote de `closeJob.batchSize`, `for update skip locked`, até `maxCatchUpDays` para trás, `last_closed_date` só avança.
8. **Ranking** (6): `check` em `groups.settings` de que `rankingEnabled`, se existe, é `boolean`; função interna "ranking ligado" com o padrão por tipo; RPC `group_ranking(p_group_id, p_week_start, p_timezone)`, `security definer`, levantando `forbidden` e `ranking_disabled`, devolvendo só membros atuais com saldo positivo e `rank()`.
9. **Realtime** (8): `xp_events` e `user_achievements` na publicação `supabase_realtime`; confira que a RLS filtra por dono no canal.
10. **Resumo** (9): o claim do resumo preenche `streak = { current, goalToday }`. Avise `notificacoes-whatsapp` quando entrar.
11. **Recálculo e backfill** (11): `recompute_user_gamification(user)`, só `service_role`; a migration roda para todos os perfis e deixa `last_closed_date` em ontem.
12. `pnpm db:types`.

## Testes que precisam existir

- A tabela de casos canônicos da seção 3, montando os dias com ocorrências, e as quatro metas do fim da seção.
- Concluir e reabrir 20 vezes: saldo da ocorrência 0, saldo do dia perfeito 0 ou 20, `user_achievements` com uma linha.
- Teto: 11 tarefas difíceis (30 cada) no mesmo dia dão 300; a 11ª não grava evento; reabrir uma libera espaço só até o valor dela.
- Teto com compensação de outro dia: reabrir hoje 300 pontos de ontem e concluir 21 tarefas difíceis hoje grava no máximo 300 pontos de conclusões hoje, nunca 600.
- Duas sessões concluindo ao mesmo tempo não passam do teto.
- Bônus de prova: na hora sem aprovação; só na aprovação com `in_review`; compensado na contestação.
- Dia perfeito por fuso: um perfil em Tóquio e outro em São Paulo com a mesma ocorrência às 23h UTC.
- O job fecha um dia sem nenhuma mudança de status e quebra a ofensiva; rodar duas vezes não muda nada.
- RLS: ninguém lê `user_stats`, `user_day_stats` e `user_achievements` de outro, nem o admin; o cliente não escreve em nenhuma.
- Ranking: membro de outro grupo recebe `forbidden`; `company` sem a chave dá `ranking_disabled`; `family` sem a chave funciona; tarefa privada e dia perfeito não entram; ex-membro some; zero não aparece; `rankingEnabled: "true"` (texto) é recusado pelo `check`.

## Paralelo e dependências

- Depende só do ADR. `gamificacao` escreve o core com os mesmos casos; `design-system`, os componentes.
- Ordem sugerida: 1, 2, 3, 4, 5, 6, 9, 7, 8, 11, 10. As funções da 6 destravam as telas de `gamificacao`.

## Bloqueios e dúvidas

Nenhum. Os valores são padrões a confirmar pelo humano (ADR-0010, seção 13), todos no espelho.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`.
