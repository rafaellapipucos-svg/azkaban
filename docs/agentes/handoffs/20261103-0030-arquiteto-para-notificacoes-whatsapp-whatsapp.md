# Handoff: arquiteto para notificacoes-whatsapp, WhatsApp da Fase 5

**De:** arquiteto
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 00:30 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/whatsapp-adr`, a partir de `feat/phase-4-notifications` (`e54968d`)

## Contexto

F5-1 decidiu o WhatsApp no [ADR-0009](../../adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md). Responde também ao seu handoff `20261102-1451`: **opção (a)**, o claim devolve `overdueAt`, `occurrenceStatus` e o `timezone` do perfil (seção 9).

## Contratos e config

- `packages/contracts/src/whatsapp.ts`: `phoneE164Schema`, `phoneVerification*`, `whatsappOptInSchema`, `whatsappStatusSchema`, `dailySummaryPreferencesSchema`, `dailySummarySourceSchema`, `dailySummaryRenderSchema`, `whatsappTextParamSchema`, `whatsappErrorCodeSchema` e `dailySummaryNotificationDataSchema`.
- `whatsappRules` (consentimento, verificação, padrões do resumo) e `whatsappDefaults` (`summaryBudgets`, `templates`).
- `notificationRules.whatsappTypes`. **A tela de preferências mostra o WhatsApp só para esses tipos**: `activeChannels` já tem `whatsapp`, e hoje a tela mostra a coluna para todos.

## O que fazer

1. **Contrato, mudança pré-aprovada** (seção 13): `daily_summary` em `notificationTypeSchema` e em `notificationItemSchema`, com `data = dailySummaryNotificationDataSchema`, no mesmo commit dos casos em `buildPushPayload` e `notificationUrl` (→ `/`) e no sino. A linha nasce lida. O aviso ao vivo ignora linha já lida.
2. **Core:**
   - `buildDailySummary(source, { locale, budgets, now }, t)`: seção 5, agrupamento, cortes com "+N", limpeza de controle e de espaços, vazio, fecho neutro até a Fase 6, e saída validada por `dailySummaryRenderSchema`;
   - `normalizePhone` (espaços, traços, parênteses; `+55` quando não há `+`);
   - `isWhatsAppReady(status)`;
   - o prazo no push: `PushSource` com os três campos opcionais e a frase do `occurrence_missed` do job.

   Use só o que o `t` curto do despacho entende. O `deno.json` do despacho mapeia `@azkaban/core` para `pushPayload.ts`: se o resumo ficar em outro arquivo, avise o `backend-funcoes`.

3. **i18n:** `whatsapp.summary.*`, `whatsapp.stopReply` (texto curto do PARAR, no idioma padrão), `whatsapp.consent.v1.*` (o aviso da seção 4, com o nome do app, o número, o que chega, que passa pela Meta, sem custo, e como parar) e as telas.
4. **Dados:** no repositório de notificações, chamada a `phone-verification` e às RPCs `confirm_phone_verification`, `remove_phone`, `whatsapp_opt_in`, `whatsapp_opt_out`; leitura de `whatsappStatusSchema` e das preferências do resumo; escrita das cinco colunas `daily_summary_*`.
5. **Telas**, em configurações de notificações:
   - telefone, com o país `+55` por padrão;
   - código, com o tamanho de `codeLength`, contagem regressiva até `resendAt` e `retryAfterSeconds`;
   - aviso e ativação;
   - desligar e remover o número;
   - preferências do resumo.

   Códigos de erro pelo contrato. 375 px e desktop, claro e escuro.

6. E2E (pode ficar com o `qa-testes`): verificar o número lendo o código em `whatsapp_console_messages` com service role, ativar, rodar `enqueue_daily_summaries` e o despacho, e ler o resumo na mesma tabela.

## Paralelo e dependências

- 1 e 2 começam já, sem banco.
- As telas (4 e 5) precisam das RPCs do `banco-de-dados` e da função `phone-verification` do `backend-funcoes`. Os testes de unidade não.
- O `backend-funcoes` usa um dublê de `buildDailySummary` até o seu chegar. A assinatura acima é o acordo.

## Bloqueios e dúvidas

Nenhum. O texto do aviso de consentimento é rascunho até o humano revisar (ADR-0009, seção 16).

## Como testar

`pnpm check`; `pnpm --filter @azkaban/core exec vitest run src/notifications`.
