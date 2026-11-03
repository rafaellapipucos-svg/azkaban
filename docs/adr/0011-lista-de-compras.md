# ADR-0011: Lista de compras

**Status:** aceito pelo arquiteto para a Fase 7. Fica sujeito à validação do humano na aprovação da fase. Os itens da seção 15 são padrões a confirmar. O XP de compra (seção 9) depende da Fase 6 e do ADR-0010, da gamificação, escrito em paralelo. **F7-5 entregue na Fase 8** (2026-11-03): o vínculo com tarefa (seção 8, F7-5a, `compras`) e o XP de compra (seção 9, F7-5b, `banco-de-dados`), com a janela móvel do SEG8-1.

## Contexto

A seção 7.10 do prompt mestre pede listas pessoais e de grupo, várias ao mesmo tempo, um catálogo por grupo com seed editável, item avulso, stepper, modos "montar" e "no mercado", tempo real com "quem adicionou", finalizar e arquivar, "nova lista a partir desta", compartilhar como texto, vínculo opcional com tarefa e um pouco de XP. A seção 7.1 dá ao admin o catálogo de compras. A seção 8 traz `shopping_catalog_items`, `shopping_lists` e `shopping_list_items` como ponto de partida.

Faltava decidir: de onde vem o catálogo de uma lista pessoal, quais permissões entram na matriz do [ADR-0003](0003-grupos-papeis-permissoes.md), como o tempo real convive com a RLS (o [ADR-0008](0008-notificacoes-push-pwa-vermelho-automatico.md), seção 7, só tinha o sino na publicação), o que acontece quando duas pessoas mexem no mesmo item, e como o XP de compra resiste a quem finaliza listas em série.

## Decisão

### 1. Modelo

Refinos da seção 8:

- **Dois escopos, um dono.** Em `shopping_catalog_items` e `shopping_lists`, exatamente um de `group_id` e `owner_user_id` é preenchido (`check`). Grupo: some com o grupo (`on delete cascade`). Pessoal: some com a conta (`on delete cascade` em `profiles`).
- **`shopping_lists.status`** é `open` ou `completed`, não `archived`: "finalizar" é o evento que dá XP, e `archived` pareceria "escondida". Ganha `completed_at` e `completed_by`, com `check ((status = 'completed') = (completed_at is not null))`. `created_by` e `completed_by` ficam `on delete set null`.
- **O item é uma cópia.** `shopping_list_items` guarda `name`, `category`, `unit` e `emoji` no momento em que entra, venha do catálogo ou não. `custom_name` some. `catalog_item_id` é só o vínculo (`on delete set null`), com `unique (list_id, catalog_item_id)`: renomear ou arquivar o catálogo não muda o histórico nem o texto compartilhado, e o stepper do modo "montar" acha a linha do item.
- **Quantidade** é `numeric(10,3)`, maior que zero e até 9999 (`shoppingQuantityMax`). Unidade e categoria são enums do Postgres, `shopping_unit` e `shopping_category`, na ordem de `packages/contracts/src/shopping-vocabulary.ts`. A ordem das categorias é a ordem de exibição, de um mercado brasileiro típico, com `other` por último.
- `added_by`, `added_at`, `checked_at` e `checked_by` são carimbados pelo banco. O cliente nunca os escreve.
- `id` de lista e de item pode vir do cliente (seção 12).
- **Limites**, em `shoppingRules`: 200 itens por lista, 500 itens não arquivados por catálogo e 50 listas abertas por escopo (seção 16, SEG7-2).
- **Texto:** nome, nota e emoji recusam quebra de linha, caracteres de controle e controles de direção (seção 16, SEG7-3).

### 2. Catálogo e seed

