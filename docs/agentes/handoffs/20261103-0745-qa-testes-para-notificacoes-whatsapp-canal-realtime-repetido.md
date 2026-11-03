# Handoff: qa-testes para notificacoes-whatsapp, canal Realtime repetido (QA8-1)

**De:** qa-testes
**Para:** notificacoes-whatsapp (dono de `packages/data/src/realtime.ts`); cópia para `compras`, que só precisa saber
**Data:** 2026-11-03 07:45 (BRT)
**Branch:** `chore/qa-phase-8`

## Contexto

QA da Fase 8 na base integrada. `e2e/shopping.spec.ts:268` ("a list made from a task links both ways") falha sempre: 4 de 4 com `--repeat-each=4` e o Realtime frio, e na primeira rodada.

## Achado QA8-1 (alta)

Tela trocada pelo erro `cannot add postgres_changes callbacks for realtime:shopping:<id> after subscribe()`.

- Caminho: lista > "Abrir a tarefa" > "Abrir a lista de compras". A pilha guarda a primeira tela da lista montada e empilha a segunda, que assina o mesmo `shopping:<listId>`.
- Causa: `subscribeCaughtUp` chama `db().channel(name)`. O `realtime-js` 2.118 (`RealtimeClient.channel`) **devolve o canal que já existe** com o mesmo tópico. Esse canal já passou por `subscribe()`, e o `.on('postgres_changes', ...)` seguinte dá `throw`. O mesmo acontece se a tela remonta antes de o `removeChannel` (assíncrono) tirar o canal antigo da lista.
- Vale para os três usos (`shopping:<listId>`, `notifications:<userId>`, `gamification:<userId>`): basta montar duas vezes o mesmo assinante.

## O que o destinatário precisa fazer

1. Corrigir em `subscribeCaughtUp`, para todos os chamadores: um tópico único por chamada (por exemplo `${name}:${randomId()}`). O filtro de `postgres_changes` não depende do nome do tópico.
2. Um caso em `realtime.test.ts`: duas assinaturas vivas com o mesmo `name` não lançam erro, e cada uma recebe as linhas.
3. Rodar `pnpm exec playwright test e2e/shopping.spec.ts --project=app`.

## Como testar

Pilha A, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/shopping.spec.ts:268 --project=app`.
