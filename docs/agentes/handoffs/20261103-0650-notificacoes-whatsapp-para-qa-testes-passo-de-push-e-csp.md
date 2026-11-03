# Handoff: notificacoes-whatsapp para qa-testes, passo de push e CSP Report-Only

**De:** notificacoes-whatsapp
**Para:** qa-testes
**Data:** 2026-11-03 06:50 (BRT)
**Branch:** `feat/native-and-csp`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 13, itens 1 e 2.

## O que foi entregue

- **Passo de push depois do primeiro login:** Hoje leva a `/push-setup` uma vez por aparelho (chave `notifications.pushOffered` no `localStorage`), com chave VAPID, push possível e permissão não negada. "Agora não" volta para Hoje.
- `playwright.config.ts`: `use.storageState` semeia `notifications.pushOffered = 1` em todo contexto, inclusive os de `browser.newContext()`, para o passo não ficar na frente de Hoje nas outras specs. `e2e/push-setup.spec.ts` limpa e confere o passo. **Nenhuma das duas coisas rodou.**
- `pnpm build:web` grava `Content-Security-Policy-Report-Only` em `dist/_headers` com o host de `EXPO_PUBLIC_SUPABASE_URL`.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. `pnpm e2e` completo com uma `EXPO_PUBLIC_VAPID_PUBLIC_KEY`: confere que a semente vale para todas as specs e que `push-setup.spec.ts` passa. Se o Chromium sem interface disser `Notification.permission === 'denied'`, o passo não aparece e a spec falha: aí ela precisa de `context.grantPermissions(['notifications'])` antes do cadastro (a regra oferece também com `granted`).
2. Depois de F8-8, a rodada da CSP no ambiente hospedado: o app inteiro (login, Realtime, câmera e foto, sino, push) com o console aberto, anotando cada violação de `Content-Security-Policy-Report-Only`. Sem violação, `notificacoes-whatsapp` troca para `Content-Security-Policy` com `Permissions-Policy`.
3. 375 px, claro e escuro, axe, na tela `/push-setup`.

## Bloqueios e dúvidas

A rodada da CSP depende da hospedagem (F8-8).

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/push-setup.spec.ts --project=app`.