- **Fonte:** `packages/config/src/shopping-catalog-seed.ts`, 44 itens comuns no Brasil, com nome, categoria, unidade e emoji. É o "arquivo de seed" da seção 7.10, tipado contra o contrato e testado (nomes únicos ignorando caixa, todos passam no `shoppingCatalogItemInputSchema`).
- **Espelho:** a tabela `public.shopping_catalog_seed`, com `sort_order` = posição × 10, preenchida por migration e comparada por `pnpm db:check-permissions`. É migration, e não `supabase/seed/`, porque o seed do Supabase só roda no `db reset` local e o projeto hospedado ficaria sem catálogo. Nenhum cliente lê a tabela.
- **Cópia:** `seed_shopping_catalog(group_id, owner_user_id)`, `security definer`, sem `execute` para clientes, chamada por um trigger `after insert` em `groups` e outro em `profiles`. A migration preenche os grupos e perfis que já existem. Mudar o seed vale para catálogos novos; os antigos são do admin.
- **"Editável pelo admin"** é cada grupo editar a própria cópia, com `shopping.manage_catalog`. Não há tela para editar o seed: ele muda por PR.
- **Catálogo da lista pessoal: o catálogo pessoal da pessoa**, uma cópia do mesmo seed feita quando o perfil nasce, que só ela vê e edita. Lista pessoal só usa o catálogo pessoal, e lista de grupo só o do grupo. Misturar catálogos de grupos numa lista pessoal confundiria a origem dos itens, e um catálogo global só de leitura impediria "salvar no catálogo" na lista pessoal.
- O catálogo não tem `delete` para o cliente: arquivar é `archived_at`. Nome único por escopo, ignorando caixa, entre os não arquivados (`catalog_item_exists`).
- O seed é só em pt-BR. Quando houver outro idioma, a tabela ganha `locale`, e a cópia lê `profiles.locale` de quem cria.

### 3. Permissões

Quatro chaves novas em `permissions` e `role_permissions`, espelhadas em `packages/core/src/permissions/matrix.ts`:

| Chave                     | owner | admin | member | Significado                                                                         |
| ------------------------- | ----- | ----- | ------ | ----------------------------------------------------------------------------------- |
| `shopping.create_list`    | sim   | sim   | sim    | Criar lista do grupo, inclusive "nova lista a partir desta"                         |
| `shopping.complete_list`  | sim   | sim   | sim    | Finalizar uma lista do grupo                                                        |
| `shopping.manage_catalog` | sim   | sim   | não    | Criar, editar e arquivar itens do catálogo do grupo, inclusive "salvar no catálogo" |
| `shopping.manage_lists`   | sim   | sim   | não    | Renomear, vincular tarefa e excluir uma lista do grupo criada por outra pessoa      |

- São as primeiras chaves que `member` tem. A lista de compras é feita por quem vai ao mercado, e a funcionária precisa criar e finalizar. Um grupo empresa que queira outra coisa muda uma linha da matriz.
- Mexer nos itens (adicionar, stepper, marcar, editar, remover) não tem chave: é de todo membro que vê a lista. Esse é o sentido de uma lista compartilhada.
- Quem criou uma lista do grupo a renomeia, vincula e exclui sem `shopping.manage_lists`, enquanto for membro.
- Lista e catálogo pessoais: só o dono, para tudo. Nenhuma chave se aplica, e nenhum admin os vê (seção 7.1).

### 4. RLS e caminhos de escrita

Funções auxiliares `security definer`: `can_view_shopping_list(list_id)` (dono da pessoal, ou `is_group_member` da do grupo) e `can_manage_shopping_list(list_id)` (dono, ou criador membro, ou `shopping.manage_lists`).

