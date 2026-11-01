# ADR-0005: Tarefas, ocorrências, recorrência e "concluído atrasado"

**Status:** aceito pelo arquiteto para a Fase 2. Fica sujeito à validação do humano na aprovação da fase.

## Contexto

A seção 7.4 pede uma decisão sobre "concluí atrasado". A seção 8 é um ponto de partida, e faltava definir como os três escopos de edição viram RRULE e EXDATE, onde a materialização mora e como o banco impede uma transição inválida. Os padrões da seção 15 estão no ADR-0004. Onde houve mais de uma saída boa, ficou a mais fácil de reverter.

## Decisão

### 1. Concluído atrasado

Sim, uma ocorrência pode ser resolvida depois do horário, inclusive a partir de `missed`.

- `overdue_at` é o instante em que a ocorrência deixa de estar no prazo. É uma coluna calculada pelo banco a partir de `taskRules.autoMiss`: fim do dia local para `timed` e `all_day`, data limite para `deadline`, mais a tolerância.
- `late` vale `true` quando `done` ou `partial` acontece depois de `overdue_at`. A regra olha o relógio, não o estado anterior, então o resultado não depende de o job de vermelho automático já ter rodado. Ele só chega em F4-6, e até lá as ocorrências ficam `pending` depois do prazo.
- A janela vai até `overdue_at + taskRules.lateCompletionWindowHours`, padrão 72 horas, o bastante para atravessar um fim de semana. Depois dela, a resposta é `late_window_expired`.
- Quem tem `task.manage_group` no grupo da tarefa não tem janela: o admin corrige o passado, e `late` continua verdadeiro.
- XP: `done` atrasado usa `done_late`. `partial` atrasado mantém o valor de `partial`, porque a seção 7.11 só reduz o verde.
- Reabrir zera `late` e `status_reason`.

### 2. Refinos do modelo da seção 8

- `tasks.group_id` é copiado do contexto por trigger e nunca muda. A RLS não precisa passar por `contexts`.
- O contexto de uma tarefa só muda para outro do mesmo dono, para uma tarefa não escapar do grupo.
- Contexto pessoal exige `visibility = 'private'` e `assignee_id = created_by`. `private` em contexto de grupo exige `assignee_id = created_by`: o admin não cria uma tarefa alheia que ele mesmo deixaria de ver.
- `task_occurrences` ganha `overdue_at`. `partial_reason` vira `status_reason`, que vale para qualquer mudança e alimenta o histórico. `proof_review_status` fica para a Fase 3.
- `scheduled_start` e `scheduled_due` nunca são nulos: `start_at` ou, sem início, `due_at`; `due_at`, ou início + duração, ou a meia-noite local seguinte em `all_day`. O início sem nulo mantém válida a unicidade por `(task_id, scheduled_start)`.
- `tasks.parent_task_id` liga as partes de uma série dividida. `tasks.materialized_until` é o cursor da materialização.
- `exdates` guarda instantes iguais ao `scheduled_start` excluído.
- `status_changed_by` e `changed_by` nulos significam job, ou conta excluída.
- Excluir é arquivar: `archived_at` na tarefa, sem `delete` para o cliente. A exclusão definitiva fica para F8-3.
- O cliente não tem `update` nem `delete` em `tasks` e não escreve em `task_occurrences`, `task_status_history` nem `xp_events`. `tasks` aceita `insert` por coluna, com RLS.

### 3. Permissões

| Chave                    | owner | admin | member | Significado                                                                  |
| ------------------------ | ----- | ----- | ------ | ---------------------------------------------------------------------------- |
| `task.create_for_others` | sim   | sim   | não    | Criar ou reatribuir tarefa para outro membro                                 |
| `task.view_group`        | sim   | sim   | não    | Ver as tarefas `group` do grupo, a visão Equipe e os calendários dos membros |
| `task.manage_group`      | sim   | sim   | não    | Editar, cancelar ou excluir qualquer tarefa `group`; resolver fora da janela |
| `task.edit_assigned`     | sim   | sim   | não    | Editar uma tarefa que outra pessoa criou e atribuiu a mim                    |
| `task.delete_assigned`   | sim   | sim   | não    | Cancelar ou excluir uma tarefa que outra pessoa criou e atribuiu a mim       |

