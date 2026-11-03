# Handoff: revisor-seguranca para arquiteto, revisão de segurança da Fase 7

**De:** revisor-seguranca
**Para:** arquiteto
**Data:** 2026-11-03 03:21 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-7`, a partir de `feat/phase-7-shopping` (`7528ceb`)

## Contexto

Revisão de segurança da lista de compras na pilha B (só Postgres). A RLS das quatro tabelas, as colunas por `grant`, as sete funções e a ordem escopo antes de estado resistiram a todos os PoCs (lista na entrada do LOG). Três achados baixos pedem decisão de ADR ou contrato.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG7-1, baixa. O vínculo com tarefa mostra a membros o id de uma tarefa que eles não veem.** A premissa do ADR-0011, seção 8 (linha 98), "`visibility = 'group'`, para todos os membros que veem a lista verem a tarefa", é falsa. `can_view_task` (`20261102130700_enqueue_notification.sql:13-31`) só mostra uma tarefa `group` ao criador, a quem é responsável por ela ou por uma ocorrência dela, e a quem tem `task.view_group` (owner e admin). Um `member` comum vê a lista e o `linked_task_id`, mas não a tarefa.

PoC na pilha B: Duda (member, responsável pela tarefa `group` do grupo A) cria uma lista do grupo e a vincula. Fred (member do mesmo grupo) lê `linked_task_id = 5000…0c` da lista, e `select count(*) from tasks where id = …` devolve 0 para ele. Só vaza o UUID: nenhum título, nenhum estado. Mas quando a tela oferecer "abrir a tarefa", ou a tarefa mostrar a lista, o membro cai num "não encontrado".

Escolha uma:

1. Corrigir o texto da seção 8 ("vê a tarefa quem a tarefa já deixa ver; para os outros membros o vínculo é um id inerte") e dizer ao `compras` que a navegação trata a tarefa ilegível como vínculo ausente, sem botão. É a mais barata, e o id sozinho não diz nada.
2. Restringir o vínculo da lista do grupo a quem tem `task.view_group`. Não resolve: os membros continuam sem ver.

Recomendo a 1.

**SEG7-2, baixa. Nenhum teto de listas por escopo.** `maxItemsPerList` (200) protege uma lista, mas `create_shopping_list` não conta listas. Um `member` cria listas do grupo sem limite, e cada `p_from_list_id` copia até 200 itens numa chamada só. PoC: 300 listas pessoais e 300 listas do grupo A, cada uma num único `select` com `generate_series`, por Eva e por Fred (member). Com `p_from_list_id` de uma lista cheia, cada chamada grava 201 linhas. Os outros membros veem as listas do grupo, então dá também para poluir a tela de todos. O rate limiting geral (F8-4) segue pendente.

Sugestão: `shoppingRules.maxOpenListsPerScope` (por exemplo 50 abertas por grupo e por pessoa), com espelho e código `lists_full` em `shoppingErrorCodeSchema`. O `banco-de-dados` conta dentro de `create_shopping_list` sob uma trava por escopo, como o `catalog_full`. Listas finalizadas ficam fora da conta, para o histórico crescer.

**SEG7-3, baixa. Nome, nota e emoji aceitam quebra de linha e caracteres de controle e de direção, e vão para o texto compartilhado.** `nameSchema` (`common.ts:10`), `shoppingNoteSchema` e `shoppingEmojiSchema` só aparam as pontas. Os `check` do banco (`char_length` e `btrim`) também. PoC: um item com nome `E'a‮b\n\nc'` e outro com emoji `<img src=x>` entram na lista do grupo. `shoppingShareText` junta tudo em linhas, então um membro injeta linhas inteiras (por exemplo "Pix para a chave X") ou inverte o texto (U+202E) no que outro membro manda para o WhatsApp de alguém de fora. O React escapa o texto, então não há XSS. O emoji é texto livre de até 16 caracteres.

Sugestão: no contrato, recusar `\p{Cc}` e os controles de direção (U+202A a U+202E, U+2066 a U+2069) em `name`, `note` e `emoji`. No banco, um `check` equivalente (`!~ '[[:cntrl:]‪-‮⁦-⁩]'`), para o PostgREST direto. `nameSchema` é comum: vale decidir se a regra sobe para todos os nomes do app.

## Bloqueios e dúvidas

Nenhum. SEG7-2 e SEG7-3 viram trabalho de `banco-de-dados` depois da decisão. SEG7-4 a SEG7-6, informativos, foram para o `banco-de-dados` direto.
