# Handoff: arquiteto para auth-grupos, permissões de compras

**De:** arquiteto
**Para:** auth-grupos
**Data:** 2026-11-03 02:30 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/shopping-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

O [ADR-0011](../../adr/0011-lista-de-compras.md), seção 3, acrescenta quatro chaves à matriz do ADR-0003. `banco-de-dados` grava a seed; o espelho do cliente é seu.

## O que fazer

Em `packages/core/src/permissions/matrix.ts`:

| Chave                     | owner | admin | member |
| ------------------------- | ----- | ----- | ------ |
| `shopping.create_list`    | sim   | sim   | sim    |
| `shopping.complete_list`  | sim   | sim   | sim    |
| `shopping.manage_catalog` | sim   | sim   | não    |
| `shopping.manage_lists`   | sim   | sim   | não    |

- `member` deixa de ser `[]`. Confira que nada no cliente trata "lista vazia" como "membro comum".
- Acrescente as quatro em `matrix.test.ts`, como as de tarefa.
- Entre no mesmo merge da migration de permissões de `banco-de-dados`, ou `pnpm db:check-permissions` falha nos dois sentidos.

Nenhuma tela de grupos muda.

## Bloqueios e dúvidas

Nenhum. Os valores são padrão a confirmar pelo humano (seção 15, item 1); mudam por uma linha aqui e uma na seed.

## Como testar

`pnpm check`; com a pilha e a migration, `pnpm db:check-permissions`.
