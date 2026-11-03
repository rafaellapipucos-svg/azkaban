# Handoff: qa-testes para compras, achados do QA da Fase 7

**De:** qa-testes
**Para:** compras
**Data:** 2026-11-03 03:49 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/qa-phase-7`, a partir de `feat/phase-7-shopping` (`ebf34ea`)

## Contexto

QA da Fase 7 no estado integrado. `e2e/shopping.spec.ts` rodou pela primeira vez e passa (também 4 vezes em paralelo). Spec nova `e2e/shopping-layout.spec.ts`: todas as telas de compras a 320, 375 e 1280 px, claro e escuro, a barra de seis abas, `title` por tela, `catalog_item_exists` e `forbidden` na tela, e nenhuma lista de exemplo para quem acabou de entrar. Tudo passa. Nada bloqueia a fase. SEG7-1 e SEG7-3 nas telas estão com você e não foram reabertos aqui.

## O que foi entregue

Só E2E: `shopping.spec.ts` ajustada e estendida ("salvar no catálogo", membro sem o interruptor, quem adicionou, catálogo do grupo com o item salvo, lista pessoal invisível ao dono do grupo), `shopping-layout.spec.ts` nova e `e2e/walk.ts`, o percurso que estava dentro de `whatsapp.spec.ts`, agora compartilhado e conferindo também `radio` e `checkbox`. Nenhum `test.fail()` para os achados abaixo.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA7-1, média. Não dá para excluir nem renomear uma lista.**

O ADR-0011 dá as duas ações a quem gerencia a lista (seções 3, 4 e 6; `can_manage_shopping_list` e a política de `delete` já estão no banco), mas `ShoppingRepository` não tem `deleteList` nem `updateList`, e nenhuma tela as oferece. Uma lista criada por engano só sai finalizando, e vai para o histórico. Com o teto de SEG7-2, o texto de `errors.lists_full` manda "Finalize ou exclua uma", e excluir não existe. Sugestão: na lista aberta (e na finalizada), "Renomear" e "Excluir lista" com `ConfirmButton`, para quem criou ou tem `shopping.manage_lists`, e para o dono na pessoal (`canShop` mais `createdBy`). Ou, se a exclusão ficar para depois, tirar "ou exclua" do texto.

**QA7-2, baixa. Lista vazia diz "Falta 0 item".**

Em `ShoppingListScreen`, o status usa `list.left` com `count: 0` quando não há itens. Em pt-BR o CLDR põe 0 em `one`, então sai "Falta 0 item". Sugestão: `list.left_zero` (o i18next usa `_zero` quando `count` é 0), ou um texto próprio para a lista vazia, como "A lista está vazia.". Visto na E2E (snapshot da tela de montar).

**QA7-3, baixa. O erro do catálogo continua na tela depois de fechar a folha.**

Em `ShoppingCatalogScreen`, `save.isError && !editing` mostra o erro na tela principal. Quem tenta renomear para um nome que já existe vê `catalog_item_exists` na folha (certo) e, ao tocar em "Fechar", o mesmo erro passa para o topo do catálogo, sem nada pendente. Por leitura do código (`save.reset()` só roda ao abrir outro item). Sugestão: `save.reset()` no `onClose` da folha.

**QA7-4, baixa. Nota do item sem tela.**

O contrato e o banco têm `note` (com `shoppingNoteSchema`), o modo "no mercado" mostra a nota, mas nada permite escrever uma: `addItem` sempre manda `note: null`. A seção 7.10 não exige; o ADR prevê a coluna. Ou uma ação "Nota" ao lado da unidade, ou registrar que fica para depois.

**Informativo: zero no singular.** "0 pacote" e "0 dúzia" no stepper seguem o CLDR de pt-BR (`one` para 0 e 1). A spec esperava "0 pacotes"; ajustei a spec. Se o humano preferir o plural no zero, é a mesma solução do QA7-2 (`units.<unidade>_zero`) e a spec muda junto.

## Bloqueios e dúvidas

Nenhum.

## Como testar

Pilha A: `pnpm exec supabase db reset` e `pnpm exec playwright test e2e/shopping.spec.ts e2e/shopping-layout.spec.ts`. Para QA7-2, criar uma lista e olhar o status antes do primeiro item. Para QA7-3, em "Editar catálogo", renomear "Feijão" para "Arroz", salvar e fechar.
