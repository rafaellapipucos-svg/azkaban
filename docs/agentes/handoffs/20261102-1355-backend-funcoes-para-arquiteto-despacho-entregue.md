# Handoff: backend-funcoes para arquiteto, o que o despacho fez diferente do ADR-0008

**De:** backend-funcoes | **Para:** arquiteto | **Data:** 2026-11-02 13:55 (BRT, derivada de UTC menos 3) | **Branch:** `feat/notifications-dispatch`

## Contexto

F4-2 e F4-8 entregues (handoff `20261102-1220-arquiteto-para-backend-funcoes-despacho-e-materializacao`). Abaixo, o que ficou fora do texto do ADR-0008 ou além dele, para você registrar ou recusar.

## O que foi entregue

`supabase/functions/dispatch-notifications`: `index.ts` (Deno), `dispatch.ts` (laço, `NotificationChannel`, backoff), `web-push.ts` (`WebPushChannel`, aes128gcm e VAPID em WebCrypto, sem biblioteca), `translate.ts` (o `t`). Passa no vetor do apêndice A da RFC 8291.

## Contratos criados ou alterados

Nenhum em `packages/contracts`. Diferenças em relação ao ADR:

1. **`SendResult`** mantém os quatro tipos da seção 6, e `sent`, `retry` e `failed` levam também `delivered` e `gone`, as listas de inscrições. Com várias inscrições, a forma do ADR não diz quais entregaram e quais morreram, e o report precisa das duas. `gone` sozinho é "todas morreram" e vira `failed` com `push_gone`.
2. **TTL do lembrete** vai até a âncora, com mínimo `minPushTtlSeconds`, e **também com teto `pushTtlSeconds`**. Uma antecedência de 30 dias passa do TTL que alguns serviços aceitam (o FCM fica em 28 dias), e a outbox desiste em `maxDelayHours` de qualquer forma.
3. **Redirecionamento nunca é seguido** (`redirect: 'manual'`): um 3xx é `failed` com `push_redirect`. Seguir levaria o `POST` a um host que a lista não conferiu.
4. **Host conferido na função**: além da regra do ADR (o host ou subdomínio), exige `https:`, porta padrão e URL sem usuário e senha.
5. **`t` sem i18next**: um equivalente de 20 linhas, com chave por ponto, `{{nome}}` sem escape e plural por `Intl.PluralRules` com `_one`/`_other`, o que o handoff de `notificacoes-whatsapp` permite. O i18next seria um download do npm e uma inicialização a mais por partida a frio, para quatro recursos.
6. **Códigos curtos** que vão a `last_error`: `push_gone`, `push_forbidden`, `push_too_large`, `push_redirect`, `push_http_<status>`, `push_rate_limited`, `push_server_error`, `push_network`, `push_endpoint_not_allowed`, `push_bad_keys`, `no_subscription`, `no_channel`, `send_error` (defeito nosso, como um payload que o contrato recusa) e `invalid_item` (linha do claim que não passou no zod).
7. **Nenhum host extra por variável de ambiente.** Os testes injetam um `fetch` falso no `WebPushChannel`, e o teste pela função usa um host fora da lista, que a própria checagem barra. Nada a registrar no ADR sobre isso.
8. Mexi na raiz: `package.json`, script `functions:test`, ganhou os dois arquivos de teste novos. Se preferir outra forma de listar os testes das funções, é sua.

## O que o destinatário precisa fazer

Aceitar ou recusar os itens 1 a 5 e, se aceitar, registrar no ADR-0008.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm functions:test`.
