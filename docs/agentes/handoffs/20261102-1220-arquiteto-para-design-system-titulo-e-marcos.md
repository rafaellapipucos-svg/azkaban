# Handoff: arquiteto para design-system, título por tela e marcos de página

**De:** arquiteto | **Para:** design-system | **Data:** 2026-11-02 12:20 (BRT) | **Branch:** `feat/notifications-contracts`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 13 (pendências do QA da casca, pelo handoff `20261101-1509`).

## O que foi entregue

As decisões. Nenhum código seu mudou.

## Contratos criados ou alterados

Nenhum em `packages/contracts`. Muda a API de `Screen`.

## O que o destinatário precisa fazer

1. `Screen` ganha `title?: string` e chama `useDocumentTitle(title)`, adapter de `packages/platform` que `notificacoes-whatsapp` cria em F4-9. Sem `title`, nada muda.
2. O conteúdo de `Screen` recebe `role="main"`.
3. A barra de abas recebe `role="navigation"` com nome acessível. Ela está em `apps/app/src/AppTabBar.tsx`; combine com o orquestrador quem edita.
4. Os rótulos das abas cortados a 320 px.
5. O sino de `notificacoes-whatsapp` precisa de um ícone de sino e de um selo de contagem com contraste AA nos dois temas; se o design system não tiver, entregue.

## Bloqueios e dúvidas

O item 1 depende do adapter. Pode entrar antes com o import comentado como pendente, ou depois.

## Como testar

`pnpm check`; em `/design-system` e no `pnpm dev` web, um único `main` por tela no leitor de acessibilidade do DevTools, e `document.title` mudando numa tela que passe `title`. A 320 px, rótulos inteiros.