`task.manage_group` é uma chave a mais do que o pedido inicial. Sem ela, liberar `task.edit_assigned` para `member` daria a ele poder sobre as tarefas de todos, e o objetivo da seção 7.1 é uma chave que trate só das tarefas atribuídas a ele.

Por padrão, `member` não vê as tarefas `group` dos colegas, conforme a seção 7.1. Uma família que queira isso muda uma linha da matriz.

### 4. Atores e transições

O ator é derivado a cada pedido, nunca guardado. `própria` significa `tasks.created_by = eu` e `tasks.assignee_id = eu`.

- `assignee`: `task_occurrences.assignee_id = eu`.
- `editor`: tarefa própria, ou `visibility = 'group'` com `task.manage_group`, ou `tasks.assignee_id = eu` com `task.edit_assigned`.
- `deleter`: tarefa própria, ou `visibility = 'group'` com `task.manage_group`, ou `tasks.assignee_id = eu` com `task.delete_assigned`.
- `system`: job, sem usuário.

Os dois responsáveis divergem em ocorrências anteriores a uma reatribuição: quem resolveu segue `assignee` delas, e só o responsável atual edita a tarefa.

Em tarefa de grupo, todos exigem ser membro atual. Quem sai perde o acesso às tarefas daquele grupo.

`OccurrenceListItem.task` traz `groupId`, `createdBy` e `assigneeId`, para a UI espelhar esta regra sem outra leitura, e `difficulty`, para mostrar o XP.

A tabela é `occurrenceTransitions`, em `packages/contracts`, com espelho em `public.occurrence_transitions`:

| De          | Para        | Atores                   |
| ----------- | ----------- | ------------------------ |
| `pending`   | `done`      | assignee, editor         |
| `pending`   | `partial`   | assignee, editor         |
| `pending`   | `missed`    | assignee, editor, system |
| `pending`   | `cancelled` | deleter                  |
| `missed`    | `done`      | assignee, editor         |
| `missed`    | `partial`   | assignee, editor         |
| `missed`    | `pending`   | editor                   |
| `missed`    | `cancelled` | deleter                  |
| `done`      | `pending`   | assignee, editor         |
| `partial`   | `pending`   | assignee, editor         |
| `cancelled` | `pending`   | deleter                  |

`done` e `partial` não passam direto um para o outro: reabrir antes mantém o XP simples. O responsável não reabre `missed`, porque isso não acrescenta nada a `missed → done`.

`partial` exige motivo quando `tasks.requires_partial_reason` é verdadeiro.

### 5. Como o banco garante

Duas camadas, ambas no Postgres:

1. **RPC `set_occurrence_status`**, `security definer`, é o único caminho do cliente. Trava a linha, compara `expectedStatus`, resolve o ator e confere ator, motivo e janela.
2. **Triggers em `task_occurrences`** valem para qualquer caminho, inclusive service role. O `before update of status` recusa um par fora de `occurrence_transitions` e preenche `late` e os campos `status_changed_*`. O `after update of status` grava o histórico e o XP.

Assim, o job da Fase 4 e o `proof-validate` da Fase 3 fazem um `update` simples e herdam histórico e XP. A Fase 3 acrescenta a regra da prova no mesmo trigger.

As regras usadas por triggers ficam em `public.app_settings`, chave `task_rules`, com o mesmo conteúdo de `taskRules` em `packages/config`. É o padrão da matriz de permissões: migration, espelho e `pnpm db:check-permissions`.

### 6. XP

O banco é o único escritor de `xp_events`, no trigger da transição, de forma atômica. O valor é `xp.status × xp.difficultyWeight`.

- Sair de `done` ou `partial` grava um evento compensatório, com `amount` igual ao saldo negativo da ocorrência e motivo `occurrence_reverted`. Evento nunca é editado, e concluir e reabrir em ciclo soma zero.
- Valor zero não gera evento.
- O XP vai para `task_occurrences.assignee_id`, mesmo quando um admin resolve por ele.
- Tarefa `private` grava `group_id` nulo, para não vazar ao grupo pelo ranking.
- `packages/core` calcula o mesmo valor apenas para mostrar na tela.

