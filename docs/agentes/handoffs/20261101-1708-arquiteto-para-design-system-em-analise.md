# Handoff: arquiteto para design-system, sub-estado em análise (F3-6)

**De:** arquiteto
**Para:** design-system
**Data:** 2026-11-01 17:08 (BRT)

## Contexto

"Em análise" não é um status: é `done` com `proofReviewStatus = 'in_review'` ([ADR-0007](../../adr/0007-prova-por-foto.md), seção 10). A seção 7.6 pede visual verde-claro, e a 7.4 diz que a cor nunca é o único indicador.

## O que foi entregue

Branch `feat/proof-contracts`, a partir de `feat/phase-3-proof`.

## Contratos criados ou alterados

`proofReviewStatusSchema`, em `packages/contracts/src/tasks.ts`.

## O que o destinatário precisa fazer

- Token de cor para em análise, em par claro e escuro, em `packages/ui/src/tokens.ts`, com contraste AA contra o fundo do cartão.
- `StatusMark` com uma variante para em análise: ícone próprio, diferente do ✓ de `done`, e rótulo próprio. Use uma propriedade que não mude o uso atual, como um `reviewing` opcional.
- Mostre a variante em `/design-system`, com os demais estados.

Marcas de prova e câmera usam os componentes que já existem. Se `prova-foto` precisar de outro, ele pede por handoff.

## Bloqueios e dúvidas

Nenhum. Pode rodar em paralelo a F3-2.

## Como testar

`pnpm check` e `/design-system` em 375px, claro e escuro. Sem cor, o leitor de tela e o daltônico distinguem `done` de em análise pelo ícone e pelo rótulo.
