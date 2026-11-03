# Handoff: arquiteto para tarefas-calendario, fila offline (F8-5)

**De:** arquiteto
**Para:** tarefas-calendario
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 5. A fila é o TanStack Query, com mutações pausadas e persistidas. Você monta o mecanismo; `compras` liga as ações dele.

## O que foi entregue

`offlineDefaults` em `packages/config/src/limits.ts` (`maxAgeHours` 24, `maxItems` 200).

## Contratos criados ou alterados

Nenhum seu. `requestId` no stepper é de `compras`.

## O que o destinatário precisa fazer

1. `@tanstack/react-query-persist-client` e `@tanstack/query-async-storage-persister`, na versão do `@tanstack/react-query` do app; persister com o `storage` de `@azkaban/platform`, só as mutações pausadas, chave com o `userId`, `maxAge` e `buster` de versão.
2. Chaves de mutação e `setMutationDefaults` registrados antes de `resumePausedMutations`, num lugar que `compras` também use (por exemplo `packages/data/src/offline`, seu), com as variáveis conferidas pelo contrato antes de executar e um `scope` único para a fila andar em ordem.
3. Status na fila: `expectedStatus` do toque; `status_conflict` relê e conta como feito se já está no destino; erros de negócio descartam com aviso; rede e 5xx tentam de novo; 401 espera a sessão. Tarefa com foto nunca entra (ADR-0007, seção 16).
4. Aviso de pendências (`useMutationState`) e de descarte, com os componentes do `design-system`; sair da conta com pendências pede confirmação e descarta; uma função de descarte para `auth-grupos` chamar ao excluir a conta.
5. `rate_limited` em tarefas (`errors.rate_limited`).

## Bloqueios e dúvidas

Composição em `apps/app/app/_layout.tsx` (troca do `QueryClientProvider` pelo persistente): peça ao orquestrador se não for seu. No nativo a fila espera o NetInfo de F8-7.

## Como testar

`pnpm check`; E2E com `context.setOffline(true)`, concluir, recarregar a página, voltar online e ver o status no banco (com `qa-testes`).
