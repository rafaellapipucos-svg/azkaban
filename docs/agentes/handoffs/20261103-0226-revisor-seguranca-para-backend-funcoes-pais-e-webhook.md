# Handoff: revisor-seguranca para backend-funcoes, país recusado e estado intermediário do webhook

**De:** revisor-seguranca
**Para:** backend-funcoes
**Data:** 2026-11-03 02:26 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-5`, com `feat/phase-5-whatsapp` (`b2f3e50`)

## Contexto

Segunda passada da revisão de segurança da Fase 5, na pilha B, contra as funções servidas. Passaram: `phone-verification` (sem JWT ou com a chave anon, 401; corpo de 2 KiB e número fora do E.164, 400; o usuário vem do JWT, e um `userId` no corpo é ignorado; reenvio imediato, 429; `GET`, 405); `whatsapp-webhook` (`GET` com token errado ou desafio fora do formato, 403; sem assinatura ou com segredo errado, 401; acima de 1 MiB, 413; assinado e não JSON, 200; PARAR desliga uma vez e confirma uma vez); o despacho manda o resumo pelo console e grava `whatsapp_messages` com `provider = console`. Nenhum telefone, código, `wa_id` ou texto no log do contêiner.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG5-10, baixa. O país recusado vira 500.** `start_phone_verification` devolve `{ error: 'phone_country_not_allowed' }` desde o SEG5-5, mas `startedSchema` em `supabase/functions/phone-verification/index.ts:23-31` só aceita sucesso ou `phone_rate_limited`. PoC: `POST` com `+14155550100` devolveu `500 {"error":"internal"}`, e o log diz `phone_verification_failed` no estágio `start`, o que parece falha do banco. A seção 18 do ADR-0009 pede 400 com `phone_country_not_allowed`, que o contrato e o repositório do app já conhecem. Nada vaza e nenhum código sai; o problema é a mensagem errada na tela e um alarme falso no monitoramento. Correção: acrescentar o caso ao `startedSchema` e responder 400 com o corpo do contrato. Teste de integração com um número `+1`.

**Para registro, sem achado novo (SEG5-3 já é seu):** no estado integrado, o contrato já entrega `statuses` e `messages` como `unknown[]`, mas `readWebhook` ainda não valida cada elemento. Na pilha B, lotes assinados com `messages: [null]`, `from: "abc"` ou `text.body` numérico responderam 500. Com a Meta, um 500 é repetido por até sete dias, e nenhum PARAR do mesmo lote é aplicado. Antes da troca do contrato, o mesmo lote dava 200 e era descartado. A fase não deveria fechar neste estado intermediário.

**Também para registro:** `readWebhook` continua recebendo `WHATSAPP_PHONE_NUMBER_ID` só com `meta` (`whatsapp-webhook/index.ts:71`). Com `console`, a seção 18 aceita o risco (ninguém fica pronto), então não reabro.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm functions:test` com o caso `+1` em `phone-verification`, e os casos de elemento inválido de SEG5-3 no webhook.
