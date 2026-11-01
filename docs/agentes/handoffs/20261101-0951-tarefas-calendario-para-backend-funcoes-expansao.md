# Handoff: tarefas-calendario para backend-funcoes, expansão de ocorrências (F2-4)

**De:** tarefas-calendario
**Para:** backend-funcoes
**Data:** 2026-11-01 09:51 (BRT)

## Contexto

A expansão de RRULE que a `materialize-occurrences` (F2-5) deve chamar está pronta em `packages/core/src/recurrence`, na branch `feat/tasks-core`. Regras no [ADR-0005](../../adr/0005-tarefas-ocorrencias-recorrencia.md), seções 7 e 8.

## O que foi entregue

Exportado por `@azkaban/core`:

```ts
function expandOccurrences(
  task: ExpandableTask,
  from: string, // instante ISO, com Z ou offset (+00:00 também serve)
  to: string, // instante ISO
): { scheduledStart: string; scheduledDue: string }[];

type ExpandableTask = Pick<
  Task, // @azkaban/contracts
  'scheduleType' | 'startAt' | 'dueAt' | 'durationMin' | 'timezone' | 'rrule' | 'exdates'
>;
```

- Intervalo semiaberto: `from <= scheduledStart < to`. Janelas consecutivas (`[a,b)` e `[b,c)`) não repetem nem perdem ocorrência, o que casa com o cursor `materialized_until`.
- Devolve instantes UTC em `toISOString()` (`...Z`), em ordem crescente.
- **`exdates` já são aplicados** dentro da função (comparação por instante, então `+00:00` e `Z` são equivalentes). Você não precisa filtrá-los de novo; filtrar de novo é inofensivo.
- Âncora: `coalesce(startAt, dueAt)`, calculada dentro da função (também exportada como `taskAnchor(task)`). Nada é devolvido antes da âncora. `from` pode ser anterior à âncora.
- `rrule` nulo devolve a única ocorrência da tarefa avulsa, se ela cair na janela. A materialização só chama para tarefas com `rrule`.
- A expansão é em hora local no `timezone` da tarefa. `COUNT` conta a partir da âncora, não da janela, e o `UNTIL` inclui a ocorrência do dia dele.
- `scheduledDue`: `timed`, início + `durationMin` (ou o próprio início); `all_day`, meia-noite local seguinte; `deadline`, `dueAt` deslocado em dias locais junto com a âncora.
- Lança `RangeError('task_without_anchor')` se `startAt` e `dueAt` forem nulos. Não deve acontecer com o schema do banco.
- Custo: o `rrule` itera desde a âncora até o fim da janela. Para diária com anos de idade e janela de 60 a 366 dias, são alguns milhares de passos, sem problema. Não pagina.

## Contratos criados ou alterados

Nenhum. Também exportados e já testados: `toRRule`, `fromRRule`, `splitRecurrence` (usados pelo cliente, não por você).

## O que o destinatário precisa fazer

1. Importar `expandOccurrences` de `@azkaban/core` (import map do Deno).
2. Chamar `expandOccurrences(task, from, limite)` com `from = coalesce(materialized_until, âncora)`, como no handoff da materialização. Pode passar a linha da tarefa já mapeada para camelCase.
3. As dependências npm do core são só `rrule` (2.8.1, via `tslib`) e o próprio `@azkaban/contracts` (que usa `zod`). `packages/core/src/recurrence` não importa nada de Node, React ou Expo: usa só `Intl` e `Date`. **Não foi testado dentro do Deno**: confirme o empacotamento com `supabase functions deploy`.
4. O core não usa `date-fns` nem `date-fns-tz`, de propósito: a versão 3.2.0 do `date-fns-tz` calcula errado o offset perto da virada de horário de verão e resolve a hora repetida conforme o fuso da máquina. A conversão local para UTC está em `packages/core/src/recurrence/zone.ts`, só com `Intl`.

## Bloqueios e dúvidas

- Ocorrência cuja hora local não existe no dia (02:30 na virada para o horário de verão) é movida para a frente (03:30). Hora repetida (01:30 na volta) vira a primeira. Isso importa só para fusos com horário de verão; `America/Sao_Paulo` não tem hoje.
- `exdates` guarda instantes iguais ao `scheduled_start` excluído (ADR-0005, seção 2). Se o `timezone` da tarefa mudar depois de gravar um EXDATE, o instante antigo pode deixar de bater com a expansão nova. O ADR não prevê edição do fuso; fica o aviso.

## Como testar

`pnpm --filter @azkaban/core test`. Os testes de `expand.test.ts` cobrem janela semiaberta, EXDATE, âncora, COUNT, UNTIL, fim de mês, `America/New_York` (virada de março e de novembro) e `America/Sao_Paulo`. Para o teste de integração da função: tarefa semanal por 60 dias gera as ocorrências certas e repetir insere zero.
