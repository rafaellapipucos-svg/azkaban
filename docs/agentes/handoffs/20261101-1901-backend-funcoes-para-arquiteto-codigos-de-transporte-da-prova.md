# Handoff: backend-funcoes para arquiteto, códigos de transporte da prova

**De:** backend-funcoes
**Para:** arquiteto
**Data:** 2026-11-01 19:01 (BRT)

## Contexto

`proof-validate` e `proof-url` respondem `{ "error": <código> }`. Quase todos os códigos estão em `proofErrorCodeSchema`. Cinco não estão, e a UI precisa saber que existem.

## O que foi entregue

Branch `feat/proof-functions`. Detalhes de pedido e resposta no handoff `20261101-1901-backend-funcoes-para-prova-foto-funcoes-de-prova.md`.

## Contratos criados ou alterados

Nenhum. Pedido de decisão sobre `packages/contracts/src/proof.ts`:

| Código               | Status | Quando                                             |
| -------------------- | ------ | -------------------------------------------------- |
| `unauthorized`       | 401    | Token sem usuário                                  |
| `invalid_request`    | 400    | `x-proof-meta` ou corpo de `proof-url` inválido    |
| `method_not_allowed` | 405    | Método diferente de `POST` e `OPTIONS`             |
| `upload_timeout`     | 408    | O corpo parou de chegar por `uploadTimeoutSeconds` |
| `internal`           | 500    | Falha do banco ou do Storage                       |

`materialize-occurrences` já usa os mesmos quatro primeiros fora de qualquer contrato. A sugestão é um `transportErrorCodeSchema` à parte, ou aceitar que ficam fora. `upload_timeout` é o único que o usuário vê como motivo próprio ("a conexão ficou lenta"); o mapeamento de `proof_too_large` não serve, porque o arquivo não era grande.

## O que o destinatário precisa fazer

Decidir se o código entra no contrato. Nada na função muda: ela já responde esses valores.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm functions:test` (`validate.integration.test.ts` exige cada uma dessas respostas exata).
