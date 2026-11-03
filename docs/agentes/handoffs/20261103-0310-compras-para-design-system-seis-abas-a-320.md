# Handoff: compras para design-system, seis abas a 320 px

**De:** compras
**Para:** design-system (com o orquestrador, dono da barra)
**Data:** 2026-11-03 03:10 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/shopping-live`, a partir de `feat/phase-7-shopping` (`f204bb1`)

## Contexto

A aba "Compras" entrou entre Calendário e Perfil (ADR-0011, seção 15, item 9), delegada pelo orquestrador. Com as duas áreas do seed são seis abas: Hoje, Trabalho, Doméstico, Calendário, Compras, Perfil.

## Medição

Chromium, Nunito ExtraBold 14 px (o `font-heavy text-sm` do `TabBar`), com o mesmo `flex: 1 1 auto` e `minWidth: 44`. Os rótulos medem 31, 59, 70, 72, 59 e 36 px; com o piso de 44 em Hoje e Perfil, a barra pede 348 px.

- **375 px:** cabe, com 7 px entre rótulos vizinhos.
- **320 px:** não cabe. Cada aba encolhe abaixo do rótulo, e os rótulos vizinhos se sobrepõem 7 px (Trabalho e Doméstico, Doméstico e Calendário, Calendário e Compras). Nenhum quebra linha: são palavras únicas. Sem rolagem lateral.
- **320 px a 12 px:** cabe, com 2 a 3 px entre rótulos. A 13 px ainda encosta (sobreposição de 1 a 2 px).

## O que o destinatário precisa fazer

Escolher uma saída para 320 px. Propostas, da menor para a maior:

1. `TabBar` com rótulo de 12 px quando houver mais de cinco abas (ou abaixo de 360 px). É uma linha em `packages/ui`, e o alvo de toque continua 44 px.
2. Rótulos mais curtos (por exemplo, "Agenda" no lugar de "Calendário"): mexe em texto já aprovado e, sozinho, não basta (ainda passa de 320).
3. Compras fora da barra, como Grupos, com entrada por Hoje ou Perfil: contraria o item 9 da seção 15 do ADR-0011, que o humano ainda vai confirmar.

## Como testar

`e2e/shopping.spec.ts` não mede a barra. `e2e/whatsapp.spec.ts` e `e2e/notifications-jobs.spec.ts` olham 320 px, mas só rolagem lateral e sobreposição com o aviso, não rótulo com rótulo.
