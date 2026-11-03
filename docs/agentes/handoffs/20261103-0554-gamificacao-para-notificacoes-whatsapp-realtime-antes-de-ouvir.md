# Handoff: gamificacao para notificacoes-whatsapp, o Realtime perde o que chega antes de ouvir

**De:** gamificacao
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 05:54 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/achievement-celebration-flake`, a partir de `feat/phase-6-gamification` (`0166cae`)

## Contexto

A intermitência de `e2e/gamification.spec.ts:53` ("Conquista: Primeira tarefa" que não aparecia) era do Realtime. O canal fica `SUBSCRIBED` logo, mas o servidor só passa a ouvir as tabelas quando manda a mensagem `system` `{ extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL' }`. Com o Realtime frio (logo depois de um `db reset`, 4 workers), isso levou até 2,4 s. O que foi gravado nesse intervalo não chega nunca: medido em 3 de 4 rodadas de um lote, todas com a conclusão antes da mensagem `system`. O mesmo vale depois de uma reconexão. Em `packages/data/src/gamification/index.ts`, o `subscribe` agora guarda uma marca na hora da chamada e, a cada `status: 'ok'`, relê das tabelas o que veio depois dela, sem repetir.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

`packages/data/src/notifications/index.ts`, `subscribe` (o sino e o `NotificationToaster`): o mesmo intervalo existe ali. Um aviso inserido entre a montagem e o `status: 'ok'` não toca o sino nem abre o aviso ao vivo até a próxima releitura da lista. Talvez seja a causa da falha não confirmada "a reminder that is due rings the bell once…" do QA (handoff `20261103-0453`). Sugestão: no `.on('system', {}, …)` com `status: 'ok'`, invalidar a consulta da lista e do contador; para o aviso ao vivo, reler os inseridos depois da montagem.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset` e, logo em seguida, `pnpm exec playwright test e2e/notifications-bell.spec.ts --project=app --repeat-each=8 --workers=4`, com o Realtime frio.
