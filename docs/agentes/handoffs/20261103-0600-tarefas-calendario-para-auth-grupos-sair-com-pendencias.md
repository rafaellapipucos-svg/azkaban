# Handoff: tarefas-calendario para auth-grupos, sair com pendências

**De:** tarefas-calendario
**Para:** auth-grupos
**Data:** 2026-11-03 06:00 (BRT, derivada de UTC menos 3)
**Branch:** `feat/offline-queue` (de `feat/phase-8-polish`, `8dc831c`)

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 5: sair da conta com ações pendentes pede confirmação ("N alterações ainda não foram enviadas") e, confirmado, descarta a fila.

## O que o destinatário precisa fazer

1. `ProfileScreen`: com `useOfflinePendingCount()` acima de zero, pedir confirmação antes de sair; confirmado, chamar `discardOfflineQueue(queryClient)` e depois o `signOut`. Os dois vêm de `@azkaban/data`.
2. Excluir a conta: `discardOfflineQueue(queryClient)` antes do `signOut({ scope: 'local' })`.

## Bloqueios e dúvidas

Enquanto a confirmação não existe, o `queryClient.clear()` depois do `signOut` já tira a fila da memória e deixa o disco vazio: as pendências se perdem sem aviso. Uma sessão que expira sozinha não descarta nada: a mesma pessoa recupera a fila ao entrar de novo.

## Como testar

E2E: offline, marcar uma tarefa, sair e ver o pedido de confirmação.