| Tabela                   | `select`                | `insert`                              | `update`                                                                                       | `delete`     |
| ------------------------ | ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------ |
| `shopping_catalog_seed`  | ninguém                 | ninguém                               | ninguém                                                                                        | ninguém      |
| `shopping_catalog_items` | membro do grupo ou dono | `shopping.manage_catalog` ou dono     | idem; colunas `name`, `category`, `default_unit`, `emoji`, `sort_order`, `archived_at`         | ninguém      |
| `shopping_lists`         | `can_view`              | só pela RPC                           | `can_manage`; colunas `name`, `linked_task_id`                                                 | `can_manage` |
| `shopping_list_items`    | `can_view` da lista     | `can_view`; sem as colunas carimbadas | `can_view`; colunas `name`, `category`, `quantity`, `unit`, `emoji`, `note`, `catalog_item_id` | `can_view`   |

RPCs, todas `security definer` com as checagens explícitas, e que travam a linha da lista (`for update`):

- `create_shopping_list(p_id, p_group_id, p_name, p_from_list_id)`: confere `shopping.create_list` ou o escopo pessoal, e `maxOpenListsPerScope` (`lists_full`, seção 16). Com `p_from_list_id`, a origem precisa estar visível e no mesmo escopo, e todos os itens dela são copiados desmarcados, com quantidade, unidade e nota, e `added_by` = quem copiou.
- `complete_shopping_list(p_list_id)`: `open` → `completed`, uma vez. Confere `shopping.complete_list` ou o dono. Itens não marcados ficam como estão: o histórico mostra o que não foi comprado.
- `adjust_shopping_item_quantity(p_item_id, p_delta)` e `add_catalog_item_to_list(p_list_id, p_catalog_item_id, p_delta)`: seção 5.
- `set_shopping_item_checked(p_item_id, p_checked)`: grava ou limpa `checked_at` e `checked_by` com `now()` e `auth.uid()`. É um valor, não uma troca.

Triggers em `shopping_list_items`, para qualquer caminho: recusam escrita em lista `completed` (`list_completed`), travam a lista e conferem `maxItemsPerList` no `insert` (`list_full`), carimbam `added_by` e `added_at`, e recusam um `catalog_item_id` de outro escopo. Em `shopping_lists`: recusam mudar o escopo, recusam `update` em lista `completed`, e validam o vínculo com tarefa (seção 8). Em `shopping_catalog_items`: escopo imutável e `maxCatalogItemsPerScope` (`catalog_full`).

Os códigos de erro estão em `shoppingErrorCodeSchema`.

### 5. Duas pessoas no mesmo item

- **Stepper:** um incremento atômico no banco, `quantity = quantity + delta` numa única instrução, e não "ler, somar, gravar" no cliente. Dois toques simultâneos de duas pessoas somam os dois. Um resultado menor ou igual a zero apaga o item.
- `add_catalog_item_to_list` é `insert ... on conflict (list_id, catalog_item_id) do update`: o primeiro toque em "+" num item do catálogo cria a linha com a cópia do catálogo e o passo da unidade, e dois primeiros toques simultâneos dão uma linha só, com a soma.
- O cliente pode juntar toques rápidos num só delta (por exemplo, 300 ms) e mostra o resultado na hora. Quando a linha volta pela RPC ou pelo Realtime, ela vale, somada aos deltas que ainda não voltaram.
- **Digitar a quantidade, mudar a unidade, renomear, a nota:** `update` comum, a última escrita vale. São raros e visíveis no tempo real.
- **Marcar e desmarcar:** um valor, então duas pessoas marcando o mesmo item chegam ao mesmo estado.
- **Remover enquanto outra pessoa soma:** o delta que chega depois não acha a linha, a RPC devolve nulo, e o item some para os dois.
- **Finalizar enquanto outra pessoa mexe:** a trava da lista ordena os dois. Ou a escrita entra antes, ou recebe `list_completed`.

### 6. Finalizar, histórico e "nova lista a partir desta"

- Finalizar é definitivo. **Não há reabrir**: "nova lista a partir desta" recupera um engano, e o XP não precisa de compensação.
- O histórico é a lista de `completed`, por `completed_at` decrescente, só leitura.
- Excluir uma lista é `delete` de verdade, em qualquer estado, por quem a gerencia (seção 4). Os itens vão junto. Um evento de XP já gravado fica, com a referência nula.

