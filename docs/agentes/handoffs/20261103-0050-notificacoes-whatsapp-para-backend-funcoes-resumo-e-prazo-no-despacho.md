# Handoff: notificacoes-whatsapp para backend-funcoes, resumo diário e prazo no despacho

**De:** notificacoes-whatsapp | **Para:** backend-funcoes | **Data:** 2026-11-03 00:50 (BRT, derivada de UTC menos 3) | **Branch:** `feat/whatsapp-core`, a partir de `feat/phase-5-whatsapp` (`ae862e3`)

## Contexto

Itens 1 e 2 do handoff `20261103-0030-arquiteto-para-notificacoes-whatsapp-whatsapp`: `daily_summary` no contrato, `buildDailySummary` em core e o prazo do vermelho no push (ADR-0009, seções 5 e 9).

## O que foi entregue

- `packages/core/src/notifications/whatsapp.ts`: `buildDailySummary(source, { locale, budgets, now }, t)`, com a assinatura combinada, devolvendo `DailySummaryRender` já validado por `dailySummaryRenderSchema`. Também `isDailySummaryEmpty`, `cleanParam`, `normalizePhone` e `isWhatsAppReady`.
- As chaves do resumo moram em `packages/i18n/src/pt-BR/notifications.json`, em `whatsapp.summary.*`, no mesmo arquivo que o despacho já lê. Só usam chave com ponto, `{{nome}}` e plural por `count` (`inDays_one`/`inDays_other`). O nome da área vem de `whatsapp.summary.<areaI18nKey>` (`whatsapp.summary.areas.work`, `.home`): o `t` do despacho não lê `contexts.json`.
- `whatsapp.stopReply` é o texto da confirmação do PARAR.
- `pushPayload.ts`: `PushSource` ganhou `timezone`, `overdueAt` e `occurrenceStatus`, opcionais, e `buildPushPayload` ganhou um quarto parâmetro opcional, `late?: { locale, lateCompletionWindowHours, now }`. Com os três campos e o `late`, o `occurrence_missed` do job termina com `lateUntil` ("Ainda dá para concluir até 5 de nov., 00:00"), no fuso do perfil. Sem eles, o texto é o de hoje: o despacho atual continua compilando e subindo.
- `buildPushPayload` lança para `daily_summary`: `notificationUrl` dá `/`, que `internalPathSchema` recusa. O resumo não vai por push nesta fase.

## O que o destinatário precisa fazer

1. **Prazo no push:** em `render()` de `dispatch-notifications/index.ts`, repassar `timezone`, `overdueAt` e `occurrenceStatus` do item do claim para o `PushSource`, e chamar `buildPushPayload(source, requiresPhoto, t, { locale: message.locale, lateCompletionWindowHours: taskRules.lateCompletionWindowHours, now: new Date() })`. `taskRules` está em `packages/config/src/tasks.ts`, sem imports; o `@azkaban/config` do `deno.json` aponta para `notifications.ts`, que não o tem, então importe o arquivo direto, com extensão, como `defaults.ts`. Nenhuma entrada nova no import map para isso.
2. **Resumo no `WhatsAppChannel`:** `whatsapp.ts` não está no grafo de hoje. Para carregá-lo, o `deno.json` precisa de:
   - `@azkaban/contracts` resolvendo também os schemas de `whatsapp.ts` (`dailySummaryRenderSchema`, `phoneE164Schema`). Sugestão: um arquivo seu, por exemplo `supabase/functions/_shared/contracts.ts`, com `export * from '../../../packages/contracts/src/notifications.ts'` e `export * from '../../../packages/contracts/src/whatsapp.ts'`, e `@azkaban/contracts` apontando para ele;
   - as chaves de import relativo sem extensão que entram no grafo, todas com o valor igual à chave mais `.ts`:
     - `"../../../packages/contracts/src/notifications"` (importado por `whatsapp.ts` do contrato)
     - `"../../../packages/contracts/src/tasks"` (idem)
     - `"../../../packages/contracts/src/recurrence"` (importado por `tasks.ts`)
     - `"../../../packages/core/src/recurrence/zone"` (importado por `core/.../whatsapp.ts`; sem imports)
     - `"../../../packages/core/src/notifications/pushPayload"` (idem; o mesmo arquivo de `@azkaban/core`, então é o mesmo módulo)
   - e importar `buildDailySummary` de `../../../packages/core/src/notifications/whatsapp.ts`, com extensão.
     Confira com `deno check` ou subindo a função: sem uma dessas chaves, ela responde 503.
3. Os orçamentos são `whatsappDefaults.summaryBudgets`, e o `t` é o mesmo `makeTranslate` do push. `now` faz parte da assinatura, mas não é lido: a fonte já traz a data.

## Contratos criados ou alterados

- `notificationTypeSchema` e `notificationItemSchema` com `daily_summary` (mudança pré-aprovada, seção 13 do ADR-0009).
- `dailySummaryNotificationDataSchema` mudou de `whatsapp.ts` para `notifications.ts`, porque `whatsapp.ts` importa `notifications.ts` e o ciclo deixaria um dos lados indefinido. Continua exportado por `@azkaban/contracts`.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm --filter @azkaban/core exec vitest run src/notifications`. O teste do despacho com o JSON real (`push.test.ts`) fica com você.
