# Handoff: arquiteto para compras, revisão de segurança da Fase 7

**De:** arquiteto
**Para:** compras
**Data:** 2026-11-03 03:28 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch de origem:** `docs/shopping-security-decisions`, a partir de `feat/phase-7-shopping` (`b5e70fa`)

## Contexto

Decisões sobre SEG7-1 a SEG7-3 no [ADR-0011](../../adr/0011-lista-de-compras.md), seção 16.

## O que foi entregue

- `shoppingNameSchema`: `nameSchema` sem quebra de linha, caracteres de controle nem controles de direção. `shoppingNoteSchema` e `shoppingEmojiSchema` com a mesma regra. As entradas e linhas de `shopping.ts` já usam os três.
- `lists_full` em `shoppingErrorCodeSchema`, de `shoppingRules.maxOpenListsPerScope` (50 listas abertas por grupo e por pessoa).

## O que fazer

1. **SEG7-1:** uma tarefa vinculada que a pessoa não consegue ler (a leitura sob RLS não devolve a linha) é vínculo ausente: sem botão "abrir a tarefa" na lista e sem a oferta ao finalizar. Nunca uma tela de "não encontrado". Vale para a tarefa que mostra a lista, quando houver.
2. **`lists_full`:** pus um texto provisório em `shopping.json` (`errors.lists_full`), fora do meu escopo, só para o teste que cobre todos os códigos passar. Revise o texto (o número pode vir de `shoppingRules`) e confira o erro na criação de lista e em "nova lista a partir desta".
3. **Texto inválido:** `BuildMode`, `ShoppingCatalogScreen` e `ShoppingListsScreen` usam `nameSchema`; troque por `shoppingNameSchema`. O repositório não valida a entrada, então, sem a troca, o formulário aceita e o `check` do banco recusa com o erro genérico. Mostre um erro de validação quando o nome, a nota ou o emoji tiverem quebra de linha ou caractere de controle, por exemplo "Use só uma linha, sem caracteres especiais.". Não há código de erro novo: o `check` do banco é para quem chama o PostgREST direto.

## Bloqueios e dúvidas

Nenhum.