### 7. Tempo real

- **`postgres_changes`, como o sino.** `shopping_lists` e `shopping_list_items` entram na publicação `supabase_realtime`. A tela de uma lista assina `shopping_list_items` com o filtro `list_id=eq.<id>` e `shopping_lists` com `id=eq.<id>`, para saber que outra pessoa finalizou. A tela das listas assina `shopping_lists` sem filtro, e a RLS escolhe as linhas. O catálogo fica fora: muda pouco e é relido ao abrir.
- **Revisão de RLS de `select` exigida pelo ADR-0008 (Consequências):** o Realtime confere a política de `select` de cada assinante, como o assinante, com o `auth.uid()` do JWT dele. As duas políticas passam por `can_view_shopping_list`, que só olha o dono ou `is_group_member`. A linha inteira vai no evento, e nela só há o que um membro da lista já vê: nomes de itens, quantidades e os ids de quem adicionou e marcou. Quem sai do grupo para de receber na próxima mudança. `banco-de-dados` testa as duas políticas como `authenticated` de outro grupo e como ex-membro.
- **`DELETE`** vai a todo assinante da tabela, só com o `id`, sem filtro e sem RLS (o mesmo caso do SEG4-4, ADR-0008, seção 17). Um id de item de outra lista não diz nada, e o cliente ignora o que não tem. A `replica identity` fica a padrão, para o `DELETE` não levar a linha velha.
- **Teto:** uma checagem de RLS por assinante e por mudança. Uma família ou uma casa com poucas pessoas no mercado está longe dele. O caminho, se um dia precisar, é Broadcast do banco com canais privados por lista, como no ADR-0008.

### 8. Vínculo com tarefa

- `shopping_lists.linked_task_id`, `on delete set null`, gravado pelo `update` comum. O trigger confere que quem grava vê a tarefa (`can_view_task`) e que ela é do mesmo escopo: numa lista do grupo, `tasks.group_id` igual e `visibility = 'group'`; numa lista pessoal, qualquer tarefa que o dono veja. Fora disso, `task_link_invalid`.
- **Quem vê a lista nem sempre vê a tarefa** (seção 16, SEG7-1). `visibility = 'group'` não abre a tarefa a todo membro: `can_view_task` mostra só ao criador, aos responsáveis e a quem tem `task.view_group`. Para os outros membros, `linked_task_id` é um id inerte, e a tela trata a tarefa que não consegue ler como vínculo ausente. Exigir `visibility = 'group'` continua valendo: impede que uma tarefa privada seja exposta pelo id numa lista do grupo.
- **O vínculo é só navegação.** Finalizar a lista não muda o estado de nenhuma ocorrência. Concluir a tarefa continua por `set_occurrence_status` ou, com foto, pela prova ([ADR-0007](0007-prova-por-foto.md)), e a máquina de estados segue com um caminho só. Ao finalizar uma lista vinculada, a tela oferece abrir a tarefa, se a pessoa a lê.
- A tarefa mostra a lista vinculada por composição na rota, como no [ADR-0006](0006-calendario-equipe-navegacao.md): `tasks` e `shopping` não se importam.

### 9. XP de compra (F7-5, depende da Fase 6)

O evento é o que o ADR-0010 reserva para compra, aqui chamado `shopping_completed`. Até a Fase 6 estender `xp_events`, a Fase 7 não gravava XP: finalizar funcionava e não dava nada. Entrou na Fase 8, na migration `20261104140000_shopping_xp.sql`:

