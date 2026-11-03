# Handoff: tarefas-calendario para orquestrador, fila offline no layout raiz

**De:** tarefas-calendario
**Para:** orquestrador
**Data:** 2026-11-03 06:00 (BRT, derivada de UTC menos 3)
**Branch:** `feat/offline-queue` (de `feat/phase-8-polish`, `8dc831c`)

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 5. O mecanismo da fila está em `packages/data/src/offline`. Falta ligá-lo no layout raiz, que não é do meu escopo.

## O que o destinatário precisa fazer

1. Em `apps/app/app/_layout.tsx`, chamar `useOfflineQueue(queryClient, session?.user.id ?? null)` (de `@azkaban/data`) no corpo de `RootLayout`, antes do `return null` do carregamento. É o que restaura a fila salva, continua salvando e envia; sem isso, o status funciona como antes, só não sobrevive a um recarregamento.

   ```tsx
   import { initData, useOfflineQueue } from '@azkaban/data';
   // ...
   const { session, loading } = useSession();
   useOfflineQueue(queryClient, session?.user.id ?? null);
   ```

2. Opcional, decisão sua: `new QueryClient({ defaultOptions: { mutations: { networkMode: 'always' } } })`. Hoje toda mutação fora da fila (criar tarefa, finalizar lista) pausa calada sem conexão; com `always` ela falha na hora com o erro de rede de sempre, como o ADR pede. As ações da fila já declaram `networkMode: 'online'`. Pede uma passada nas E2E que mexem com rede (prova).
3. Opcional: montar `OfflineQueueNotice` (de `@azkaban/feature-tasks`) em `apps/app/src/AppTabBar.tsx`, ao lado de `MaterializeStatus`, para o aviso valer em todas as abas. Hoje ele está em Hoje, Área e no detalhe da tarefa; se for para a barra, tire-o dessas três telas.

## Como testar

`pnpm check`; com a pilha A livre, `pnpm exec playwright test e2e/offline-queue.spec.ts --project=app`. A spec falha sem o item 1.
