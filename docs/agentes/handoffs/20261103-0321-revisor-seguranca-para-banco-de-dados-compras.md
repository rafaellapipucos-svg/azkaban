# Handoff: revisor-seguranca para banco-de-dados, revisão de segurança da Fase 7

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-03 03:21 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-7`, a partir de `feat/phase-7-shopping` (`7528ceb`)

## Contexto

Revisão de segurança da lista de compras na pilha B. Confirmado, com PoC: outro grupo, lista pessoal alheia (inclusive o owner e o admin do grupo), ex-membro, catálogo de outro escopo, as colunas forjadas (`added_by`, `checked_*`, `status`, `completed_*`, `list_id`, `group_id`) e o `delete` do catálogo recusados. A ordem escopo antes de estado funciona: Eva, de outro grupo, recebe `forbidden` tanto para "Banana" (existe no catálogo A) quanto para um nome novo, e para lista existente e inexistente. Nenhum achado alto ou médio. Três informativos abaixo, de endurecimento; SEG7-1 a SEG7-3 foram para o `arquiteto` e voltam a você depois da decisão.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG7-4, informativo. O desvio por `pg_trigger_depth() > 1` desliga tudo, não só a ação de chave estrangeira.** `shopping_lists_guard` (`20261103170500_shopping_lists.sql:82`) e `shopping_list_items_guard` (`20261103170600_shopping_list_items.sql:40`) devolvem a linha sem nenhuma checagem quando rodam abaixo de outro trigger: escopo, `list_completed`, `forbidden`, o carimbo de `added_by` e o escopo do `catalog_item_id`. Hoje não há abuso: conferi em `pg_trigger` que só os próprios guardas e o seed tocam as tabelas de compras, e o cliente não alcança profundidade 2 com valores dele. O risco é o próximo trigger, por exemplo o XP de F7-5 ou um que copie itens, herdar o desvio sem perceber.

Sugestão: no desvio, aceitar só o que uma ação de chave estrangeira faz. Em `shopping_lists`, `update` em que a única diferença é `linked_task_id`, `created_by` ou `completed_by` virando nulo. Em `shopping_list_items`, `delete`, ou `update` em que só `added_by`, `checked_by` ou `catalog_item_id` viram nulos. O resto segue pelas checagens normais. Um teste pgTAP com um trigger temporário de profundidade 2 tentando mudar `status` prova.

**SEG7-5, informativo. Oráculo de existência por UUID conhecido.** `adjust_shopping_item_quantity` e `set_shopping_item_checked` (`20261103170700_shopping_rpcs.sql:107-112` e `188-193`) devolvem nulo para item inexistente e `forbidden` para item de outro grupo. `create_shopping_list` com `p_id` de lista alheia e `insert` de item com `id` alheio dão `23505`; com `on conflict (id) do update`, dão a mensagem de RLS. `complete_shopping_list` (`:71`) e `create_shopping_list` com `p_from_list_id` (`:30`) travam a lista alheia antes de checar a visibilidade. Exige o UUID, que é aleatório e não vaza (o `DELETE` do Realtime só leva ids de linhas que já sumiram). Aceitável. Se mexer nas RPCs por outro motivo: checar a visibilidade antes de diferenciar "não existe" e antes do `for update`.

**SEG7-6, informativo. Delta não finito.** `p_delta` aceita `'NaN'` e `'Infinity'`. `NaN > 0` é verdadeiro no Postgres e `least(NaN, 9999)` dá 9999, então um toque com `NaN` leva a quantidade a 9999 (PoC 6a a 6c). Qualquer membro já pode gravar 9999 pelo `update`, então não há ganho. Sugestão: `invalid_argument` também quando `p_delta = 'NaN'` ou `abs(p_delta) = 'Infinity'`.

## Bloqueios e dúvidas

Nenhum.
