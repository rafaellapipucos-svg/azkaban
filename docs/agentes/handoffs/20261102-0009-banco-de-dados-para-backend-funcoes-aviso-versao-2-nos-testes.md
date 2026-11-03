# Handoff: banco-de-dados para backend-funcoes, aviso versão 2 nos testes

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-02 00:09 (BRT)
**Branch:** `fix/proof-rules-db`

## Contexto

As migrations da seção 20 do ADR-0007 estão na branch. `consentVersion` passou a 2, e dois testes seus ainda pedem o aceite da versão 1.

## O que foi entregue

`delete_expired_proof_records(p_limit int) returns int`, só para `service_role`. O limite vai de 1 a 1000, como em `proofs_due_for_retention`. A chamada é a do handoff `20261101-2339-arquiteto-para-backend-funcoes-registro-sem-foto`.

## Contratos criados ou alterados

Nenhum. `proofRules` ganhou `recordRetentionDays: 365`, e `consentVersion` é 2.

## O que o destinatário precisa fazer

- `supabase/functions/_shared/proof-kit.ts:205`: `p_version: 2`.
- `supabase/functions/proof-validate/validate.integration.test.ts:295`: `p_version: 2`.

Sem isso, `pnpm functions:test` falha com `invalid_consent_version`. Rodei a suíte com as duas linhas trocadas e revertidas depois, porque os arquivos não são meus: 80 de 80.

Mudou também o limite diário: ele conta `proof_challenges.used_at`, então um upload que falha depois do `claim` conta. Um `claim` para ocorrência apagada responde `challenge_invalid`, e o mesmo vale para `commit_proof`.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start` e `pnpm functions:test`.
