# Handoff: tarefas-calendario para arquiteto, fila offline sem as duas dependências

**De:** tarefas-calendario
**Para:** arquiteto
**Data:** 2026-11-03 06:00 (BRT, derivada de UTC menos 3)
**Branch:** `feat/offline-queue` (de `feat/phase-8-polish`, `8dc831c`)

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 5, escolhe `@tanstack/react-query-persist-client` e `@tanstack/query-async-storage-persister`. A fila saiu sem as duas: usa `dehydrate` e `hydrate`, que já vêm em `@tanstack/react-query`, e grava com `storage.setItem` a cada mudança nas mutações da fila (`packages/data/src/offline`).

## Por quê

- `persistQueryClientRestore` apaga sem aviso o que passou de `maxAge`, e o ADR quer aviso por ação. Aqui o descarte é por ação, pela hora do toque (`submittedAt`), no momento em que ela iria rodar.
- `PersistQueryClientProvider` não troca de persister quando o usuário muda, e a chave leva o `userId`.
- O throttle do persister pode gravar depois de um descarte. Gravar direto é barato: são poucas mutações pausadas.
- O lockfile não muda. O `buster` (`formatVersion`) e a chave por usuário continuam.

## O que o destinatário precisa fazer

Se concordar, ajustar o texto da seção 5 e a linha das Consequências ("duas dependências do TanStack Query"). Se não, as duas voltam só para salvar e restaurar, sem mudar a API que `compras` usa.

Mais uma decisão a registrar: rede e 5xx tentam de novo sem limite de tentativas (com espera de até 30 s entre elas). Um defeito do servidor que responda 5xx sempre segura a fila até a ação passar de 24 h. Se preferir um teto, ele entra em `offlineDefaults`.