### 7. Recorrência e materialização

- `tasks.rrule` guarda só a regra, sem `DTSTART`. A âncora é `coalesce(start_at, due_at)`, e o fuso é `tasks.timezone`.
- `UNTIL` fica em UTC. A expansão acontece em hora local, para 9h continuar 9h quando o fuso muda de offset.
- `RecurrenceInput` é o que a tela edita. `packages/core` converte nos dois sentidos, e nada mais lê RRULE.
- `monthDay` de 29 a 31 cai no último dia dos meses mais curtos, com `BYMONTHDAY=28,...,d;BYSETPOS=-1`. Sem isso, "todo dia 31" pularia sete meses por ano. É RFC 5545 puro, então a exportação `.ics` não precisa de tradução. Até 28, `BYMONTHDAY=d`.
- Se a âncora não bate com a regra, a primeira ocorrência é a primeira data da regra, e a âncora não vira ocorrência. O RFC 5545 deixa esse caso indefinido, e o `rrule` age assim. O editor alinha `startAt` à regra ao salvar, para a data mostrada ser a real. O banco não confere isso.
- **Tarefa avulsa:** um trigger cria e mantém a única ocorrência. Ele não cria quando a tarefa nasce com `parent_task_id`, porque ali a ocorrência é reaproveitada.
- **Tarefa recorrente:** a Edge Function `materialize-occurrences` expande com o código de `packages/core`, porque o Postgres não tem expansão de RRULE. Só ela insere ocorrências recorrentes.
  - O cron diário manda o corpo vazio e cobre a janela de `materializationWindowDays`.
  - O cliente chama com `taskIds` depois de criar ou editar, e com `until` ao navegar além da janela, limitado a `onDemandMaxDays`. A lista de tarefas vem da RLS do próprio usuário.
  - Cada tarefa expande de `coalesce(materialized_until, âncora)` até o limite, e `on conflict do nothing` a torna idempotente. Um job fora do ar se recupera sozinho na próxima execução.
  - Tarefas arquivadas ficam de fora.

### 8. Escopos de edição

`edit_task` e `delete_task` são RPCs atômicas. O cliente envia o formulário inteiro e, quando há RRULE nova, a string já calculada em `packages/core`. Depois chama a materialização para os `task_id` devolvidos.

| Escopo               | Tarefa original                                                      | Ocorrências                                                                                                                    | Tarefa nova                                                 |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `this`               | O instante entra em `exdates`                                        | A linha, que precisa estar `pending`, passa para a tarefa nova com o mesmo `id`                                                | Avulsa, com os campos do formulário                         |
| `this_and_following` | `rrule` termina em `UNTIL`, logo antes do pivô; `COUNT` vira `UNTIL` | Do pivô em diante: resolvidas passam para a tarefa nova; pendentes sem histórico são apagadas; com histórico viram `cancelled` | Recorrente, a partir do pivô; `COUNT` guarda só o que resta |
| `all`                | Atualizada; `materialized_until = now()` se a agenda mudou           | Resolvidas e passadas ficam. Pendentes futuras: se a agenda mudou, como acima; se não, recebem o novo responsável              | Nenhuma                                                     |

- Em todos os casos, resolvida é história: edições de agenda não a alteram.
- A tarefa nova aponta para a original em `parent_task_id`.
- `this_and_following` na primeira ocorrência equivale a `all`. `splitRecurrence` devolve `headRrule` nulo, e a RPC segue esse caminho. "Primeira" é a primeira da regra, não a âncora.
- O `UNTIL` da tarefa original é o fim do dia local anterior ao pivô, em UTC. Equivale a "logo antes do pivô", porque as regras do app têm no máximo uma ocorrência por dia local, e o editor volta a mostrar uma data simples.
- `after_count` no formulário conta a partir do início da tarefa editada, como o editor mostra o `COUNT` dela. A tarefa nova recebe esse valor menos as ocorrências antes do pivô, então manter o número não alonga a série. As ocorrências em `exdates` entram na conta, como no RFC 5545. Um valor que não passa do pivô é erro: `count_before_pivot`, em `packages/core`.
- `all` vale para o trecho da série, não para os trechos já divididos. A exceção é excluir.
- Em tarefa avulsa, todo escopo equivale a `all`, e mudar a agenda exige ocorrência `pending`.
- Reagendar é editar com escopo `this`. Para reagendar uma `missed`, primeiro se reabre.
- Duplicar é ler a tarefa e criar outra. Não precisa de RPC.

