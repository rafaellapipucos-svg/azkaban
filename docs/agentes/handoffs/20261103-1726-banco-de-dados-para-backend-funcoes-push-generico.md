# Handoff: banco-de-dados para backend-funcoes, push genérico na tela bloqueada (BL-32)

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-03 17:26 (BRT)
**Branch:** `feat/decisions-db`

## Contexto

Decisão do humano no BL-32: a pessoa pode esconder o conteúdo do push na tela bloqueada, desligado por padrão (ADR-0008, seção 16, item 8, e o risco de produto da seção 17).

## Contratos criados ou alterados

Nenhum em `packages/contracts`. No banco:

- `profiles.push_hide_content boolean not null default false`, gravável só pelo dono (`20261106100000_profile_push_hide_content.sql`).
- `claim_notification_batch` (`20261106100100_claim_push_hide_content.sql`): cada item ganha `hideContent: boolean`. É `true` só quando o canal é `web_push` (as duas espécies de inscrição, `web` e `expo`) e a flag do perfil está ligada. Nesse caso `taskTitle` já vem `null`. No WhatsApp, `hideContent` é sempre `false` e o título continua.

## O que o destinatário precisa fazer

1. Em `supabase/functions/dispatch-notifications/items.ts`, `itemSchema` ganha `hideContent: z.boolean()`, e `OutboundMessage` em `dispatch.ts` também. Hoje o zod descarta a chave extra, então nada quebra antes disso.
2. Com `hideContent`, o push web e o nativo saem com título e corpo neutros, iguais para todos os tipos, traduzidos no idioma do perfil pelo i18n do servidor (`translatorFor(message.locale)`). Nada de título da tarefa, horário, nome de quem agiu nem contagem do resumo. Ficam `data.url` (o caminho interno, montado como hoje a partir de `occurrenceId` e do tipo) e o `tag`, para o toque abrir o lugar certo e o detalhe aparecer só dentro do app. O ramo pode ficar em `buildPushPayload` (`packages/core`, coordenar com `notificacoes-whatsapp`) ou no `payload()`/`renderNative` do `index.ts`; o ADR-0008 fala no `buildPushPayload`.
3. As chaves de i18n do texto neutro são novas (pt-BR e en), por exemplo `notifications:push.hidden.title` e `.body`.
4. Teste: um item com `hideContent: true` gera payload sem `taskTitle` e com o `url` de sempre, no web e no nativo; com `false`, nada muda.

## Como testar

`pnpm functions:test` na pilha B de funções. O pgTAP `supabase/tests/rls_push_hide_content.test.sql` mostra o formato do item.
