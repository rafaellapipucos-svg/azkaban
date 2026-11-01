# Handoff: arquiteto para backend-funcoes, materialização (F2-5)

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-01 09:35 (BRT)

## Contexto

As ocorrências de tarefas recorrentes precisam de expansão de RRULE, que o Postgres não faz. Só esta Edge Function as insere. As regras estão na seção 7 do [ADR-0005](../../adr/0005-tarefas-ocorrencias-recorrencia.md).

## O que foi entregue

Branch `feat/tasks-contracts`, a partir de `feat/phase-2-tasks`.

## Contratos criados ou alterados

- `materializeRequestSchema` e `materializeResponseSchema`, em `packages/contracts/src/tasks.ts`.
- `taskDefaults.materializationWindowDays` (60) e `taskDefaults.onDemandMaxDays` (366), em `packages/config/src/tasks.ts`.

## O que o destinatário precisa fazer

Criar `supabase/functions/materialize-occurrences/index.ts`.

**Quem chama:**

| Origem  | Autenticação           | Corpo                | Tarefas alcançadas                               |
| ------- | ---------------------- | -------------------- | ------------------------------------------------ |
| Cron    | Header `x-cron-secret` | Vazio                | Todas as recorrentes não arquivadas              |
| Usuário | JWT                    | `taskIds` ou `until` | As recorrentes que a RLS desse usuário deixa ler |

Sem nenhuma das duas autenticações, responda 401. Um usuário com corpo vazio recebe 400: a varredura completa é só do cron. Valide o corpo com `materializeRequestSchema`.

**Passos:**

1. Com a identidade de quem chamou, liste as tarefas, sem service role no caso do usuário. Filtro: `rrule is not null`, `archived_at is null`.
2. Ignore tarefas de grupo cujo responsável não seja mais membro.
3. Limite: `until`, no máximo `now + onDemandMaxDays`. Sem `until`, `now + materializationWindowDays`.
4. Para cada tarefa, expanda com `expandOccurrences(task, from, limite)` de `packages/core`, com `from = coalesce(materialized_until, âncora)` e âncora `coalesce(start_at, due_at)`. Tire os instantes de `exdates`.
5. Com service role, insira `task_id`, `assignee_id`, `scheduled_start`, `scheduled_due`, com `on conflict (task_id, scheduled_start) do nothing`. `overdue_at` e `status` vêm do banco.
6. Grave `materialized_until = limite` só depois do insert, e só para frente, com `greatest`. Se falhar no meio, a repetição é segura.
7. Responda `{ inserted }`.

**Regras:**

- Reaproveite `packages/core`, nunca uma segunda expansão. O `deno.json` da função precisa de import map para `@azkaban/core`, `@azkaban/contracts`, `@azkaban/config` e as dependências npm. Confirme que `supabase functions deploy` empacota esses caminhos relativos.
- Segredos só em variáveis da função. `CRON_SECRET` também vai ao Vault, com o nome `cron_secret`, e `materialize_url` guarda a URL. O agendamento é de `banco-de-dados`.
- Compare `x-cron-secret` em tempo constante.
- Logs sem título, notas ou ids de usuário: só contagens.

## Bloqueios e dúvidas

- Depende de F2-2 e de `expandOccurrences` (F2-4).
- O job de vermelho automático é F4-6. Quando chegar, é só um `update` para `missed` das ocorrências `pending` com `overdue_at <= now()` e responsável ainda membro: os triggers cuidam de histórico e XP.

## Como testar

- `supabase functions serve` com `pnpm db:start`.
- Tarefa semanal: 60 dias geram as ocorrências certas, e repetir insere zero.
- Instante em `exdates` não volta.
- `until` acima do limite é cortado.
- Usuário sem acesso à tarefa não materializa nada.
- Corpo vazio com JWT dá 400, e sem autenticação dá 401.
- Cursor: depois de `all` com mudança de agenda, nenhuma ocorrência nasce no passado.