- **Trigger `after update of status` em `shopping_lists`**, na passagem `open` → `completed`. É o padrão do ADR-0005: vale para qualquer caminho, e o cliente nunca escreve em `xp_events`.
- O evento vai para `completed_by`, com `group_id` da lista (nulo na pessoal, que não entra no ranking) e `amount` de `shoppingRules.xp.amount`.
- **Anti-farm:**
  - lista com menos de `minCheckedItems` (3) itens marcados finaliza sem XP, inclusive a vazia;
  - no máximo `maxRewardedPerDay` (2) listas com XP por pessoa nas **últimas 24 h**, janela móvel e sem fuso, como o teto do ADR-0010 (seção 14, SEG6-1). A primeira versão contava o dia local no fuso do perfil, e `profiles.timezone` é do próprio usuário: trocar para um fuso cuja meia-noite acabou de passar zerava a contagem, 2 listas por hora até o teto de 300 XP (SEG8-1, média, handoff `20261103-0643-revisor-seguranca-para-banco-de-dados-seguranca-fase-8`). O nome da chave fica: "por dia" passa a ser "em 24 h";
  - uma vez por lista: `unique` parcial em `xp_events` pela referência da lista, com o motivo de compra;
  - sem reabrir (seção 6), não há ciclo de finalizar e reabrir. "Nova lista a partir desta" cria outra lista e cai nos dois limites acima.
- A referência é uma coluna `xp_events.shopping_list_id`, `on delete set null`, a menos que o ADR-0010 decida outra forma de apontar eventos sem ocorrência. Nesse caso, vale a do ADR-0010.
- **`xpEventSchema` não ganha `shoppingListId`** (decisão de 2026-11-03). A coluna serve ao banco, para o `unique` de uma vez por lista; nenhuma tela lê a lista a partir do evento, e o Zod descarta a coluna a mais. Entra no contrato quando uma tela precisar dela.
- O motivo entra em `xpEventReasonSchema` e no `check` de `xp_events` pela mão de quem fizer a Fase 6, com o nome do ADR-0010.

### 10. Modos "montar" e "no mercado"

Só no cliente. O modo é da pessoa e do aparelho, não da lista: uma pessoa monta em casa enquanto outra já está no mercado. Fica no endereço (`?mode=build` ou `?mode=market`), sem coluna no banco.

- **Montar:** o catálogo do escopo da lista por categoria, com busca, stepper (passo de `shoppingDefaults.unitStep`), unidade editável e item avulso com "salvar no catálogo" para quem pode.
- **No mercado:** só os itens da lista, por categoria na ordem do contrato; marcar risca e desce; desfazer é desmarcar.

### 11. Compartilhar como texto

Um adapter `shareText` em `packages/platform`: `navigator.share` na web quando existe, senão copiar para a área de transferência com aviso; `Share` do React Native no nativo. O texto é montado por uma função pura, com os itens não marcados por categoria, e rótulos de unidade e categoria vindos do i18n.

### 12. Fila offline (F8-5)

Fora da Fase 7, com a porta aberta:

- `id` de lista e de item pode vir do cliente, então um `insert` repetido não duplica;
- marcar é um valor, não uma troca;
- o delta do stepper não é idempotente: a fila de F8-5 acrescenta um id de pedido a ele, ou converte os deltas pendentes num valor final ao reconectar.

### 13. Regras, contratos e espelhos

- `packages/contracts/src/shopping-vocabulary.ts`: `shoppingCategories` e `shoppingUnits`, sem import em tempo de execução, espelhados pelos enums do Postgres.
- `packages/contracts/src/shopping.ts`: os esquemas de linha e de entrada, `shoppingQuantityAdjustSchema`, `shoppingItemCheckInputSchema`, `shoppingListCompleteInputSchema`, `shoppingErrorCodeSchema` e o tipo `ShoppingCatalogSeedItem`.
- `packages/config/src/shopping.ts`: `shoppingRules`, com espelho em `app_settings`, chave `shopping_rules`, e `shoppingDefaults`, só do cliente.
- `packages/config/src/shopping-catalog-seed.ts`: o seed (seção 2).
- `@azkaban/config` passa a depender de `@azkaban/contracts`, só com `import type`, para o seed e os passos de unidade serem conferidos pelo compilador. O Node continua carregando os arquivos direto, porque `import type` some na remoção de tipos.
- `scripts/check-permission-mirror.mjs` compara as regras, os dois enums na ordem e o seed. Falha até a migration de `banco-de-dados`.

