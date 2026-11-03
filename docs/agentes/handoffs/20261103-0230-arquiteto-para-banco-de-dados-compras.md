# Handoff: arquiteto para banco-de-dados, lista de compras da Fase 7

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 02:30 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/shopping-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

F7-1 decidiu a lista de compras no [ADR-0011](../../adr/0011-lista-de-compras.md). Você é o primeiro elo: o repositório, o tempo real e a E2E de `compras` dependem das suas migrations. As funções puras e as telas de `compras` correm em paralelo, contra os contratos.

## O que foi entregue

- ADR-0011 e a seção "Compras" de `docs/arquitetura.md`.
- `packages/contracts/src/shopping-vocabulary.ts`: `shoppingCategories` e `shoppingUnits`, na ordem dos enums.
- `packages/contracts/src/shopping.ts`: linhas, entradas e `shoppingErrorCodeSchema`.
- `packages/config/src/shopping.ts`: `shoppingRules` (espelho, chave `shopping_rules`) e `shoppingDefaults` (sem espelho).
- `packages/config/src/shopping-catalog-seed.ts`: o seed, 44 itens.
- `scripts/check-permission-mirror.mjs` já compara `shopping_rules`, os enums `shopping_category` e `shopping_unit` (ordem incluída) e `shopping_catalog_seed` (em JSON, por `sort_order`). Falha até as suas migrations.

## O que fazer

Uma migration por mudança, com pgTAP. Seções do ADR entre parênteses.

1. **Vocabulário e regras** (1, 13): enums `public.shopping_category` e `public.shopping_unit`, na ordem do contrato; `app_settings.shopping_rules` = `shoppingRules`.
2. **Seed** (2): `shopping_catalog_seed (sort_order int primary key, name, category, default_unit, emoji)`, com `sort_order` = posição × 10, RLS ligada e nenhum `grant` a `anon` nem `authenticated`. `seed_shopping_catalog(p_group_id, p_owner_user_id)` `security definer`, sem `execute` para clientes; triggers `after insert` em `groups` e em `profiles`; preenchimento dos grupos e perfis que já existem.
3. **Tabelas** (1):
   - `shopping_catalog_items`: `id`, `group_id` e `owner_user_id` (exatamente um; `on delete cascade` nos dois), `name` (1 a 80, sem espaço nas pontas), `category`, `default_unit`, `emoji` (até 16), `sort_order int`, `archived_at`, `created_at`. Índices únicos parciais por `(group_id, lower(name))` e `(owner_user_id, lower(name))` onde `archived_at is null` (`catalog_item_exists`).
   - `shopping_lists`: `id` (padrão `gen_random_uuid()`, aceita o do cliente), escopo como acima, `name`, `status` (`open`/`completed`), `linked_task_id` (`on delete set null`), `created_by`, `created_at`, `completed_at`, `completed_by` (`set null`), com `check ((status = 'completed') = (completed_at is not null))`.
   - `shopping_list_items`: `id` (aceita o do cliente), `list_id` (`cascade`), `catalog_item_id` (`set null`), `name`, `category`, `quantity numeric(10,3)` (`> 0` e `<= 9999`), `unit`, `emoji`, `note` (até 200), `added_by`, `added_at`, `checked_at`, `checked_by` (`set null`). `unique (list_id, catalog_item_id)`. Índice por `list_id`.
4. **Permissões** (3): `shopping.create_list` e `shopping.complete_list` para os três papéis; `shopping.manage_catalog` e `shopping.manage_lists` para `owner` e `admin`. `auth-grupos` muda o espelho em `matrix.ts`; os dois precisam entrar no mesmo merge, ou `pnpm db:check-permissions` falha.
5. **RLS, colunas e triggers** (4): a tabela da seção 4; `can_view_shopping_list` e `can_manage_shopping_list`; `grant insert`/`update` só nas colunas listadas; triggers de lista finalizada (`list_completed`), limite com a lista travada (`list_full`), carimbo de `added_by`/`added_at`, escopo do `catalog_item_id`, escopo imutável, limite do catálogo (`catalog_full`) e o vínculo com tarefa (8, `task_link_invalid`).
6. **RPCs** (4, 5): `create_shopping_list`, `complete_shopping_list`, `adjust_shopping_item_quantity`, `add_catalog_item_to_list` (`on conflict (list_id, catalog_item_id) do update`, resultado ≤ 0 apaga) e `set_shopping_item_checked`. Todas travam a lista. Nomes dos argumentos: avise `compras` se mudarem.
7. **Realtime** (7): `shopping_lists` e `shopping_list_items` na publicação `supabase_realtime`, `replica identity` padrão.
8. **Tipos:** `pnpm db:types`.

## Testes de RLS mínimos

- Admin do grupo A não vê lista, item nem catálogo do grupo B; membro não vê lista nem catálogo pessoal de outro; admin não vê lista pessoal de um membro.
- Ex-membro perde lista, itens e catálogo do grupo.
- Membro sem `shopping.manage_catalog` não insere nem atualiza o catálogo do grupo; ninguém apaga linha de catálogo nem lê `shopping_catalog_seed`.
- O cliente não forja `added_by`, `checked_by`, `checked_at`, `status` nem `completed_by`.
- Escrever item em lista finalizada falha com `list_completed`; finalizar duas vezes falha.
- Dois `adjust_shopping_item_quantity` somam; `add_catalog_item_to_list` duas vezes dá uma linha com a soma; delta até zero apaga.
- `catalog_item_id` de outro escopo e cópia `fromListId` de outro escopo falham.
- Vincular tarefa invisível, de outro grupo ou `private` numa lista de grupo falha.
- Grupo e perfil novos nascem com os 44 itens; o preenchimento alcançou os antigos.
- As políticas de `select` das duas tabelas da publicação, como `authenticated` de outro grupo e como ex-membro (ADR-0008, Consequências).

## Depois, F7-5 (depende de F6-2 e do ADR-0010)

Trigger de XP ao finalizar, `xp_events.shopping_list_id` e o `unique` parcial, como na seção 9. Não comece antes de a Fase 6 estender `xp_events`.

## Bloqueios e dúvidas

Nenhum bloqueio. Os padrões da seção 15 podem mudar na aprovação do humano; os mais prováveis (matriz e XP) mudam por uma linha de seed ou de config.

## Como testar

`pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions` (precisa mostrar `Shopping rules`, `Shopping categories`, `Shopping units` e `Shopping catalog seed in sync`) e `pnpm check`.
