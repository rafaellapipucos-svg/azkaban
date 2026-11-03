# Handoff: revisor-seguranca para backend-funcoes, provedor falso do push nativo por padrão (BL23-1)

**De:** revisor-seguranca
**Para:** backend-funcoes (e, para conhecimento, arquiteto, dono de `docs/implantacao.md`)
**Data:** 2026-11-03 11:04 (BRT, derivada de UTC menos 3)
**Branch:** `review/backlog-security` (de `feat/backlog-after-phase-8`, `960c107`)

## Contexto

BL-23, revisão de segurança do backlog pós-Fase 8 (`c74cce6..960c107`). O `NativePushChannel` está correto no que importa para segredos e tokens: `redirect: 'manual'`, timeout, resposta lida com limite e validada com Zod, `EXPO_ACCESS_TOKEN` só do env e em campo privado, logs só com evento e contagem. Um achado médio, de disponibilidade.

## BL23-1 (média): sem `NATIVE_PUSH_PROVIDER`, o push nativo de produção some em silêncio

`supabase/functions/dispatch-notifications/native-push.ts:150` e `:157`, chamado em `dispatch-notifications/index.ts:162`.

Vazio ou ausente vira `fake`. O `fakeExpoFetch` responde `ok` a cada token, então:

1. `combine` (`web-push.ts:225`) dá `sent`, e a linha do outbox fecha como entregue, sem repetição.
2. `report_notification_results` grava `last_success_at = now()` nas inscrições `expo`, e a poda de 90 dias sem entrega nunca apaga esses aparelhos.
3. O único sinal é `{"event":"native_push_fake"}` no `console.log`, igual ao de um ambiente local que funciona.

Cenário: no BL-29 alguém liga `features.nativePush` no app e esquece `NATIVE_PUSH_PROVIDER=expo` no projeto (ou o `supabase secrets set` falha só nessa chave). Cada lembrete de tarefa, prova em revisão e resumo do dia de quem usa o celular é dado como entregue e nunca chega. Nada no banco nem no app mostra falha. O `docs/implantacao.md` ainda não cita os dois segredos (item 1 do handoff `20261103-1053`).

O ramo "não configurado" já existe e faz a coisa certa: as inscrições `expo` repetem com `native_push_not_configured` até `maxAttempts`, sem derrubar o navegador da mesma pessoa. O problema é só qual ramo é o padrão.

## O que fazer

1. Em `nativePushTransport`, ausente ou vazio deixa de ser `fake` e passa a ser "não configurado" (`null`). `fake` só quando escrito: `NATIVE_PUSH_PROVIDER=fake`.
2. `supabase/functions/.env.example`: `NATIVE_PUSH_PROVIDER=fake`, com o comentário trocado ("vazio ou ausente: não configurado, os aparelhos esperam e falham"). A pilha local e o CI copiam esse arquivo, então os testes de integração seguem iguais.
3. Teste em `push.test.ts`: `nativePushTransport({})` e `{ NATIVE_PUSH_PROVIDER: '' }` devolvem `null` e logam `native_push_not_configured`; `{ NATIVE_PUSH_PROVIDER: 'fake' }` devolve o falso.
4. Arquiteto: ao listar os segredos em `docs/implantacao.md`, dizer que produção exige `expo` e o token, e que `fake` é só local.

Se preferirem manter o `fake` como padrão, por paridade com o `console` do WhatsApp, a alternativa mínima é o despacho recusar `fake` fora da pilha local (por exemplo, quando `SUPABASE_URL` não é `http://kong:8000` nem `127.0.0.1`) e logar `native_push_not_configured`. A primeira opção é mais simples.

## Como testar

`pnpm check`; `pnpm functions:test` na pilha (o `.env` local vindo do novo `.env.example`).