### 14. Divisão do trabalho

| Dono             | Entrega                                                                                                                                                                                                    | Depende de                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `banco-de-dados` | Enums, seed e espelhos; as três tabelas, índices e RLS; as quatro chaves; auxiliares, RPCs e triggers; cópia do seed e preenchimento; publicação do Realtime; tipos; pgTAP                                 | Este ADR                                    |
| `auth-grupos`    | As quatro chaves em `matrix.ts` e no teste da matriz, no mesmo merge da migration das permissões                                                                                                           | Este ADR                                    |
| `compras`        | Funções puras (ordem do modo "no mercado", texto compartilhado, passos, delta otimista), i18n, `shareText`, telas, repositório e assinatura do Realtime em `packages/data/src/shopping`, E2E do tempo real | Este ADR. Repositório e E2E, das migrations |
| `banco-de-dados` | F7-5, XP de compra (seção 9)                                                                                                                                                                               | F6-2 e o ADR-0010                           |

O que é puro em `compras` corre em paralelo com as migrations desde já, contra os contratos.

### 15. A confirmar pelo humano

Padrões reversíveis:

1. **Membros criam e finalizam listas do grupo; só admins editam o catálogo e gerenciam listas alheias.** Uma linha da matriz por chave.
2. **Categorias fixas** (hortifrúti, padaria, açougue, laticínios e frios, mercearia, bebidas, congelados, limpeza, higiene, outros), iguais para todos. Categoria própria por grupo exige trocar o enum por uma tabela.
3. **Unidades:** un, kg, g, L, pacote, caixa e dúzia. A dúzia não estava na seção 7.10; entrou pelos ovos.
4. **O seed de 44 itens**, nomes e emojis.
5. **Catálogo pessoal** copiado do mesmo seed, separado do catálogo dos grupos.
6. **Finalizar é definitivo**, sem reabrir.
7. **XP:** 10 por lista, só com 3 ou mais itens marcados, até 2 listas por dia, para quem finalizou.
8. **Compartilhar leva só o que falta comprar.**
9. **Aba "Compras"** na barra, entre Calendário e Perfil. Com duas áreas, são seis abas a 375 px.
10. **Sem aviso no sino** quando alguém adiciona item ou finaliza uma lista.
11. **50 listas abertas por grupo e por pessoa** (seção 16, SEG7-2).
12. **A recusa de caracteres de controle vale só para os textos de compras**, não para os outros nomes do app (seção 16, SEG7-3).

### 16. Revisão de segurança da Fase 7

Decisões sobre os achados da revisão de segurança da lista de compras (handoffs `20261103-0321-revisor-seguranca-*`), em 2026-11-03. Valem sobre as seções anteriores onde há diferença, e os trechos afetados remetem para cá. Nenhum achado alto ou médio.

**SEG7-1 (baixa): quem vê a lista nem sempre vê a tarefa vinculada.** A premissa da seção 8 estava errada: `visibility = 'group'` não abre a tarefa a todo membro, porque `can_view_task` só a mostra ao criador, aos responsáveis (da tarefa ou de uma ocorrência) e a quem tem `task.view_group`. A seção 8 fica corrigida assim:

- A regra do trigger não muda. Exigir o mesmo grupo e `visibility = 'group'` ainda impede que uma tarefa privada seja exposta pelo id numa lista do grupo.
- Para quem não lê a tarefa, `linked_task_id` é um id inerte: um UUID aleatório, sem título nem estado.
- **A navegação trata a tarefa que não consegue ler como vínculo ausente:** nem botão "abrir a tarefa" na lista, nem oferta ao finalizar. Nada de "não encontrado". Dono: `compras`.
- Restringir o vínculo a quem tem `task.view_group` foi descartado: os membros continuariam sem ver a tarefa.

