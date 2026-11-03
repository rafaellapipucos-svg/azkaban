# Handoff: banco-de-dados para compras, schema da lista de compras

**De:** banco-de-dados
**Para:** compras
**Data:** 2026-11-03 02:54 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/shopping-db`, a partir de `feat/phase-7-shopping` (`b30a4b0`)

## Contexto

F7-1, parte do banco, do [ADR-0011](../../adr/0011-lista-de-compras.md). O repositório em `packages/data/src/shopping`, a assinatura do Realtime e a E2E dependem destas migrations. O XP de compra (F7-5) não entrou: espera a Fase 6.

## O que foi entregue

Migrations `20261103170000` a `20261103170800`: enums `shopping_category` e `shopping_unit`, `app_settings.shopping_rules`, as quatro chaves de permissão, `shopping_catalog_items`, `shopping_catalog_seed` com a cópia para grupos e perfis (novos e existentes), `shopping_lists`, `shopping_list_items`, as cinco RPCs e a publicação do Realtime. Tipos em `packages/data/src/database.types.ts`.

## Contratos criados ou alterados

Nenhum. As assinaturas seguem o ADR e os nomes do contrato:

```sql
create_shopping_list(p_id uuid, p_group_id uuid, p_name text, p_from_list_id uuid default null)
  returns public.shopping_lists
complete_shopping_list(p_list_id uuid) returns public.shopping_lists
adjust_shopping_item_quantity(p_item_id uuid, p_delta numeric) returns public.shopping_list_items
add_catalog_item_to_list(p_list_id uuid, p_catalog_item_id uuid, p_delta numeric)
  returns public.shopping_list_items
set_shopping_item_checked(p_item_id uuid, p_checked boolean) returns public.shopping_list_items
```

## O que o destinatário precisa fazer

- **Criar lista:** só pela RPC. `p_id` e `p_group_id` aceitam `null` (os tipos gerados dizem `string`; passe `null` com o mesmo contorno usado nos outros repositórios). `p_group_id` nulo é lista pessoal. Repetir o mesmo `p_id` dá `23505` (chave primária), não duplica.
- **Retornos nulos:** `adjust_shopping_item_quantity`, `add_catalog_item_to_list` e `set_shopping_item_checked` devolvem nulo quando o item não existe mais (removido por outra pessoa ou por este delta). Não verifiquei como o PostgREST serializa esse nulo composto (`null` ou um objeto com todos os campos nulos): trate os dois como "o item sumiu". `add_catalog_item_to_list` com delta negativo num item que não está na lista também devolve nulo.
- **Stepper:** o banco limita a soma a 9999 em vez de falhar. Delta `0` ou `null` dá `invalid_argument` (`22023`).
- **Marcar:** marcar um item já marcado mantém quem marcou primeiro e quando.
- **Catálogo pessoal:** `insert` direto com `owner_user_id` = o próprio id e `group_id` nulo; no do grupo, `group_id` e `owner_user_id` nulo. O banco não preenche `owner_user_id` sozinho. Sem `delete`: arquivar é `update` de `archived_at`.
- **Item avulso:** `insert` direto em `shopping_list_items`, com `id` opcional do cliente; `added_by`, `added_at`, `checked_*` o banco carimba.
- **Erros** (mensagem e `code` do PostgREST):
  - `forbidden` (`42501`): sem permissão, lista invisível, catálogo de outro escopo, cópia de outro escopo. Uma coluna não liberada também dá `42501`, com outra mensagem.
  - `list_completed` (`P0001`): qualquer escrita em item ou lista finalizada, e finalizar duas vezes.
  - `list_full` e `catalog_full` (`54000`).
  - `catalog_item_exists` (`23505`). Numa corrida rara, o índice único responde `23505` com a mensagem padrão do Postgres.
  - `task_link_invalid` (`22023`).
  - `invalid_argument` (`22023`).
- **Realtime:** `shopping_lists` e `shopping_list_items` estão na publicação; o catálogo não. O `DELETE` chega só com o `id`.
- **Catálogo e escopo:** lista pessoal só aceita item do catálogo pessoal; lista do grupo, só do catálogo do grupo.

## Bloqueios e dúvidas

- `pnpm db:check-permissions` só fica verde quando o `matrix.ts` do `auth-grupos` entrar no mesmo merge.

## Como testar

`pnpm exec supabase db reset` e `pnpm db:test` (`supabase/tests/rls_shopping.test.sql`, 135 testes).
