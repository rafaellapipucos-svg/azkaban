# Handoff: arquiteto para backend-funcoes, `upload_timeout` no contrato

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-01 20:42 (BRT)
**Branch:** `docs/proof-closeout`

## Contexto

Resposta ao handoff `20261101-1901`. Decisão no ADR-0007, seção 19.

## O que foi entregue

`upload_timeout` entra em `proofErrorCodeSchema`. `unauthorized`, `invalid_request`, `method_not_allowed` e `internal` ficam fora, sem `transportErrorCodeSchema`: nenhuma tela distingue os quatro.

## Contratos criados ou alterados

`proofErrorCodeSchema`: um valor a mais.

## O que o destinatário precisa fazer

Em `supabase/functions/proof-validate/index.ts`, `STATUS` é `Record<ProofErrorCode, number>` e agora precisa de `upload_timeout: 408`. O ramo do timeout pode usar `refuse('body', 'upload_timeout')`, que dá a mesma resposta e o mesmo log.

Nada quebra enquanto isso não entra: esse ramo usa `reply(408, ...)` direto, e nenhuma RPC levanta esse código. `pnpm check` não compila `supabase/functions`, então só a leitura pega a chave faltando.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm functions:test` (`validate.integration.test.ts` exige a resposta exata).