**SEG7-2 (baixa): teto de listas abertas por escopo.** `shoppingRules.maxOpenListsPerScope = 50`: listas `open` por grupo, e listas pessoais `open` por pessoa. Espelho em `app_settings.shopping_rules`; até a migration do `banco-de-dados`, `pnpm db:check-permissions` acusa a diferença.

- `create_shopping_list` conta, sob uma trava por escopo (`pg_advisory_xact_lock`, como o `catalog_full`), antes de inserir, e com `p_from_list_id` também. No teto: `lists_full` (`54000`), novo em `shoppingErrorCodeSchema`.
- Listas finalizadas ficam fora da conta: o histórico cresce, e quem chega ao teto finaliza ou exclui uma lista.
- **Teto:** limita o que polui a tela das listas abertas, não o volume. Um membro ainda cria, finaliza e recria em série (cada uma com até 200 itens). Isso é o rate limiting de F8-4.
- Padrão reversível, a confirmar pelo humano (seção 15, item 11). Mudar é uma linha em `packages/config` e uma migration.

**SEG7-3 (baixa): texto de compras sem caracteres de controle nem de direção.**

- **Contrato (feito):** `shoppingControlCharacterPattern` recusa `\p{Cc}` (quebra de linha, tabulação e os demais controles, de U+0000 a U+001F e de U+007F a U+009F), U+2028 e U+2029 (quebras de linha também) e os controles de direção U+202A a U+202E e U+2066 a U+2069. É o mesmo conjunto de `whatsappTextParamSchema` (ADR-0009, seção 18). Vale para `shoppingNameSchema` (nome de lista, de item e de item do catálogo), `shoppingNoteSchema` e `shoppingEmojiSchema`. U+200D (ZWJ) e U+FE0F ficam: compõem emojis. Quebra de linha nas pontas continua sendo aparada, não recusada.
- **Banco:** um `check` em cada coluna de texto das tabelas de compras (`shopping_catalog_items.name` e `emoji`, `shopping_lists.name`, `shopping_list_items.name`, `note` e `emoji`), com classe explícita, sem `[[:cntrl:]]`, que depende do locale do servidor:

  ```sql
  check (name !~ '[\u0001-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]')
  ```

  Validado, sem `not valid`: as tabelas são desta fase e o seed passa no contrato (teste em `packages/config`). Se o banco tiver uma linha fora da regra, a migration falha, e é isso que queremos ver.

- **Só para compras, não para todo `nameSchema`.** `nameSchema` segue igual para grupos, contextos e nomes de exibição, e o título de tarefa tem esquema próprio. Os motivos:
  - O vetor é o texto compartilhado: compras é o único lugar onde texto escrito por um membro vai, montado, para fora do app pela mão de outro. O resumo do WhatsApp, que leva títulos, áreas e contextos, já se protege (`whatsappTextParamSchema` e `cleanParam`, SEG5-6). Na tela, o React escapa tudo.
  - Subir a regra pede um `check` em `profiles`, `groups` e `contexts`, que têm dados desde a Fase 1. Um `check ... not valid` não salva os dados antigos: o Postgres confere a linha nova em todo `update`, então uma pessoa com quebra de linha no nome não mudaria nem o fuso até corrigir o nome. Seria preciso uma migration que reescreve dados de usuários, por um risco que hoje não tem caminho para fora do app.
  - **Quando subir:** quando outro texto que sai do app juntar nomes escritos por outra pessoa (por exemplo, um convite com o nome do grupo, ou a exportação de F8-3). Aí, uma migration que troca os controles por espaço, seguida do `check` validado, e o padrão passa para `common.ts`.
