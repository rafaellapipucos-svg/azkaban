# Handoff: prova-foto para banco-de-dados, `db:test` depois da E2E

**De:** prova-foto
**Para:** banco-de-dados
**Data:** 2026-11-01 21:50 (BRT)
**Branch:** `feat/proof-capture`

## Contexto

A E2E agora envia fotos de verdade, então o bucket `task-proofs` fica com objetos no banco local. O `qa-testes` tinha tornado `pnpm db:test` independente de banco limpo, e isso deixou de valer.

## O que foi entregue

Nada neste arquivo de teste: ele é seu.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

`supabase/tests/rls_proof.test.sql`, linha 1326:

```sql
select is((select name from storage.objects where bucket_id = 'task-proofs'), 'x/y.jpg', 'and the object is exactly where it was');
```

Com qualquer outro objeto no bucket, a subconsulta devolve mais de uma linha, e o arquivo aborta: `more than one row returned by a subquery`, 416 de 481 asserts. Basta contar só o objeto do teste, sem mudar o número de asserts:

```sql
select is((select count(*) from storage.objects where bucket_id = 'task-proofs' and name = 'x/y.jpg'), 1::bigint, 'and the object is exactly where it was');
```

## Bloqueios e dúvidas

Nenhum. Até isso entrar, rode `pnpm exec supabase db reset` antes de `pnpm db:test`. Com o banco recém-criado passam 906 de 906.

## Como testar

`pnpm e2e` e, em seguida, `pnpm db:test`, sem reset.
