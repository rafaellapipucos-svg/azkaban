# Handoff: arquiteto para banco-de-dados, revisão de segurança da Fase 7

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 03:28 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch de origem:** `docs/shopping-security-decisions`, a partir de `feat/phase-7-shopping` (`b5e70fa`)

## Contexto

Decisões sobre SEG7-1 a SEG7-6 no [ADR-0011](../../adr/0011-lista-de-compras.md), seção 16. Responde também ao handoff `20261103-0321-revisor-seguranca-para-banco-de-dados-compras`.

## O que foi entregue

- `shoppingRules.maxOpenListsPerScope = 50` em `packages/config/src/shopping.ts`.
- `lists_full` em `shoppingErrorCodeSchema`.
- `shoppingControlCharacterPattern` e `shoppingNameSchema` em `packages/contracts/src/shopping.ts`, aplicados a nome, nota e emoji.

## O que fazer

Migrations novas; nenhuma mergeada é editada.

1. **SEG7-2, espelho:** `app_settings.shopping_rules` ganha `"maxOpenListsPerScope": 50`. `pnpm db:check-permissions` acusa a diferença até lá.
2. **SEG7-2, teto:** em `create_shopping_list`, depois da permissão e antes de inserir (com `p_from_list_id` também): `pg_advisory_xact_lock` por escopo, contar as listas `open` do grupo, ou as pessoais `open` de `auth.uid()`, e `raise exception 'lists_full' using errcode = '54000'` no teto. Finalizadas não contam.
3. **SEG7-5, na mesma função:** com `p_from_list_id`, conferir a visibilidade da origem antes do `for update` e devolver `forbidden` tanto para lista alheia quanto para inexistente. As outras RPCs ficam como estão.
4. **SEG7-3:** um `check` validado (sem `not valid`) em `shopping_catalog_items.name` e `emoji`, `shopping_lists.name`, `shopping_list_items.name`, `note` e `emoji`. Use a classe explícita do ADR (seção 16), não `[[:cntrl:]]`, que depende do locale. Ela é o mesmo conjunto de `shoppingControlCharacterPattern`. Nenhuma outra tabela do app muda.
5. **SEG7-4:** o desvio por `pg_trigger_depth() > 1` nos dois guardas passa a aceitar só o que uma ação de chave estrangeira faz (as colunas estão no ADR). Precisa entrar antes de F7-5.
6. **SEG7-6:** `invalid_argument` também para `p_delta = 'NaN'` e `abs(p_delta) = 'Infinity'`, nas duas RPCs com delta.
7. **pgTAP:** a 50ª lista aberta entra e a 51ª dá `lists_full`, no grupo e na pessoal, sem que uma conte para a outra; finalizar uma libera a vaga; `p_from_list_id` no teto também recusa. Cada `check` recusa LF, U+0085, U+2028, U+202E e U+2066 e aceita um emoji com ZWJ. Um trigger temporário de profundidade 2 que tenta mudar `status` é barrado. `NaN` e `Infinity` dão `invalid_argument`.
8. `pnpm db:types` se alguma assinatura mudar, e `pnpm db:check-permissions`.

## Bloqueios e dúvidas

Nenhum. O valor 50 é padrão reversível, a confirmar pelo humano (ADR-0011, seção 15, item 11).
