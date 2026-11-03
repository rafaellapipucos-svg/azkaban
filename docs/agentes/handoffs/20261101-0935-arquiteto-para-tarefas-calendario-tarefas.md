# Handoff: arquiteto para tarefas-calendario, tarefas (F2-3 a F2-10 e F2-12)

**De:** arquiteto
**Para:** tarefas-calendario
**Data:** 2026-11-01 09:35 (BRT)

## Contexto

Contratos da Fase 2 publicados antes das branches paralelas. As regras e os motivos estão no [ADR-0005](../../adr/0005-tarefas-ocorrencias-recorrencia.md).

## O que foi entregue

Branch `feat/tasks-contracts`, a partir de `feat/phase-2-tasks`.

## Contratos criados ou alterados

- `packages/contracts` foi dividido por módulo, sem mudar nada do que já existia. `index.ts` continua sendo a única entrada.
- `tasks.ts`: `taskInputSchema`, `taskBatchInputSchema`, `taskSchema`, `occurrenceSchema`, `OccurrenceListItem`, `occurrenceTransitionInputSchema`, `statusHistoryEntrySchema`, `taskEditInputSchema`, `taskDeleteInputSchema`, `teamOverviewRowSchema`, `xpEventSchema`, `taskErrorCodeSchema`.
- `recurrence.ts`: `recurrenceInputSchema`, o que o editor edita.
- `occurrence-transitions.ts`: `occurrenceTransitions`.
- `packages/config`: `taskDefaults` e `taskRules`.

## O que o destinatário precisa fazer

**Permissões.** Em `packages/core/src/permissions/matrix.ts`, acrescente a `owner` e `admin`: `task.create_for_others`, `task.view_group`, `task.manage_group`, `task.edit_assigned`, `task.delete_assigned`. `member` continua sem nenhuma.

**F2-3, `packages/core/src/tasks`.** `canTransition` lê `occurrenceTransitions`, sem copiar a tabela. Recebe a ocorrência, o destino, os atores do usuário e o que a regra exige: motivo, `requiresPartialReason`, `now`, `lateCompletionWindowHours`, e se ele tem `task.manage_group`. `core` não importa `config`: as regras entram por parâmetro. Funções para resolver os atores na UI também ficam aqui, sempre via `can(...)`. A segurança real está no banco, e estas funções só escondem botões e dão resposta rápida.

**F2-4, `packages/core/src/recurrence`.** Estes nomes são usados por `backend-funcoes`, então mantenha-os:

- `toRRule(recurrence, anchor, timezone)` e `fromRRule(rrule, timezone)`, um o inverso exato do outro para as regras que o app gera.
- `expandOccurrences(task, from, to)` devolve `{ scheduledStart, scheduledDue }[]`, sem `exdates`.
- `splitRecurrence(task, pivotStart, tailRecurrence)` devolve `{ headRrule, tailRrule }`, com `headRrule` nulo quando o pivô é a primeira ocorrência, e `COUNT` da cauda igual ao que resta.

Regras da seção 7 do ADR: sem `DTSTART` na string, `UNTIL` em UTC, expansão em hora local, `monthDay` de 29 a 31 cai no último dia do mês. Teste virada de offset com um fuso que ainda tenha horário de verão. Mantenha esta pasta sem dependência de React ou Expo, porque ela roda no Deno. `rrule`, `date-fns` e `date-fns-tz` entram no `package.json` de `core` nesta tarefa, conforme o ADR-0001.

**`scheduled_due` em `expandOccurrences`:** `timed`, início + duração, ou o próprio início; `all_day`, meia-noite local seguinte; `deadline`, `due_at` deslocado junto com a âncora.

**Repositórios, `packages/data/src/tasks`.**

- Criar: `insert` direto em `tasks` com `rrule` calculada, e `insert` em lote para `taskBatchInputSchema`. Se houver `rrule`, chame `materialize-occurrences` com `taskIds`.
- Mudar estado: RPC `set_occurrence_status`.
- Editar e excluir: RPCs `edit_task` e `delete_task`, depois `materialize-occurrences` com os `task_id` devolvidos. Falha nessa chamada não desfaz a edição: o cron repõe.
- Calendário além da janela: `materialize-occurrences` com `until`, e nova leitura.
- Mapeie o erro do Postgres por `taskErrorCodeSchema` para i18n.

**Formulários.**

- Comece de `taskDefaults`. Os schemas não têm valores padrão.
- `reminderLeadMinutes` vem do tipo de agendamento.
- `visibility` padrão: `group` em contexto de grupo, `private` em contexto pessoal, sem opção nesse caso.
- `area` não é campo: vem do contexto.
- `all_day`: `startAt` é a meia-noite local do dia, no fuso da tarefa.
- `deadline` só com data: `dueAt` às 23:59 locais.
- Criação rápida: título e horário, com o contexto padrão sendo o último usado. Sem nenhum contexto, abra o cadastro de contexto antes.
- Não mostre as opções de prova na Fase 2.
- `private` só aparece quando o responsável é quem cria.

**Ações.**

- Reagendar é editar com escopo `this`, e exige `pending`.
- Duplicar é ler e criar.
- Excluir em tarefa avulsa envia `all`.
- Para mostrar a janela, use `overdueAt + lateCompletionWindowHours`.
- Depois de `overdueAt`, a ocorrência `pending` aparece como atrasada: F4-6 ainda não existe.
- Passada a janela, o botão de concluir some para quem não tem `task.manage_group`.

**F2-10.** A RPC `team_overview` dá as linhas por membro e dia. A taxa de conclusão é uma função em `core`, com `cancelled` já fora da conta. Provas aguardando revisão são da Fase 3. Membros sem linha vêm da lista de membros do grupo.

**F2-12 mudou de forma.** O banco é o único escritor de `xp_events`. O que sobra aqui é uma função em `core` que calcula `xp.status × difficultyWeight` para mostrar na tela, recebendo `taskRules.xp`, e a leitura dos eventos.

## Bloqueios e dúvidas

- Depende da migration de `banco-de-dados` para ter RPCs reais, e de `backend-funcoes` para a materialização. F2-3 e F2-4 podem começar já.
- Checklist e comentários estão fora dos contratos. Não os implemente na Fase 2.

## Como testar

`pnpm check`. Testes de unidade para cada linha de `occurrenceTransitions`, para a janela e para ida e volta de RRULE. Com o banco no ar, `pnpm db:check-permissions` confere a matriz.
