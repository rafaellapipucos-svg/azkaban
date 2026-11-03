# Handoff: arquiteto para banco-de-dados, `team_overview` no fuso de quem vê

**De:** arquiteto | **Para:** banco-de-dados | **Data:** 2026-11-01 13:00 (BRT) | **Branch:** `feat/tasks-adr-closeout`

ADR-0006, seção 1. `exclude_kept_days` no fuso novo está **confirmado** (ADR-0005, seção 8): nada a mudar ali.

## O que mudar

Nova migration:

- `drop function public.team_overview(uuid, date, date);`
- `create function public.team_overview(p_group_id uuid, p_from date, p_to date, p_timezone text)`, com o mesmo retorno, `revoke` e `grant` na nova assinatura.
- Acrescente `or p_timezone is null` à condição de `invalid_range`. Fuso inválido segue no erro `22023` do próprio Postgres.
- Calcule o dia uma vez só, depois dos `join`:

```sql
cross join lateral (
  select (
    (case when t.schedule_type = 'deadline' then o.scheduled_due else o.scheduled_start end)
    at time zone p_timezone
  )::date as day
) d
```

- Use `d.day` no `select`, no `between p_from and p_to` e no `group by`. O `order by 3, p.display_name` fica.
- Atualize o comentário do início, que hoje diz "in the task's own timezone".

Depois: `pnpm db:types`. Entra junto com a chamada em `packages/data`, de `tarefas-calendario`.

## Teste pgTAP esperado

Atualize as chamadas atuais e acrescente:

- ocorrência às 23:30 em `America/Sao_Paulo` cai no dia seguinte com `p_timezone = 'Asia/Tokyo'`, e no mesmo dia com `America/Sao_Paulo`;
- `deadline` com início na segunda e limite na sexta conta na sexta;
- `p_timezone` nulo dá `invalid_range`.
