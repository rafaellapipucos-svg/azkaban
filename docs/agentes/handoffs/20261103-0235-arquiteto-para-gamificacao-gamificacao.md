# Handoff: arquiteto para gamificacao, Fase 6

**De:** arquiteto
**Para:** gamificacao
**Data:** 2026-11-03 02:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/gamification-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

A gamificação está decidida no [ADR-0010](../../adr/0010-gamificacao-xp-ofensiva-conquistas-ranking.md). O banco é o único escritor e repete as contas; o seu core é a especificação executável e o que as telas usam.

## O que foi entregue

- ADR-0010.
- `packages/config/src/gamification.ts`: `gamificationRules` (meta, ofensiva, bônus, teto, padrão do ranking) e `gamificationDefaults` (curva de nível, som e vibração, semana do ranking, marcos da ofensiva).
- `packages/contracts/src/gamification.ts` e as mudanças de `tasks.ts` e `groups.ts` (ver o handoff para `banco-de-dados`, mesmo horário). `celebrationKindSchema` é seu.

## O que fazer

**F6-1, já, em `packages/core/src/gamification`** (sem importar config, como `occurrenceXp`: receba as regras como argumento):

- `levelForXp(totalXp, curve)` → `{ level, xpIntoLevel, xpForNextLevel }`;
- `dailyGoal({ planned, done, partial }, goalRules)` → `{ planned, completed, needed, met, progress }`, conta inteira (seção 3);
- `dayCounts(items, timezone, date)`, pelo `occurrenceDay` e pelo `summarizeDay` de `core/tasks` (sem copiar);
- `foldStreak(days, { today, rules })`, com a tabela de casos canônicos da seção 3 como teste;
- `occurrenceXpWithBonus` (base de `occurrenceXp` mais `proofBonus`) e `capRoom(eventsToday, dailyCap)`, com `cappedXpEventReasons`;
- `celebrationsFor(before, after, { streakMilestones, celebratedLevel })` (seção 8).

**F6-3 a F6-5, depois de F6-2 e dos componentes do `design-system`:**

- `packages/data/src/gamification`: `user_stats`, `user_day_stats`, `achievements`, `user_achievements`, os eventos de hoje, `group_ranking`, a assinatura do Realtime e a escrita de `groups.settings.rankingEnabled` com `groupSettingsSchema` (lê, mescla e grava, para não perder chaves).
- Perfil: nível, barra de XP, ofensiva, proteções, conquistas, últimos dias. Montado pela rota em `ProfileScreen`, por `children`.
- `StreakChip` para o slot do cabeçalho de Hoje (a rota monta; `tarefas-calendario` abre o slot).
- `CelebrationHost`, montado pela rota no layout do app (seção 8); maior nível comemorado guardado no aparelho.
- Adapters em `packages/platform`: `haptics` (web `navigator.vibrate`, nativo vazio até F8-7) e `celebrationSound` (web Web Audio, nativo vazio). Preferências por aparelho.
- Ranking: `GroupRanking` e a chave de ligar, montados pela rota em `GroupDetailScreen`, por `children`; a chave só aparece com `can(user, 'group.update', group)`. `ranking_disabled` é um estado explicado, não um erro.
- i18n em `packages/i18n/src/pt-BR/gamification.json`, inclusive `achievements.<key>.title` e `.description` das cinco conquistas.

## Paralelo e dependências

- F6-1 depende só do ADR. Rode junto com `banco-de-dados` (F6-2) e `design-system`.
- `tarefas-calendario` troca o anel de Hoje pelo seu `dailyGoal` assim que ele existir.

## Bloqueios e dúvidas

Valores a confirmar pelo humano (seção 13); nenhum muda a forma do código.

## Como testar

`pnpm check`. Depois de F6-2, com a pilha: concluir a última tarefa do dia dispara o dia perfeito; reabrir não comemora de novo o mesmo nível.
