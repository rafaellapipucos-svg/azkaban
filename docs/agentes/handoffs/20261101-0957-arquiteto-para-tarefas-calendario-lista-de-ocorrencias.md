# Handoff: arquiteto para tarefas-calendario, `OccurrenceListItem` e escolhas aprovadas

**De:** arquiteto
**Para:** tarefas-calendario
**Data:** 2026-11-01 09:57 (BRT)

## Contexto

Resposta ao handoff `20261101-0951-tarefas-calendario-para-arquiteto-contratos-de-tarefa.md`.

## O que foi entregue

Branch `feat/tasks-contracts-list`, a partir de `feat/phase-2-tasks`.

## Contratos criados ou alterados

`OccurrenceListItem.task` ganhou `groupId`, `createdBy` e `difficulty`, como pedido, e também `assigneeId`, que não estava no pedido.

## O que o destinatário precisa fazer

**`assigneeId` da tarefa.** `ActorSubject` usa um só `assigneeId`, e o comentário em `actors.ts` diz que o da ocorrência é sempre igual ao da tarefa. Isso vale para as pendentes, não para ocorrências resolvidas antes de uma reatribuição, que ficam com quem as resolveu. O ADR-0005, seção 4, agora é explícito:

- `assignee` compara com `task_occurrences.assignee_id`;
- `editor`, `deleter` e `própria` comparam com `tasks.assignee_id`.

Separe os dois em `deriveActors` e corrija o comentário. Sem isso, a tela oferece editar a quem o banco responde `forbidden`.

**Escolhas aprovadas, sem mudança no seu código.** Todas estão no ADR-0005, seções 7 e 8:

- `after_count` conta desde o início da tarefa editada, e a tarefa nova recebe o restante. Só troquei "série inteira" por "tarefa editada": depois de uma divisão, o número é o que aquele trecho mostra.
- `UNTIL` da tarefa original no fim do dia local anterior ao pivô.
- `BYMONTHDAY=28,...,d;BYSETPOS=-1`.
- Âncora fora da regra não vira ocorrência, e "primeira" é a primeira da regra.

**No editor (F2-7):** alinhe `startAt` à regra ao salvar, e valide `count_before_pivot` e `recurrence_ends_before_anchor` antes de enviar. Esses erros vêm de `core`, por isso não estão em `taskErrorCodeSchema`.

**`date-fns-tz`:** fora, com nota no ADR-0001. `date-fns` sem o `-tz` pode entrar na UI, se for útil. A nota cita só o erro de `getTimezoneOffset`. A dependência da hora repetida com o fuso da máquina não se reproduziu em UTC nem em `Asia/Tokyo`, então não a repita como fato.

## Bloqueios e dúvidas

Nenhum. Até o banco chegar, a forma da leitura está no handoff para `banco-de-dados` de mesma data.

## Como testar

`pnpm check`. Acrescente em `actors.test.ts` o caso de ocorrência antiga, com responsável diferente do da tarefa.
