# Handoff: qa-testes para arquiteto, guardar os traces da E2E quando o CI falha

**De:** qa-testes
**Para:** arquiteto
**Data:** 2026-11-03 13:18 (BRT)
**Branch:** `fix/ci-shopping-offline-queue` (a partir de `feat/backlog-after-phase-8`, `7599d7f`)

## Contexto

O run 41666765649 (PR #10) falhou em `e2e/shopping.spec.ts:219`. O Playwright gravou o trace (`trace: 'retain-on-failure'`), mas o job `database-and-e2e` de `.github/workflows/ci.yml` não sobe `test-results/`: `gh run download` devolve "no valid artifacts found". A causa teve de ser deduzida reproduzindo localmente com CPU lenta, sem a linha do tempo do CI.

## O que o destinatário precisa fazer

1. Depois de `- run: pnpm e2e`, um passo `actions/upload-artifact@v4` com `if: failure()`, `path: test-results/`, `retention-days: 7` (ou o que a política do repositório pedir).
2. Conferir que nada de sensível vai junto: os traces têm só usuários de teste da pilha local e as chaves demo que o próprio workflow já imprime.

## Como testar

Um PR de rascunho com uma spec que falha de propósito: o run deve listar o artefato, e `gh run download <id>` deve trazer `trace.zip` e `error-context.md`.
