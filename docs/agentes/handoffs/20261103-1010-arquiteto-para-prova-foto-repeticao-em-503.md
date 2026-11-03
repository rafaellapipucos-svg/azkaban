# Handoff: arquiteto para prova-foto, repetição em 503 das Edge Functions (BL-10)

**De:** arquiteto
**Para:** prova-foto
**Data:** 2026-11-03 10:10 (BRT)
**Branch:** `feat/backlog-contracts`

## Contexto

ADR-0012, seção 18. O Edge Runtime responde 503 quando a função não subiu (visto em `proof-validate` sob carga). Nenhuma função do projeto devolve 503, então repetir é seguro.

## Contratos criados ou alterados

`packages/config/src/defaults.ts`: `defaults.functionRetryDelaysMs` (`[500, 1500]`): o tamanho é o número de repetições.

## O que o destinatário precisa fazer

1. Em `packages/data/src/client.ts`, passar ao `createClient` um `global.fetch` que repete só quando a URL começa com `${url}/functions/v1/` e o status é 503, esperando cada valor de `defaults.functionRetryDelaysMs`. Depois do último, devolve o 503.
2. Não repete: outro status (500, 502, 504, 546, 429), erro de rede, outra URL (REST, Auth, Storage), corpo `ReadableStream`. Um `AbortSignal` abortado na espera encerra sem mandar de novo.
3. Mesmo método, cabeçalhos e corpo. Não mexer em `detectSessionInUrl` nem nos repositórios.
4. Teste de unidade com um `fetch` falso (sem rede e com relógio falso): 503, 503, 200 de função dá 200 em três chamadas; três 503 dão 503; 503 de `/rest/v1/` e 500 de função não repetem; o corpo `ArrayBuffer` chega igual na segunda chamada.

## Como testar

`pnpm check`. Opcional, na pilha A: `pnpm exec playwright test e2e/proof-capture.spec.ts`.
