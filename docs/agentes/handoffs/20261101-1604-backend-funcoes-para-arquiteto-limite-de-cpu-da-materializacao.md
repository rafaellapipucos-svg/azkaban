# Handoff: backend-funcoes para arquiteto, limite de CPU da materialização (contrato e padrões)

**De:** backend-funcoes | **Para:** arquiteto | **Data:** 2026-11-01 16:04 (BRT) | **Branch:** `feat/tasks-materialize-cpu`

## Contexto

A Supabase documenta 2 s de CPU por requisição numa Edge Function (sem contar espera de I/O), 150 s de duração por worker no plano gratuito e 400 s nos pagos (https://supabase.com/docs/guides/functions/limits). O 546 (`WORKER_LIMIT`) era real, não do ambiente de teste: no baseline, com a base local, 1.000 tarefas recorrentes sem cursor derrubaram a chamada em 20 s, e 10 tarefas diárias com âncora em 2000 também (5,7 s). Causa: a função expandia de `coalesce(materialized_until, âncora)`, e o `rrule` itera da âncora até o fim da janela (cerca de 3 µs por dia iterado: ~30 ms de CPU por tarefa diária de 2000, mesmo com cursor atual). Detalhes na entrada do LOG.

## O que mudou na função (sem mudar contrato)

- Piso de passado: a expansão não começa antes de `agora - 30 dias`. Hoje é a constante local `PAST_DAYS = 30` em `index.ts`.
- Cursor movido por tarefa, logo depois do insert dela.
- Orçamento por execução: para em 600 ms de expansão ou 200 tarefas, o que vier primeiro. O resto fica com os cursores mais antigos e é o primeiro da próxima execução (ordem: cursor mais antigo, nunca materializadas primeiro).
- O cron sem `until` ignora tarefa cujo cursor está a menos de 12 h do limite.

## O que o arquiteto precisa decidir

1. **`taskDefaults.materializationPastDays` (valor 30) em `packages/config`**, no lugar da constante local. Justificativa do valor: o responsável só resolve até `lateCompletionWindowHours` (72 h) depois do prazo, então dias mais velhos que um mês são só histórico.
2. **Resposta da função.** Hoje `materializeResponseSchema` é `{ inserted }`. Recomendo acrescentar `failed: int ≥ 0` (tarefas que o banco recusou ou cuja regra não expande) e `deferred: int ≥ 0` (tarefas que ficaram para a próxima execução por causa do orçamento). A função já calcula os dois e os registra no log; devolvê-los é trivial. Com isso, o cliente pode:
   - mostrar o alerta de erro (hoje `failed` volta 200 e a tela não sabe);
   - chamar de novo quando `deferred > 0` depois de editar uma série.
     Enquanto o contrato não mudar, a função segue devolvendo só `inserted`.
3. **ADR-0005, seção 7.** Duas frases passam a ser aproximações: "cada tarefa expande de `coalesce(materialized_until, âncora)`" (agora com piso de 30 dias) e "o cron diário cobre a janela de `materializationWindowDays`" (agora cobre a janela por orçamento: com mais tarefas do que cabem em uma execução, cada tarefa é renovada a cada N/200 dias). Não editei o ADR.

## Como testar

`pnpm exec supabase functions serve` e `pnpm functions:test` (12 testes; os três novos cobrem o piso, o orçamento e o cursor por tarefa).
