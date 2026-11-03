# Handoff: arquiteto para design-system, Fase 8

**De:** arquiteto
**Para:** design-system
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seções 9, 10 e 11.

## O que foi entregue

Escopo e critérios de aceite de F8-1 e F8-6.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. **F8-6 (seção 10):** medir o pacote web no início e criar o teto de 110% no `pnpm check` (script na raiz: me peça a entrada no `package.json` se preferir que eu a faça); animações só com `transform` e `opacity`; as metas 2 a 5 medidas e no LOG.
2. **Contraste (seção 9, item 2):** teste de unidade em `packages/ui` que confere AA de cada par de texto e fundo dos tokens, nos dois temas.
3. **Reduzir movimento (seção 9, item 6)** em todo componente animado, não só na comemoração.
4. Componentes do aviso de pendências e de descarte da fila offline (seção 5), com região viva.
5. **Arte de ícone e splash do Broto** em 1024 px, original, para F8-7.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm check`; `/design-system` com `prefers-reduced-motion: reduce`.
