# Handoff: tarefas-calendario para arquiteto, lacunas em `OccurrenceListItem` e dúvidas do ADR-0005

**De:** tarefas-calendario
**Para:** arquiteto
**Data:** 2026-11-01 09:51 (BRT)

## Contexto

Ao implementar F2-3 e F2-4 em `packages/core` (branch `feat/tasks-core`), encontrei uma lacuna de contrato e três pontos do ADR-0005 que precisaram de uma escolha. Não alterei `packages/contracts` nem `packages/config`.

## O que foi entregue

`packages/core/src/tasks` (atores, transições, janela de atraso, XP), `packages/core/src/recurrence` (RRULE, expansão, divisão) e as 5 chaves novas na matriz de permissões.

## Contratos criados ou alterados

Nenhum. Pedidos abaixo.

## O que o destinatário precisa fazer

**1. `OccurrenceListItem.task` não alcança o que a UI precisa (pedido de contrato).**

`deriveActors` (ADR-0005, seção 4) precisa de `groupId`, `createdBy`, `assigneeId` e `visibility` da tarefa, e `occurrenceXp` precisa de `difficulty`. Hoje `OccurrenceListItem` tem `visibility`, mas não tem `groupId`, `createdBy` nem `difficulty`; o `assigneeId` vem da ocorrência. Sem `createdBy`, a tela não distingue "tarefa própria" (criada por mim para mim) de "tarefa que outra pessoa atribuiu a mim", e é exatamente isso que decide se um `member` vê o botão de editar ou excluir. Sem `groupId`, não dá para chamar `can(...)` nem saber se a tarefa é de contexto pessoal.

Proposta: acrescentar `'createdBy' | 'groupId' | 'difficulty'` ao `Pick<Task, ...>` de `OccurrenceListItem.task`. A leitura em `packages/data` (join com `tasks`) passa a trazê-los. Enquanto isso não muda, `deriveActors` recebe um `ActorSubject` próprio (`groupId`, `createdBy`, `assigneeId`, `visibility`), e a tela precisa preenchê-lo por outro caminho.

**2. `COUNT` em `this_and_following` (seção 8).**

O ADR diz que a cauda guarda "só o que resta" do `COUNT`. A assinatura do handoff é `splitRecurrence(task, pivotStart, tailRecurrence)`, e o `tailRecurrence.end` é o que o editor mostra. Escolhi: `after_count` na cauda conta as ocorrências da **série inteira**, como o editor exibe o `COUNT` original, e a cauda recebe `count - (ocorrências antes do pivô)`. Se o novo valor não passar do pivô, lança `RangeError('count_before_pivot')`. As ocorrências antes do pivô contam com `exdates`, como o RFC 5545 conta `COUNT`. Se preferir que o `count` da cauda seja "a partir do pivô", é uma linha em `split.ts`.

**3. `UNTIL` da cabeça (seção 8).**

O ADR diz "`UNTIL` logo antes do pivô". Gravei o fim do dia local anterior ao pivô, em UTC. É equivalente, porque uma regra tem no máximo uma ocorrência por dia local, e faz `fromRRule` da cabeça devolver uma data simples (o dia anterior ao pivô) para o editor, em vez de um horário quebrado.

**4. `monthDay` de 29 a 31 em RRULE padrão.**

O ADR pede que caia no último dia dos meses curtos, sem dizer como escrever isso. Usei `BYMONTHDAY=28,29,...,d;BYSETPOS=-1` (o último dia que o mês tem entre 28 e `d`). É RFC 5545 puro, então a exportação `.ics` da seção 7.9 sai sem tradução. `monthDay` até 28 é `BYMONTHDAY=d`.

**5. Âncora fora da regra.**

Se `startAt` não bate com a regra (âncora numa segunda, regra às quartas), a primeira ocorrência é a primeira data que bate, e a âncora não vira ocorrência. Isso segue o `rrule` e o RFC trata como indefinido. O editor deveria alinhar `startAt` à regra ao criar. `splitRecurrence` chama de "primeira ocorrência" a primeira da regra, não a âncora.

## Bloqueios e dúvidas

- `date-fns` e `date-fns-tz` **não entraram** em `packages/core`, ao contrário do que o handoff F2-4 e o ADR-0001 previam. Testei a 3.2.0 do `date-fns-tz`: `getTimezoneOffset` erra por algumas horas ao redor da virada de horário de verão (`America/New_York`, 2026-03-08T06:59:59Z devolve -4 em vez de -5), e `fromZonedTime` resolve a hora repetida conforme o fuso da máquina e leva a hora inexistente para trás. Implementei a conversão só com `Intl` (`recurrence/zone.ts`), com testes de virada em `America/New_York` e de meia-noite inexistente em `America/Sao_Paulo` (2018). Se quiser registrar isso, cabe uma nota no ADR-0001.
- `toRRule(recurrence, anchor, timezone)` usa `anchor` só para recusar `on_date` anterior à âncora (`recurrence_ends_before_anchor`). O editor deve validar isso antes.

## Como testar

`pnpm --filter @azkaban/core test`.
