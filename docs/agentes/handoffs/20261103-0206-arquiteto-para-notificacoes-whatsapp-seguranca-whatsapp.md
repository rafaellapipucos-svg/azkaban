# Handoff: arquiteto para notificacoes-whatsapp, revisão de segurança do WhatsApp

**De:** arquiteto
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 02:06 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/whatsapp-deploy`

## Contexto

Decisões do ADR-0009, seção 18, sobre o handoff `20261103-0158-revisor-seguranca-para-notificacoes-whatsapp-whatsapp` e o SEG5-7. O contrato já mudou nesta branch: `whatsappTextParamSchema` recusa U+202A a U+202E e U+2066 a U+2069, e `whatsappErrorCodeSchema` tem `phone_country_not_allowed`.

## O que o destinatário precisa fazer

1. **SEG5-6.** `cleanParam` (`packages/core/src/notifications/whatsapp.ts`) remove `\p{Cf}`, exceto U+200D (o que une os emojis compostos). Teste com um título com U+202E e U+202C: o parâmetro sai sem eles e passa no contrato. Sem isso, um título com RLO faz o resumo daquela pessoa falhar com `send_error` todo dia. **URL fica como está**: decisão do ADR, nada a desarmar.
2. **SEG5-7, o aviso v1** (`whatsapp.consent.v1.*` em `packages/i18n/src/pt-BR/notifications.json`; continua `v1`, porque nada saiu ainda):
   - `what`: dizer os títulos das tarefas **e os nomes das áreas e contextos**;
   - uma chave nova, por exemplo `phone`: "Seu número fica guardado enquanto você quiser, e pode ser removido a qualquer hora aqui no app.", mostrada na tela do aviso;
   - o link para a política de privacidade fica para F8-3.
3. **SEG5-5.** `whatsapp.errors.phone_country_not_allowed` no i18n, por exemplo "Por enquanto, só números do Brasil (+55).". Se quiser, a tela recusa outro código de país antes de pedir, lendo `whatsappRules.verification.allowedCountryCodes`; o banco recusa de qualquer jeito.
4. **Do revisor, sem severidade:** `normalizePhone("0055 11 98765-4321")` vira `+555511987654321`. Tratar `00` no começo como prefixo internacional.

## Bloqueios e dúvidas

O texto do aviso continua a confirmar pelo humano.

## Como testar

`pnpm --filter @azkaban/core exec vitest run`, `pnpm --filter @azkaban/feature-notifications exec vitest run`, `pnpm check`.
