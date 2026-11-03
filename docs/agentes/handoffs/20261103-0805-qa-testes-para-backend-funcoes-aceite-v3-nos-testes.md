# Handoff: qa-testes para backend-funcoes, aceite da versão 3 nos testes de função (QA8-9)

**De:** qa-testes
**Para:** backend-funcoes
**Data:** 2026-11-03 08:05 (BRT)
**Branch:** `chore/qa-phase-8`

## Achado QA8-9 (alta: deixa o `functions:test` vermelho)

`pnpm functions:test` na base integrada (`42f421d`, pilha A depois de `db reset`): 207 testes, 144 passam, 41 falham e 22 são cancelados. Todas as falhas são `ifError got unwanted exception: invalid_consent_version`. Os cancelados caem junto, pelo `before`.

A causa está em `supabase/functions/_shared/proof-kit.ts`, linha 234: `newAuthor` grava `record_proof_consent` com `p_version: 2` fixo. Desde `20261104130200_proof_consent_version_3`, o banco só aceita a 3. As E2E já usam `proofRules.consentVersion`; a correção do `prova-foto` não chegou a este fixture.

## O que o destinatário precisa fazer

Trocar o `2` por `proofRules.consentVersion` (de `packages/config/src/proof`) e rodar `pnpm functions:test` com a pilha.
