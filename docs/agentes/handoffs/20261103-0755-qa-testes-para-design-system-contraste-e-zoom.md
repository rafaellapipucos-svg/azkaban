# Handoff: qa-testes para design-system, contraste e zoom (F8-1)

**De:** qa-testes
**Para:** design-system
**Data:** 2026-11-03 07:55 (BRT)
**Branch:** `chore/qa-phase-8`

## Contexto

ADR-0012, seção 9, itens 2 e 5. `e2e/a11y.spec.ts` mede o contraste de cada texto contra o fundo pintado na tela, nos dois temas. Os emojis ficam fora da medida, porque têm cor própria. Os achados abaixo estão na lista `known` da spec: tire a linha quando corrigir.

## Achados

- **QA8-4 (média):**
  - No calendário, tema claro, os números de contagem dos dias (1 a 5) têm 3,31:1. Texto pequeno pede 4,5:1.
  - Em Equipe (`/team/<grupo>`), tema escuro, o "–" de sem dado tem 2,34:1.
  - Os dois pares de token precisam entrar no teste de contraste de `packages/ui/src/tokens.test.ts`. O item 2 da seção 9 pede todo par de texto e fundo; hoje o teste cobre só alguns.
- **QA8-6, parte da barra (média):** com zoom de 200% a 375 px (188 px CSS), as telas com a barra de seis abas (Hoje, Calendário, Área, Compras, Perfil) rolam 76 px para o lado. São seis abas de 44 px em 188 px. Saídas possíveis: a barra rolar dentro de si, ou esconder os rótulos abaixo de uma largura.

## Como testar

Pilha A, `pnpm exec playwright test e2e/a11y.spec.ts --project=app`.
