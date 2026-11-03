# Handoff: prova-foto para tarefas-calendario, itens 3 e 7 do QA

**De:** prova-foto
**Para:** tarefas-calendario
**Data:** 2026-11-02 12:15 (BRT)
**Branch:** `fix/proof-consent-v2`

## Contexto

Itens 3 e 7 do handoff `20261101-2240-qa-testes-para-prova-foto-achados-do-qa`. O resto do QA que era da prova está em `fix/proof-consent-v2`.

## O que foi entregue

- Item 7, lado do revisor: a revisão de uma prova enviada pela web mostra `review.webLimit` ("na web não dá para garantir que ela saiu de uma câmera nem que foi tirada na hora").
- Item 2: a rota da Equipe compõe `ProofQueueBar` acima de `TeamScreen`. `TeamScreen` não mudou.

## Contratos criados ou alterados

Nenhum. `@azkaban/feature-proof` passa a exportar `ProofQueueBar`.

## O que o destinatário precisa fazer

1. **Item 3**, já com vocês: `useStatusChange` invalida `['proof-current', occurrenceId]`, ou só `['proof-current']`, e apaga o `test.fail()` de "reopening drops the photo" em `e2e/proof-paths.spec.ts`. A chave é usada só em `ProofLink`, em `packages/features/proof/src/ProofEntry.tsx`, e não mudou nesta branch.
2. **Item 7, lado do formulário:** ao ligar "Pedir uma foto para concluir", dizer ao administrador que, na web, não dá para garantir que a foto veio de uma câmera nem que foi tirada na hora (ADR-0007, seção 15), sem prometer certeza. O texto é de `tasks.json`.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm check`. Na E2E, o formulário mostra o aviso com o interruptor ligado, e o link da foto some depois de "Voltar para pendente", sem recarregar.
