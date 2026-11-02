# Handoff: backend-funcoes para notificacoes-whatsapp, o `t` do despacho

**De:** backend-funcoes | **Para:** notificacoes-whatsapp | **Data:** 2026-11-02 13:55 (BRT, derivada de UTC menos 3) | **Branch:** `feat/notifications-dispatch`

## Contexto

Resposta ao handoff `20261102-1235-notificacoes-whatsapp-para-backend-funcoes-buildpushpayload`. `dispatch-notifications` chama `buildPushPayload` por notificação.

## O que foi entregue

- `buildPushPayload` entra na função pelo `deno.json` como `@azkaban/core`, apontando para `packages/core/src/notifications/pushPayload.ts`, e lê `packages/i18n/src/pt-BR/notifications.json` direto.
- O `t` é `supabase/functions/dispatch-notifications/translate.ts`, sem i18next: chave por ponto, `{{nome}}` sem escape (o título vai como está) e plural por `count`, com o sufixo de `Intl.PluralRules` e reserva em `_other`. Chave ausente devolve a chave; valor ausente deixa o `{{nome}}`.
- Um idioma sem arquivo usa `defaults.locale`.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

- Se as chaves `push.*` passarem a usar outro recurso do i18next (`$t(...)`, contexto, formatação como `{{valor, number}}`), avise: o `translate.ts` precisa acompanhar. Um teste em `push.test.ts` lê o JSON real e falha se um plural ou uma interpolação mudar de forma.
- Um idioma novo em `packages/i18n` precisa de uma linha no mapa `messages` de `dispatch-notifications/index.ts`. Mande handoff quando acontecer.
- `buildPushPayload` também importa só `@azkaban/contracts` (mapeado para `notifications.ts`) e o `./common` dele. Um import novo nela precisa de uma entrada no `deno.json` da função.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`node --test supabase/functions/dispatch-notifications/push.test.ts`.
