# Handoff: arquiteto para backend-funcoes, despacho de notificações e materialização (F4-2 e F4-8)

**De:** arquiteto | **Para:** backend-funcoes | **Data:** 2026-11-02 12:20 (BRT) | **Branch:** `feat/notifications-contracts`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seções 6, 8 e 12. Respondo também ao handoff `20261101-1604-backend-funcoes-para-arquiteto-limite-de-cpu-da-materializacao.md`. F4-6 saiu do seu escopo: o vermelho automático é uma função SQL, com `banco-de-dados`.

## O que foi entregue

- `materializeResponseSchema = { inserted, failed, deferred }`, com padrão 0 nos dois novos só para o cliente ler uma função antiga.
- `taskDefaults.materializationPastDays = 30`.
- `notificationDefaults` (lote, orçamento, concessão, backoff, atraso máximo, TTL) e `notificationRules.pushEndpointHosts`.
- `pushPayloadSchema` e `pushPayloadMaxBytes`.

## Contratos criados ou alterados

`packages/contracts/src/tasks.ts` (`materializeResponseSchema`), `packages/contracts/src/notifications.ts`, `packages/config/src/tasks.ts`, `packages/config/src/notifications.ts`.

## O que o destinatário precisa fazer

**F4-8, pode começar já, sem esperar ninguém:**

1. `materialize-occurrences` devolve `materializeResponseSchema.parse({ inserted, failed, deferred })` com os totais que já calcula, status 200.
2. Trocar `PAST_DAYS` por `taskDefaults.materializationPastDays`.
3. Mover `readLimited` de `proof-validate/body.ts` para `_shared`, e usá-lo na leitura do corpo em `materialize-occurrences/index.ts:290`, no lugar de `req.text()`, com teto de 8 KiB e `proofDefaults.uploadTimeoutSeconds`. Corpo acima do teto é `400 invalid_request`.
4. Migration: `call_materialize_occurrences` levanta `materialize_not_configured` sem os segredos do Vault, como `call_proof_retention`. Atualize `docs/implantacao.md`.
5. A função vai ao ar antes do cliente novo.

**F4-2, depois das migrations de `banco-de-dados` (o handoff dele traz o formato do claim):**

6. `dispatch-notifications`, só com `x-cron-secret`, no laço da seção 6: claim, montar, enviar, report, até `dispatchBudgetMs`.
7. `NotificationChannel` com `WebPushChannel`, na forma da seção 6. Confira o host do endpoint de novo antes do `POST`.
8. Web Push: `aes128gcm` e VAPID (RFC 8291 e 8292), `TTL`, `Urgency`, o tratamento de respostas da seção 8 (403 não apaga a inscrição). A biblioteca é sua escolha, sem custo e sem serviço terceiro, e precisa passar no vetor de teste do apêndice A da RFC 8291. Um vetor que falha descarta a biblioteca.
9. O texto vem de `buildPushPayload`, em `packages/core/src/notifications`, que `notificacoes-whatsapp` escreve, com as strings de `packages/i18n`, pelo `deno.json`, como `@azkaban/core`. Até lá, use um stub local e troque.
10. Segredos `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` e `VAPID_SUBJECT`: nomes em `supabase/functions/.env.example`, sem valor; o comando de gerar o par e a conferência de que a pública é a mesma de `EXPO_PUBLIC_VAPID_PUBLIC_KEY` em `docs/implantacao.md`. Nunca commite um par, nem o local. Sem os segredos, a função responde 500 `vapid_not_configured` e não reivindica nada.
11. Backoff e `Retry-After` com os valores de `notificationDefaults`. Logs só com contagens e códigos.

## Bloqueios e dúvidas

F4-2 depende de F4-1. Para testar contra um serviço de push local, um host extra pode ser aceito só por variável de ambiente do `.env` local, nunca em produção; registre isso no ADR por handoff se fizer.

## Como testar

`pnpm db:start`, `pnpm functions:test`:

- F4-8: `failed` e `deferred` no corpo, inclusive o caso do orçamento já testado; corpo de 9 KiB recusado sem ler tudo; a migration falha a execução do cron sem Vault (`cron.job_run_details`).
- F4-2: vetor da RFC 8291; um servidor de push falso que responde 201, 404, 410, 403, 429 com `Retry-After`, 500 e queda de conexão, com o estado esperado da outbox e das inscrições para cada um; duas inscrições, uma morta e uma viva, dão `sent` e apagam só a morta; função que morre entre enviar e informar reenvia depois da concessão; `x-cron-secret` errado dá 401.
- Mutação: tire a checagem de host da função e o teto do corpo, um de cada vez.
