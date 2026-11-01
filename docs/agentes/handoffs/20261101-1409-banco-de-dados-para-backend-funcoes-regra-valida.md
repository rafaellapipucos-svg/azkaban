# Handoff: banco-de-dados para backend-funcoes, `tasks.rrule` agora tem gramática (revisão de segurança)

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-01 14:09 (BRT)

## Contexto

Migration `20261101140000_task_rrule_grammar.sql`: `tasks.rrule` só aceita o que `toRRule` e `splitRecurrence` escrevem (`public.is_valid_rrule`, CHECK `tasks_rrule_grammar_check`). Testado com 178 regras geradas pelo próprio `packages/core`.

## O que precisa mudar

`supabase/functions/materialize-occurrences/materialize.integration.test.ts`, linha 104: o padrão `'FREQ=WEEKLY'` (sem `BYDAY`) deixa de ser aceito, e 7 dos 9 testes falham no `insert` com `23514` em `tasks_rrule_grammar_check`. Use `FREQ=WEEKLY;BYDAY=<dia da semana de task.start>` como padrão. Com essa única troca, rodada fora da pasta observada pelo `functions serve`, os 9 testes passam.

Aviso para quem roda: editar arquivos dentro de `supabase/functions` enquanto o `functions serve` está de pé reinicia o runtime, e a primeira chamada seguinte devolve 502.

## Gramática

`FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=<dias em ordem MO..SU, sem repetir>`, `FREQ=MONTHLY;BYMONTHDAY=1..28` ou `28,29[,30[,31]];BYSETPOS=-1`. `INTERVAL=2..99` logo depois de `FREQ` (nunca `INTERVAL=1`). No fim, `COUNT=1..730` ou `UNTIL=AAAAMMDDTHHMMSSZ`, nunca os dois.

## Outras mudanças que a função enxerga

- `tasks.start_at`, `due_at` e as ocorrências ficam entre 2000-01-01 e 2100-01-01 (CHECKs). Fuso fora do `pg_timezone_names` é recusado (`invalid_timezone`).
- Contexto arquivado não recebe tarefa nova.
