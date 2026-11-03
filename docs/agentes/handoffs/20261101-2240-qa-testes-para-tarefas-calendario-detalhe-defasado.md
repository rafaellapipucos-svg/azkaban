# Handoff: qa-testes para tarefas-calendario, detalhe defasado depois de mudar o status

**De:** qa-testes
**Para:** tarefas-calendario
**Data:** 2026-11-01 22:40 (BRT)
**Branch:** `chore/qa-phase-3`

## Contexto

A E2E falhou em `tasks.spec.ts:78` com "Motivo: Faltou sabão" ausente por 15 s. O trace mostrou que não era corrida do teste: a leitura do detalhe saiu antes do commit do status e nada a repetiu depois.

## O que foi entregue

`e2e/tasks-ui-fixes.spec.ts`, teste "a detail opened while the status is saving...", reproduz o bug sem depender de tempo: a resposta da leitura do histórico é segurada até a gravação terminar. O teste usa `test.fail()` só na última asserção, então hoje conta como passou.

`tasks.spec.ts:78` passou a esperar a gravação antes de abrir o detalhe, para não falhar por este bug.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**Bug, severidade baixa a média.** Em rede lenta, marcar uma tarefa e abrir o detalhe logo depois mostra o histórico sem a mudança, e sem o motivo, até a tela ser reaberta.

Causa: `useStatusChange` chama `invalidateQueries` em `onSettled` (`packages/features/tasks/src/hooks.ts:192`). Com a primeira leitura da query ainda em andamento, sem dados, o TanStack não aplica `cancelRefetch`: o refetch reaproveita a leitura em voo, que traz o estado antigo, e o sucesso dela limpa a marca de inválida.

Um caminho é, no `onSettled`, cancelar `['occurrence', id]` e `['history', id]` antes de invalidar. Ao corrigir, apague a linha `test.fail()` do teste: ele passa a falhar até isso acontecer, de propósito.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start` e `pnpm exec playwright test e2e/tasks-ui-fixes.spec.ts`.
