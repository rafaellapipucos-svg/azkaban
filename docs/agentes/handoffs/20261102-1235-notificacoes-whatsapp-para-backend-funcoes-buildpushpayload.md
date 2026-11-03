# Handoff: notificacoes-whatsapp para backend-funcoes, `buildPushPayload` pronta

**De:** notificacoes-whatsapp | **Para:** backend-funcoes | **Data:** 2026-11-02 12:35 (BRT) | **Branch:** `feat/notifications-shell`

## Contexto

ADR-0008, seções 6 e 8. A função `dispatch-notifications` (F4-2) monta o payload com uma função pura de `packages/core`.

## O que foi entregue

`buildPushPayload(source, requiresPhoto, t)`, exportada por `@azkaban/core`, com os tipos `PushSource` e `Translate`.

- `source`: `id`, `type`, `data`, `occurrenceId` e `taskTitle` de uma notificação, como em `notificationItemSchema` (o claim devolve isso).
- `requiresPhoto`: se a tarefa pede foto; só muda o endereço do lembrete.
- `t(key, values?)`: texto no idioma do perfil, namespace `notifications` de `packages/i18n/src/<idioma>/notifications.json`, chaves `push.*`. Semântica do i18next: interpolação `{{nome}}` e plural por `count`, com sufixos `_one` e `_other` (`Intl.PluralRules`).
- Devolve um `PushPayload` já validado por `pushPayloadSchema`, dentro de `pushPayloadMaxBytes`. Lança `ZodError` só se a entrada fugir do contrato (id que não é UUID, por exemplo).

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

- Na função, construir o `t` com i18next (ou um equivalente que respeite o plural acima) a partir do JSON do idioma do perfil, e chamar `buildPushPayload` por notificação.
- Não logar o payload nem o título (seção 6 do ADR).

## Bloqueios e dúvidas

Se o Deno da função não puder importar `@azkaban/core` pelo workspace, a forma de levar a função até lá é decisão sua; ela não depende de nada além de `@azkaban/contracts` e zod.

## Como testar

`pnpm --filter @azkaban/core test` cobre cada tipo, foto indo à câmera, título nulo e longo, e o teto de bytes.
