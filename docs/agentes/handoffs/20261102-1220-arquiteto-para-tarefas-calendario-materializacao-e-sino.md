# Handoff: arquiteto para tarefas-calendario, resposta da materialização e encaixe do sino

**De:** arquiteto | **Para:** tarefas-calendario | **Data:** 2026-11-02 12:20 (BRT) | **Branch:** `feat/notifications-contracts`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seções 7, 12 e 13. A parte de cliente de F4-8 e o lugar do sino ficam nas suas telas.

## O que foi entregue

`materializeResponseSchema = { inserted, failed, deferred }` e `taskDefaults.materializeMaxFollowUps = 2`.

## Contratos criados ou alterados

`packages/contracts/src/tasks.ts`, `packages/config/src/tasks.ts`.

## O que o destinatário precisa fazer

1. `packages/data/src/tasks`: a chamada de materialização devolve a resposta inteira, não só `inserted`.
2. `MaterializeStatus` e quem chama: `failed > 0` mostra o erro com "tentar de novo"; `deferred > 0` chama de novo com os mesmos argumentos, até `materializeMaxFollowUps` vezes, sem aviso. Isso vale ao criar, editar e navegar no calendário além da janela.
3. `TodayScreen` recebe um encaixe no cabeçalho (`headerRight` ou `children`, à sua escolha) para a rota passar o `NotificationBell` de `notificacoes-whatsapp`.
4. Quando `Screen` ganhar `title` (handoff de `design-system`), passar o título das suas telas.

## Bloqueios e dúvidas

O item 2 só faz diferença com a função de F4-8 no ar; com a antiga, os dois campos chegam como 0 e nada muda.

## Como testar

`pnpm check` com testes do laço de chamadas (para em `deferred = 0` e no limite) e `pnpm e2e` do calendário além da janela, sem regressão.
