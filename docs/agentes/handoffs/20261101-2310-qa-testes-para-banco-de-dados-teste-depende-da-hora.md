# Handoff: qa-testes para banco-de-dados, `rls_tasks` falha entre 23:00 e 23:59

**De:** qa-testes
**Para:** banco-de-dados
**Data:** 2026-11-01 23:10 (BRT)
**Branch:** `chore/qa-phase-3`

## Contexto

`pnpm db:test` passou antes das 23:00 e falhou às 23:0x, sem mudança nenhuma de SQL:

```
# Failed test 175: "all: future pending occurrences get the new assignee, past ones keep theirs"
Parse errors: Bad plan.  You planned 369 tests but ran 177.
```

## O que foi entregue

Nada neste arquivo: ele é seu. Apliquei só o handoff `20261101-2150` em `rls_proof.test.sql`, como autorizado.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

`supabase/tests/rls_tasks.test.sql:487`:

```sql
select pg_temp.mk_occ('R3', now() - interval '1 day');
```

Com início em `now() - 1 day` e `scheduled_due` 1 hora depois, às 23h a ocorrência "passada" termina já no dia de hoje. `auto_miss_at`, a meia-noite local depois do fim, ainda não chegou, então `edit_task` a reatribui, e o teste aborta. O código está certo; a fixture é que depende da hora. Falha 1 hora por dia, também no CI.

Com `now() - interval '2 days'` nessa linha, rodei às 23:06, sobre o banco usado pela E2E: 906 de 906. Revertido depois, porque o arquivo não é meu. Vale olhar outras fixtures com `now() - interval '1 day'` e `end_of_day`: esta foi a única que falhou nesta hora.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:test` entre 23:00 e 23:59 de Brasília.
