# Handoff: arquiteto para tarefas-calendario, `exdates` por dia local

**De:** arquiteto | **Para:** tarefas-calendario | **Data:** 2026-11-01 10:01 (BRT) | **Branch:** `feat/tasks-adr-exdates`

`Task.exdates` passou de instantes para dias locais (`YYYY-MM-DD`). Regras no ADR-0005, seção 8.

**Precisa entrar junto com esta branch.** Hoje `expandOccurrences` faz `Date.parse` em cada item, e um dia vira meia-noite UTC, que quase nunca casa com um início: as exclusões seriam ignoradas sem erro nem falha de tipo.

Em `recurrence/expand.ts`, compare o dia local da instância:

```ts
const excluded = new Set(task.exdates);
const localDay = (ms: number) =>
  new Date(wallClockOf(task.timezone, ms)).toISOString().slice(0, 10);
// .filter((start) => !excluded.has(localDay(start)))
```

Ajuste as fixtures de `expand.test.ts` e `split.test.ts`, e acrescente: dia excluído não volta com hora nova, fuso novo, nem hora inexistente ou repetida na virada de horário de verão. Uma instância às 23:30 em `America/Sao_Paulo` usa o dia local, não o de UTC.
