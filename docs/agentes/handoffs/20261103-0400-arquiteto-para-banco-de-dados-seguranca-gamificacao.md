# Handoff: arquiteto para banco-de-dados, segurança da gamificação

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 04:00 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `docs/gamification-security-decisions`, a partir de `feat/phase-6-gamification` (`8e6fe77`)

## Contexto

Decisões sobre `20261103-0350-revisor-seguranca-para-banco-de-dados-gamificacao`, na seção 14 do ADR-0010. Novas migrations; nenhuma mergeada se edita.

## Contratos criados ou alterados

- `gamificationRules` ganhou `xp.capWindowHours` (24), `ranking.weekStartsOn` (1), `ranking.maxWeeks` (2) e `historyDays` (400). Atualize `app_settings.gamification_rules`; até lá `pnpm db:check-permissions` acusa a diferença.
- `group_ranking` passa a `(p_group_id uuid, p_week_start date)`. O contrato `groupRankingInputSchema` perde `timezone` pelo `gamificacao`, junto com o repositório. **A migration e essa troca precisam entrar juntas na integração.**

## O que o destinatário precisa fazer

1. **SEG6-1.** `occurrence_award_xp`: janela `e.created_at >= now() - make_interval(hours => capWindowHours)`, sem fuso. Trigger em `profiles` (`insert` e `update of timezone`) que exige `exists (select 1 from pg_timezone_names where name = new.timezone)`, senão `invalid_timezone` (22023); antes, corrija as linhas inválidas para o padrão da coluna. Teste: concluir 300, trocar o fuso para uma zona de meia-noite recente, concluir de novo e esperar zero; `'<X>-13:37'` recusado.
2. **SEG6-2.** Piso `greatest(dia local da criação do perfil - 1, hoje local - historyDays)` em `refresh_user_day_counts`, no trigger de status, no início de `refold_streak` e em `recompute_user_gamification`. `perfect_day` só para dias a partir do dia local da criação. Agrupar por comando: um `refresh` por (usuário, dia) e uma dobra por usuário a partir do menor dia (trigger `for each statement` com tabela de transição, ou equivalente). Testes: ocorrência de 2000 marcada `missed` não cria linha nem evento; dia anterior à criação sem bônus; um `update` de N ocorrências do mesmo usuário dobra uma vez.
3. **SEG6-3.** Saldo agrupado por `(coalesce(occurrence_id, id), group_id)`. Teste: privada concluída fora da janela, mudar para `group`, reabrir, reconcluir, depois 300 novos: o total na janela fica em 300.
4. **SEG6-4.** Nova `group_ranking(p_group_id, p_week_start)`; drop da de três argumentos, `revoke`/`grant` como antes. Fuso do perfil de quem chama. `extract(dow from p_week_start) = weekStartsOn` e dentro das últimas `maxWeeks` semanas no fuso de quem chama, senão `invalid_argument` (22023). Coluna `groups.ranking_enabled_at timestamptz`, fora do `grant update`, escrita por trigger `before insert or update` (desligado para ligado: `now()`; desliga: nulo; senão mantém), com `group_ranking_enabled`. Backfill: grupos ligados recebem `now()`. Soma a partir de `greatest(início da semana, ranking_enabled_at, joined_at de quem chama)`. Testes: semana desalinhada e de três semanas atrás recusadas; XP antes de ligar e antes de entrar fora; `family` nasce com a coluna preenchida; o cliente não grava a coluna.
5. **SEG6-5.** `for no key update of p skip locked` e `begin ... exception when others then raise warning` por perfil, sem avançar `last_closed_date` de quem falhou.
6. Informativo do revisor: confira `user_day_counts` contra tarefas arquivadas (Hoje e `daily_summary_source` filtram `archived_at is null`).

## Mutações (caminho crítico)

- Janela pelo fuso em vez de `now() - 24h`: o teste de troca de fuso cai.
- Agrupar só por ocorrência, sem `group_id`: o teste do SEG6-3 cai.
- Tirar o piso da história: o teste de 2000 cai.
- Tirar `ranking_enabled_at` ou `joined_at` do `greatest`: os testes de privacidade do ranking caem.

## Bloqueios e dúvidas

Nenhum. Se `pg_timezone_names` recusar alguma zona que o `Intl` do cliente aceita, avise o `arquiteto`.

## Como testar

`pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`, os PoCs 1 a 5 do handoff do revisor.