Excluir:

| Escopo               | Efeito                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `this`               | Transição para `cancelled`. A linha fica, então a materialização não a recria                   |
| `this_and_following` | `UNTIL` como acima, e as pendentes do pivô em diante viram `cancelled`                          |
| `all`                | `archived_at` na tarefa e nas descendentes por `parent_task_id`; as pendentes viram `cancelled` |

### 9. Quando alguém sai do grupo

Nada é apagado. A RLS corta o acesso, a materialização e o job de vermelho ignoram ocorrências de quem não é mais membro, e o admin reatribui.

### 10. Fora da Fase 2

- **Checklist de subitens:** o campo é opcional na seção 7.3, e nenhuma tela da Fase 2 depende dele.
- **Comentários:** a própria seção 7.3 permite adiar.
- **Prova:** as flags são gravadas, mas a Fase 2 não as usa nem as mostra na tela.
- **XP de prova e de dia perfeito:** Fases 3 e 6.

## Alternativas

- **Tornar o vermelho definitivo:** simples, mas pune a honestidade e obriga o admin a resolver casos comuns.
- **Janela contada a partir de `missed`:** o resultado dependeria do horário do job.
- **Colunas de exceção na ocorrência, para `this`:** cobririam só alguns campos, e cada campo novo exigiria outra coluna. Destacar a ocorrência serve para todos, mantém `id`, histórico e XP e equivale a um `VEVENT` de exceção do iCalendar.
- **`original_start` na ocorrência:** dispensável, porque só ocorrências de tarefa avulsa mudam de horário.
- **Trigger sem RPC:** o trigger não recebe motivo nem saberia dizer quem é o ator, e uma política de `update` não expressa a janela.
- **RPC sem trigger:** o job e o `proof-validate` teriam de repetir histórico e XP.
- **Inserir XP pelo cliente:** adulterável.
- **Materializar no cliente:** um membro poderia inserir ocorrências falsas em uma tarefa do admin e ganhar XP.
- **Só ocorrências virtuais além da janela:** menos escrita, mas duas formas de ler o calendário, e a seção 7.5 pede geração sob demanda.
- **`series_id` em vez de `parent_task_id`:** simplifica `all`, mas o que `all` significa entre trechos com regras diferentes continua indefinido. Pode ser adicionado sem perda.
- **Valores só em `packages/config`:** o trigger não os alcança.
- **Regras por grupo em `groups.settings`:** nada pede isso agora. A leitura em `app_settings` tem um único lugar para mudar quando pedir.

## Consequências

- Mudar `taskRules` ou `occurrenceTransitions` exige também uma migration, e `pnpm db:check-permissions` acusa a diferença.
- Mudanças em `toleranceMinutes` valem para ocorrências novas, porque `overdue_at` é gravado. A janela vale de imediato, inclusive para as antigas.
- `all` depois de uma divisão não alcança trechos anteriores.
- Depois de uma edição com mudança de agenda, a série fica sem as ocorrências futuras até a materialização responder. Se a chamada falhar, o cron diário repõe.
- Antes de F4-6, nenhuma ocorrência fica `missed` sozinha, e depois da janela o responsável só consegue marcar `missed`.
- Sequências de "só esta" criam uma linha em `tasks` por exceção, o mesmo custo de um arquivo iCalendar. A exportação `.ics` da seção 7.9 sai quase direta desse modelo.
- A Edge Function importa `packages/core`, o que exige import map no Deno.
