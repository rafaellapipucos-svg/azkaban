# Handoff: revisor-seguranca para arquiteto, gamificação (primeira passada)

**De:** revisor-seguranca
**Para:** arquiteto
**Data:** 2026-11-03 03:50 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-6`, com `feat/phase-6-gamification` (`93321a5`)

## Contexto

Primeira passada da revisão de segurança da Fase 6. Os achados de banco estão em `20261103-0350-revisor-seguranca-para-banco-de-dados-gamificacao`. Três deles pedem decisão de regra no ADR-0010.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. **SEG6-1 (média), seção 2.** "Dia local do perfil em que o evento é gravado" usa o fuso atual, que o usuário troca à vontade. A tabela de trapaças cobre a troca de fuso só para `last_closed_date`. PoC em Node: 10.500 pontos em 24 h trocando entre 35 zonas IANA. Decidir entre janela móvel de 24 h (mais simples, sem fuso, e o `capRoom` do core fica trivial), fuso do teto congelado por dia, ou limite de troca de fuso. Acrescentar a linha "Trocar o fuso para reabrir o teto" na tabela.
2. **SEG6-3 (baixa), seção 2.** O saldo por ocorrência não olha o `group_id`: reconcluir hoje, num grupo, o XP privado de outro dia fecha a ocorrência em zero e não consome o teto, mas entra no ranking. Sugestão: o saldo por `(ocorrência, group_id)`. Atualizar o texto e o `capRoom`.
3. **SEG6-4 (baixa), seções 6 e 7.** `group_ranking` aceita qualquer `p_week_start` e qualquer `p_timezone`: janelas deslocadas dão por diferença o XP diário ou horário de cada membro, e ligar o ranking numa empresa expõe toda a história. Decidir: fuso de quem chama lido no servidor, semana alinhada a `rankingWeekStartsOn`, só as últimas N semanas e, idealmente, nada antes de o ranking ser ligado.
4. **SEG6-6 (informativo), seções 7 e 8.** O `DELETE` de `user_achievements` vai pelo Realtime a todo assinante, sem RLS, com a chave primária, que aqui é `(user_id, achievement_key)`: na exclusão de uma conta, quem estiver conectado recebe o id do usuário e as conquistas dele. É o SEG4-4 (risco aceito no ADR-0008), agora com um dado de pessoa em vez de um id opaco. `xp_events` só expõe o `id`. Registrar como risco aceito ou levar a comemoração para Broadcast em canal privado. Também: o Realtime confere a RLS de cada `insert` para cada assinante, e o `CelebrationHost` assina de todo usuário logado; o backfill e o fechamento geram rajadas.
5. **LGPD para F8-3 (informativo), seção 7.** Além das quatro tabelas na exportação, a tela de transparência precisa dizer: (a) ligado, os colegas veem nome e XP semanal das tarefas do grupo, e quem administra pode ligar a qualquer momento; (b) até SEG6-4 fechar, isso inclui as semanas passadas; (c) `user_day_stats` guarda por dia quantas tarefas a pessoa planejou, concluiu e perdeu, sem prazo de retenção, visível só para ela. Definir a retenção de `user_day_stats` e de `xp_events`, ou registrar que ficam enquanto a conta existir.

## Bloqueios e dúvidas

Nenhum.

## Como testar

Releitura do ADR-0010 contra os itens acima. PoC de SEG6-1 em Node puro, reproduzível com `Intl.supportedValuesOf('timeZone')` e a conta de janela de `occurrence_award_xp`.
