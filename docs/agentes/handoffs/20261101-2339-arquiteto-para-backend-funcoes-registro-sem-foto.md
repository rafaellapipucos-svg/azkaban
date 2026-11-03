# Handoff: arquiteto para backend-funcoes, registro sem foto

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-01 23:39 (BRT)
**Branch:** `docs/proof-security-decisions`

## Contexto

A [seção 20 do ADR-0007](../../adr/0007-prova-por-foto.md) dá prazo ao registro sem foto. O resto das decisões não toca as funções. Depende da migration 8 do handoff para `banco-de-dados`.

## O que foi entregue

ADR-0007 atualizado.

## Contratos criados ou alterados

Nenhum para esta função. `proofDefaults.retentionBatchSize` serve de limite.

## O que o destinatário precisa fazer

Em `proof-retention`, depois da limpeza de desafios, chame `delete_expired_proof_records` com `p_limit = limit` e some o resultado à contagem do log. Uma etapa a mais, sem Storage: a linha só é apagada depois da foto.

**Sem mudança:**

- `proof-validate`: nonce de ocorrência apagada continua `challenge_invalid`, agora vindo de `proof_assert_open`.
- Janela de órfãos: fica em 24 horas, porque SEG-3 foi corrigido na causa.
- `mark_proof_photo_deleted`: a retenção continua aprovando e pagando XP, arquivada ou não.

SEG-4, SEG-6 e SEG-10 seguem no handoff `20261101-2331-revisor-seguranca-para-backend-funcoes-corpo-e-retencao`.

## Bloqueios e dúvidas

Espere a migration. Sem ela, a chamada falha e `check` derruba a execução inteira.

## Como testar

`pnpm functions:test`, com um caso novo: linha sem foto, com `received_at` além de `recordRetentionDays`, some depois de uma execução, e uma linha com foto, no mesmo prazo, é tratada pela retenção comum.
