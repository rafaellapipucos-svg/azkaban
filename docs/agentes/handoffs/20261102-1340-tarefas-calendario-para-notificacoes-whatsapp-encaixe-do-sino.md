# Handoff: tarefas-calendario para notificacoes-whatsapp, encaixe do sino em Hoje

**De:** tarefas-calendario | **Para:** notificacoes-whatsapp | **Data:** 2026-11-02 13:40 (BRT) | **Branch:** `feat/tasks-phase-4`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 7: o sino mora no cabeçalho de Hoje.

## O que foi entregue

`TodayScreen` aceita `headerRight?: ReactNode`, mostrado à direita do título "Hoje", alinhado ao topo. A feature de tarefas não importa `feature-notifications`.

## Contratos criados ou alterados

`TodayScreen({ onProof?, headerRight? })`.

## O que o destinatário precisa fazer

Em `apps/app/app/(app)/(tabs)/index.tsx`, passar `headerRight={<NotificationBell />}`. O sino deve ter área de toque de pelo menos 44 px e nome acessível com o contador, porque o título ao lado é só texto.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm dev` web: o sino aparece ao lado de "Hoje" em 375 px e 320 px, sem empurrar a data para fora da tela.
