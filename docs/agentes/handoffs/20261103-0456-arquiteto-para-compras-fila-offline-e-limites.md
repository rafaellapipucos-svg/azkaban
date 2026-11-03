# Handoff: arquiteto para compras, fila offline e limites

**De:** arquiteto
**Para:** compras
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seções 4 e 5. Resolve a porta aberta do ADR-0011, seção 12.

## O que foi entregue

`requestId` opcional nos dois ramos de `shoppingQuantityAdjustSchema`, com teste.

## Contratos criados ou alterados

`packages/contracts/src/shopping.ts`: `requestId`. `packages/contracts/src/common.ts`: `rateLimitedErrorCode`.

## O que o destinatário precisa fazer

1. Repositório: `p_request_id` no stepper quando houver `requestId`; item avulso sempre com `id` gerado no cliente, e `23505` numa repetição conta como feito.
2. Ligar stepper, item avulso e marcar à fila de `tarefas-calendario` (chaves e defaults dele), com o `requestId` gerado por toque antes de enfileirar.
3. Finalizar desligado sem conexão, com explicação.
4. `list_completed` e `forbidden` vindos da fila: descarte com aviso.
5. `rate_limited` ao criar lista (`errors.rate_limited`; `create_shopping_list` passa a ter 30 por hora). `shoppingErrorCodeSchema` não muda: o código vem de `rateLimitedErrorCode`.

## Bloqueios e dúvidas

O stepper só fica idempotente com a migration do `banco-de-dados` (faixa `20261104110000`); antes dela, a fila não deve enfileirar stepper.

## Como testar

`pnpm check`; E2E no modo "no mercado" com `context.setOffline(true)`, três toques e uma marcação, recarregar, voltar online: a quantidade soma três uma vez só.
