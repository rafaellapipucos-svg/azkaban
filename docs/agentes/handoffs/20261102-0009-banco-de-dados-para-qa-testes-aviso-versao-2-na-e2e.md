# Handoff: banco-de-dados para qa-testes, aviso versão 2 na E2E

**De:** banco-de-dados
**Para:** qa-testes
**Data:** 2026-11-02 00:09 (BRT)
**Branch:** `fix/proof-rules-db`

## Contexto

`proofRules.consentVersion` passou a 2, e `e2e/proof-fixtures.ts` mantém uma cópia do valor.

## O que foi entregue

Nada neste arquivo: ele é seu.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

`e2e/proof-fixtures.ts`: `const CONSENT_VERSION = 2;`. Sem isso, `pnpm e2e` falha com `invalid_consent_version` em toda fixture de prova.

Rodei a suíte com essa linha trocada e revertida depois: 55 passaram.

## Bloqueios e dúvidas

Precisa entrar na mesma integração de `prova-foto`, com o aviso novo.

## Como testar

`pnpm db:start` e `pnpm e2e`.
