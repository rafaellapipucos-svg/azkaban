# Handoff: tarefas-calendario para compras, API da fila offline

**De:** tarefas-calendario
**Para:** compras
**Data:** 2026-11-03 06:00 (BRT, derivada de UTC menos 3)
**Branch:** `feat/offline-queue` (de `feat/phase-8-polish`, `8dc831c`)

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 5, e o handoff `20261103-0456-arquiteto-para-compras-fila-offline-e-limites`. O mecanismo está em `packages/data/src/offline`; o status de ocorrência (`occurrenceStatusAction`, em `packages/data/src/tasks`) serve de exemplo.

## API (`@azkaban/data`)

- `defineOfflineAction({ key, schema, run, reasonOf, invalidates })`, chamado no nível do módulo dentro de `packages/data` (por exemplo em `src/shopping`), para ficar registrado antes de a fila salva ser retomada. Devolve as opções da mutação (`mutationKey`, `scope` único, `networkMode: 'online'`, `retry`, `mutationFn`, `onSettled`).
  - `schema`: o do contrato. As variáveis passam por ele antes de rodar; se falharem, a ação é descartada com o motivo `invalid`.
  - `run`: a chamada do repositório. Uma repetição que conta como feita fica aqui dentro: o `23505` do item avulso devolve sucesso.
  - `reasonOf(error)`: o código do aviso de descarte (por exemplo `shoppingErrorCode(error) ?? 'generic'`, com `PT429` virando `rate_limited`).
  - `invalidates(vars)`: as chaves a recarregar no fim, também depois de um recarregamento.
- Na tela: `useMutation({ ...suaAcao, onMutate })`. Não sobrescreva `onSettled`. O `requestId` e o `id` do item avulso são gerados antes do `mutate`, para irem nas variáveis salvas.
- `useOfflineDiscards(key)` e `dismissOfflineDiscard(id)`: os descartes da sua ação, com `reason` (`expired`, `invalid` ou o de `reasonOf`). `useOfflinePendingCount()`: quantas ações esperam, somando todos os módulos.
- `offlineQueueFull(queryClient)`: sem conexão e com 200 ações na fila, recuse o toque com a mensagem de sem conexão.
- Rede, 5xx e 401 tentam de novo; um erro com código de negócio (`P0001`, `23505`, `42501`, `PT429`...) descarta com aviso. Mais de 24 h na fila: `expired`.

## Bloqueios e dúvidas

A fila só sobrevive ao recarregamento depois de o orquestrador ligar `useOfflineQueue` no layout raiz (handoff `20261103-0600-tarefas-calendario-para-orquestrador-fila-offline-no-layout`). O `scope` é um só para todos os módulos: status e compras andam numa fila única, em ordem.

## Como testar

Os testes de `packages/data/src/offline/offline.test.ts` mostram o padrão, com um `QueryClient` sem React e o disco num `Map`.
