# Handoff: banco-de-dados para backend-funcoes, compras e tarefas-calendario (cópia para auth-grupos)

**De:** banco-de-dados
**Para:** backend-funcoes, compras, tarefas-calendario; auth-grupos para ciência
**Data:** 2026-11-03 05:34 (BRT, derivada de UTC menos 3)
**Branch:** `feat/rate-limits-db` (de `feat/phase-8-polish`, `d738264`)

## Contexto

F8-4 e F8-5 do banco, ADR-0012, seções 4 e 5. Migrations `20261104100000` a `20261104100800` e `20261104110000` a `20261104110200`.

## Contratos

**Erro de limite, em qualquer uso:** `raise exception 'rate_limited' using errcode = 'PT429', hint = '<segundos até o fim da janela>'`. O PostgREST devolve HTTP 429, com `code: "PT429"`, `message: "rate_limited"` e `hint` com um inteiro em texto. É `rateLimitedErrorCode` de `packages/contracts/src/common.ts`. O pedido recusado não conta; só conta o que passou.

| Ação (`rateLimitRules.actions`) | Onde conta                                                    | Limite       |
| ------------------------------- | ------------------------------------------------------------- | ------------ |
| `task_create`                   | todo `insert` em `tasks` por um usuário (`edit_task` incluso) | 200 por hora |
| `occurrence_status`             | `set_occurrence_status`                                       | 600 por hora |
| `shopping_list_create`          | `create_shopping_list`                                        | 30 por hora  |
| `invite_create`                 | todo `insert` em `group_invites` por um usuário               | 30 por dia   |
| `invite_lookup`                 | `get_invite_preview`, código válido ou não                    | 30 por hora  |
| `data_export`                   | só pela service role, ver abaixo                              | 3 por dia    |

Janela fixa alinhada à época (a de 1 dia vira às 00:00 UTC). Quem chama sem usuário (service role, jobs) não conta.

**`public.consume_rate_limit(p_user uuid, p_action text) returns void`**, só `service_role` executa (`authenticated` e `anon` levam `42501`). Ação desconhecida: `rate_limit_action_unknown`, `22023`. `p_user` nulo não conta.

**Stepper:**

- `public.adjust_shopping_item_quantity(p_item_id uuid, p_delta numeric, p_request_id uuid default null) returns shopping_list_items`
- `public.add_catalog_item_to_list(p_list_id uuid, p_catalog_item_id uuid, p_delta numeric, p_request_id uuid default null) returns shopping_list_items`

Com `p_request_id`, o id é gravado em `processed_requests` na mesma transação, depois das checagens; o mesmo id de novo devolve a linha atual (ou `null`, se o item já saiu) sem somar. Um id é um id: usado num caminho, conta como aplicado no outro. Um pedido recusado (`forbidden`, `invalid_argument`, os guardas) não grava o id. Sem `p_request_id`, nada muda. As assinaturas de 2 e 3 argumentos sumiram; chamadas nomeadas sem o id continuam resolvendo. `processed_requests` e `rate_limit_counters` não têm `grant`: o cliente não lê.

## O que cada um precisa fazer

- **backend-funcoes (`account-export`):** antes de ler as tabelas, `supabase.rpc('consume_rate_limit', { p_user: userId, p_action: 'data_export' })` com o cliente da service role. Erro `PT429` vira `rate_limited` com o `hint` como espera. A exportação em si é F8-3.
- **compras:** mandar `p_request_id: input.requestId` nos dois ramos de `packages/data/src/shopping/index.ts` (hoje só `p_item_id` e `p_delta`). Mapear `PT429` de `create_shopping_list` para `errors.rate_limited`. Na fila offline, `rate_limited` descarta com aviso (ADR-0012, seção 5).
- **tarefas-calendario:** `PT429` em criar tarefa (`insert` e `edit_task` com divisão) e em `set_occurrence_status` vira `errors.rate_limited`; na fila, descarta com aviso.
- **auth-grupos (ciência):** `PT429` em criar convite e em `get_invite_preview`. A prévia passou a `volatile` (grava o contador): o `rpc` padrão (POST) segue igual; um `GET` ao PostgREST deixaria de funcionar.

## Testes e pilha local

`supabase/tests/rls_rate_limits.test.sql` (78). Nenhuma E2E deve bater nos limites: os usuários são novos a cada spec e o contador é por usuário. Sem bypass no código: um teste que precise passar de um limite sobe o valor dentro da própria transação (`update app_settings ... rate_limit_rules`), como `rls_shopping_security.test.sql` faz para o teto de 50 listas abertas.

## Bloqueios e dúvidas

Nenhum. Os valores são os da config, a confirmar pelo humano (ADR-0012, seção 17).
