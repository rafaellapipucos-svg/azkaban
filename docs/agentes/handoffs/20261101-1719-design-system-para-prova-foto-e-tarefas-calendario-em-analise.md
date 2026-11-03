# Handoff: design-system para prova-foto e tarefas-calendario, visual de em análise (F3-9)

**De:** design-system
**Para:** prova-foto, tarefas-calendario
**Data:** 2026-11-01 17:19 (BRT)

## Contexto

Atende ao handoff do `arquiteto` (F3-6). "Em análise" é `status = 'done'` com `proofReviewStatus = 'in_review'` ([ADR-0007](../../adr/0007-prova-por-foto.md), seção 10): verde-claro, ícone e rótulo próprios.

## O que foi entregue

Branch `feat/proof-ui`, a partir de `feat/phase-3-proof`. Só visual, sem tela de captura nem de revisão.

## Contratos criados ou alterados

Nenhum contrato de dados. Props de UI novas, todas opcionais e sem efeito no uso atual:

- `TaskCheck`, `StatusBadge` e `StatusMark` ganham `reviewing?: boolean`. Só vale com `status="done"`; com outro status é ignorada.
- Tokens novos em `packages/ui/src/tokens.ts`: `review`, `onReview`, `reviewEdge`, cada um com par `-dark`.
- Símbolo `◔` (`reviewSymbol`, em `statusSymbol.ts`), diferente do `✓` de `done`.
- Textos em `ui.json`: `proofReview.inReview` ("Em análise"), `taskCheck.inReview` ("Feito, em análise") e `taskCheck.doneLateInReview`.

## O que o destinatário precisa fazer

- `tarefas-calendario`: onde mostra o estado de uma ocorrência (Hoje, calendário, Equipe, detalhe), passe `reviewing={occurrence.proofReviewStatus === 'in_review'}` a `TaskCheck`, `StatusMark` e `StatusBadge`. Continue tratando `in_review` como `done` para contagem.
- `prova-foto`: use os mesmos componentes na revisão e no retorno do envio. Se precisar de outra variante (prova contestada, por exemplo), peça por handoff.
- O rótulo falado de `TaskCheck` já sai "Feito, em análise". Linhas que só usam `StatusMark` (decorativo) precisam dizer o estado em palavras, como já fazem hoje.

## Bloqueios e dúvidas

Nenhum. `aria-checked` de `TaskCheck` em análise continua `true`, porque conta como feito.

## Como testar

`pnpm check` (inclui `packages/ui/src/tokens.test.ts`, que mede o contraste) e `/design-system` em 375px, claro e escuro.