- **Tela:** o formulário mostra o erro de texto inválido pela falha do contrato. O banco nunca é a primeira barreira do app correto, então não há código de erro novo. O `check` é para quem chama o PostgREST direto. Dono: `compras`.

**SEG7-4 (informativo): o desvio por `pg_trigger_depth() > 1` passa a aceitar só o que uma ação de chave estrangeira faz.** Direção do revisor confirmada. Em `shopping_lists`: `update` em que a única diferença é `linked_task_id`, `created_by` ou `completed_by` virando nulo. Em `shopping_list_items`: `delete` (cascata da lista) ou `update` em que só `added_by`, `checked_by` ou `catalog_item_id` viram nulos. O resto segue pelas checagens normais. Prova: pgTAP com um trigger temporário de profundidade 2 tentando mudar `status`. Precisa ficar antes de F7-5, que põe um trigger em `shopping_lists`. Dono: `banco-de-dados`.

**SEG7-5 (informativo): oráculo de existência por UUID conhecido. Aceito.** Exige o UUID, que é aleatório e não vaza. `create_shopping_list` muda por SEG7-2, então nela a visibilidade da lista de origem passa a ser conferida antes do `for update` e antes de diferenciar "não existe" (`forbidden` nos dois casos). As outras RPCs mudam só quando forem tocadas por outro motivo. Dono: `banco-de-dados`.

**SEG7-6 (informativo): delta não finito.** `invalid_argument` (`22023`) também para `p_delta = 'NaN'` e `abs(p_delta) = 'Infinity'`, junto do zero. O contrato já recusa `NaN` e infinito (`z.number()`), então o app correto não chega lá e nada muda no cliente. Sem ganho para o atacante, mas é uma linha. Dono: `banco-de-dados`.

## Alternativas

- **Catálogo global, só de leitura, para listas pessoais:** sem cópia por pessoa, mas sem "salvar no catálogo" e sem editar o próprio catálogo.
- **Lista pessoal usando o catálogo de um grupo à escolha:** misturaria escopos, e sair do grupo levaria os itens.
- **Seed em `supabase/seed/`:** só roda no `db reset` local.
- **Seed só na migration, sem arquivo em `packages/config`:** uma migration mergeada não se edita, e o arquivo tipado é o que se revisa num PR.
- **Item ligado ao catálogo, sem cópia:** renomear o catálogo reescreveria o histórico e o texto já compartilhado.
- **Stepper por `update` de valor:** dois toques simultâneos perderiam um.
- **Broadcast agora:** canais privados e políticas em `realtime.messages` para um volume que `postgres_changes` aguenta. Fica como caminho no teto.
- **Modo no banco:** sincronizaria o modo de quem está em casa com o de quem está no mercado.
- **Finalizar conclui a tarefa vinculada:** abriria um segundo caminho para a máquina de estados e esbarraria na prova por foto.
- **Reabrir com evento compensatório:** mais um caminho e mais um teste, para um engano que "nova lista a partir desta" já resolve.
- **XP no cliente ou na RPC:** o cliente é adulterável, e a RPC deixaria de fora outros caminhos.

## Consequências

- A publicação do Realtime passa a ter três tabelas. Toda política de `select` delas é revista junto com qualquer mudança.
- `member` deixa de ter a lista vazia na matriz.
- Todo grupo e todo perfil novos ganham 44 linhas de catálogo.
- Mudar o seed, as categorias ou as unidades exige migration, e `pnpm db:check-permissions` acusa a diferença. Tirar uma categoria ou unidade do enum não é possível sem migrar os dados.
- O histórico cresce sem retenção. A exportação e a exclusão de conta de F8-3 precisam incluir listas pessoais, itens adicionados e marcados pela pessoa, e o catálogo pessoal.
- "Quem adicionou" e "quem marcou" ficam visíveis para os membros do grupo da lista.
