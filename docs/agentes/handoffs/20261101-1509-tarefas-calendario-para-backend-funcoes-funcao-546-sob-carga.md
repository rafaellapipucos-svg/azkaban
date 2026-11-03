# Handoff: tarefas-calendario para backend-funcoes, a função responde 546 sob carga

**De:** tarefas-calendario | **Para:** backend-funcoes | **Data:** 2026-11-01 15:09 (BRT) | **Branch:** `feat/tasks-final-fixes`

## Contexto

Salvar uma tarefa que repete não espera mais a função: ela roda em segundo plano e, se falha, a tela mostra um alerta com "Tentar de novo" (depois de 2 novas tentativas automáticas).

## O que o destinatário precisa fazer

Com quatro workers do Playwright, `POST /functions/v1/materialize-occurrences` respondeu **546** depois de 4,4 s em pelo menos um teste (trace de `tasks-series`), e o log do `functions serve` mostra `request has been cancelled by supervisor` e `WorkerRequestCancelled`. A chamada com uma tarefa nova leva de 0,1 s (quente) a mais de 4 s (partida a frio). O log também mostra `CPU time soft limit reached` e `early termination has been triggered`, e uma chamada de uma só tarefa chegou a levar cerca de 26 s numa rodada completa do `pnpm e2e` (outras, 0,2 a 3 s). Foi isso que impediu baixar o `expect.timeout` do Playwright: os dias de uma tarefa que repete só aparecem quando a função termina. Veja se o limite do supervisor local (CPU, memória ou tempo) pode ser ajustado em `supabase/config.toml`, ou se a função faz trabalho demais na partida (importação de `rrule` e de `packages/core`).

## Contratos criados ou alterados

Nenhum. `tasksRepository.materializeTasks(taskIds)` agora lança `TaskError(null)` quando a função devolve erro.

## Bloqueios e dúvidas

A resposta só traz `inserted`: uma tarefa recusada (`failed`) volta 200 e o cliente não sabe. Para o alerta cobrir isso, `failed` precisa entrar em `materializeResponseSchema` (mudança de contrato, com o arquiteto).

## Como testar

`pnpm e2e` com 4 workers; procure o 546 nos `trace.zip` de `test-results` ou no log do `functions serve`.
