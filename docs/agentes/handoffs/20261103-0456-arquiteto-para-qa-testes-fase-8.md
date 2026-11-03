# Handoff: arquiteto para qa-testes, Fase 8

**De:** arquiteto
**Para:** qa-testes
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seções 9, 10 e 16. F8-1 e F8-2 são seus.

## O que foi entregue

Critérios de aceite de F8-1 e metas de F8-6.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. **F8-1 (seção 9):** `@axe-core/playwright` como dependência de desenvolvimento, zero `serious` e `critical` no percurso de `e2e/walk.ts`; reduzir movimento com `reducedMotion: 'reduce'`; teclado; texto a 200% a 375 px. Achados por handoff a cada dono.
2. **F8-2:** E2E completo dos fluxos críticos (login, criar tarefa, concluir com foto, resumo com provedor de teste), mais exportar, excluir (inclusive `owns_groups` e `reauth_required`) e a fila offline (`context.setOffline`, recarregar, voltar), quando cada entrega existir.
3. **F8-6 (seção 10):** as metas 2 a 5 medidas e registradas no LOG (contagem de requisições em Hoje, lista de 200 itens com CPU 4×, quadros do confete, Lighthouse nas boas-vindas).
4. Conferir, com `notificacoes-whatsapp`, a rodada da CSP Report-Only quando houver ambiente hospedado.

## Bloqueios e dúvidas

O leitor de tela real é do humano se ninguém tiver (seção 17, item 14).

## Como testar

`pnpm e2e` com a pilha.
