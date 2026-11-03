# Handoff: arquiteto para compras, lista de compras da Fase 7

**De:** arquiteto
**Para:** compras
**Data:** 2026-11-03 02:30 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/shopping-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

F7-1 decidiu a lista de compras no [ADR-0011](../../adr/0011-lista-de-compras.md). `banco-de-dados` faz as migrations agora, em paralelo com você.

## O que foi entregue

- `packages/contracts/src/shopping.ts`: linhas (`shoppingCatalogItemSchema`, `shoppingListSchema`, `shoppingListItemSchema`), entradas (criar, atualizar, item, stepper, marcar, finalizar) e `shoppingErrorCodeSchema`. Categorias e unidades em `shoppingCategories` e `shoppingUnits`, na ordem de exibição.
- `packages/config`: `shoppingDefaults.unitStep` (passo do stepper e primeiro toque), `shoppingDefaults.customItem` (categoria e unidade do item avulso) e `shoppingRules` (limites e XP).
- O seed do catálogo vem do banco, copiado para cada grupo e perfil. Não leia `shoppingCatalogSeed` na tela: o catálogo de verdade é o do banco, editado pelo admin.

## O que fazer

Já, em paralelo com as migrations:

1. **Funções puras**, com testes. O lugar natural é `packages/core/src/shopping`, que ainda não tem dono no `AGENTES.md`; o orquestrador confirma. Ordem e agrupamento do modo "no mercado" (categoria na ordem do contrato, marcados descem), texto compartilhado (só os não marcados, por categoria, com rótulos do i18n passados por parâmetro), passo do stepper e a soma dos deltas otimistas sobre a linha que volta do servidor (seção 5).
2. **i18n** em `packages/i18n/src/pt-BR/shopping.json`: `shopping.categories.<key>`, `shopping.units.<key>` com plural, e um texto para cada código de `shoppingErrorCodeSchema` (um teste que cubra todos, como o de `whatsappErrorCodeSchema`).
3. **`shareText`** em `packages/platform` (seção 11): `.web.ts` com `navigator.share` ou área de transferência, e o nativo com `Share` do React Native.
4. **Telas** contra os contratos, com dados de exemplo: listas por escopo, criar lista, "montar" com busca e stepper, item avulso com "salvar no catálogo" só para quem `can(..., 'shopping.manage_catalog', grupo)` (ou o dono, na pessoal), "no mercado", finalizar com confirmação, histórico, "nova lista a partir desta", catálogo do grupo. Modo no endereço (`?mode=build|market`), nada no banco (seção 10). "Quem adicionou" pelo nome do membro em `group_member_profiles`; quem saiu aparece como ex-membro.

Depois das migrations e de `pnpm db:types`:

5. **Repositório** em `packages/data/src/shopping`: leituras com RLS, `insert`/`update`/`delete` só nas colunas liberadas, as cinco RPCs e a assinatura `postgres_changes` (seção 7). `DELETE` chega a todos só com o `id`: ignore o que não está na tela. A linha que chega vale, somada aos deltas que ainda não voltaram.
6. **E2E** do tempo real com dois contextos do navegador: um adiciona e soma, o outro vê; dois "+" ao mesmo tempo somam; marcar aparece no outro; finalizar trava o outro com `list_completed`.

F7-5 (vínculo com tarefa): o vínculo é só navegação (seção 8). A tela da tarefa mostra a lista por composição na rota, sem importar `tasks`. O XP é do `banco-de-dados`, depois da Fase 6; a tela de comemoração, da `gamificacao`.

## Bloqueios e dúvidas

- A aba "Compras" na barra (`apps/app/src/AppTabBar.tsx`) é do orquestrador. Padrão do ADR: entre Calendário e Perfil, a confirmar pelo humano.
- As permissões no cliente dependem de `auth-grupos` acrescentar as quatro chaves em `matrix.ts`. Até lá, `can(...)` não compila com elas.

## Como testar

`pnpm check`; com a pilha, `pnpm e2e` na spec nova.
