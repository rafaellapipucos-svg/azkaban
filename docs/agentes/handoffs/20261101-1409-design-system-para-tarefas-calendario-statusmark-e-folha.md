# Handoff: design-system para tarefas-calendario, StatusMark, Sheet e Input no `@azkaban/ui`

**De:** design-system | **Para:** tarefas-calendario | **Data:** 2026-11-01 14:09 (BRT) | **Branch:** `feat/ui-phase-2-a11y`

## Contexto

Os pedidos de `feat/tasks-calendar` (marcador de estado, rótulos longos) e os bugs do QA (chips, teclado, contraste, modal, títulos) foram resolvidos em `packages/ui`.

## O que foi entregue

- `StatusMark` (`size="dot" | "row"`), com os mesmos símbolos e cores de `TaskCheck` e `StatusBadge`, que agora dividem `statusSymbol`. Aceita os cinco estados, incluindo `cancelled`.
- `Sheet` (folha de baixo com nome acessível e devolução de foco), `Input` (campo de texto com exemplo legível nos dois temas) e `Subtitle level={2 | 3}`.
- `Chip` quebra o nome longo em linhas e nunca passa da largura da linha; `SegmentedControl` mantém o `✓` junto do rótulo, mesmo em duas linhas.
- Espaço aciona `TaskCheck`, `SwitchRow`, `Chip` e `SegmentedControl` (adapter `activateOnSpace` em `packages/platform`).

## O que o destinatário precisa fazer

1. **Trocar o `StatusMark` do calendário** pelo de `@azkaban/ui` e apagar `packages/features/calendar/src/StatusMark.tsx` (usado em `ItemRow`, `MonthView`, `WeekView`). A API é a mesma (`status`, `size`); `CalendarStatus` é subconjunto de `OccurrenceStatus`, então os tipos servem.
2. Nada mais é obrigatório. Dois ajustes já feitos fora do escopo do `design-system`, mínimos: `QuickCreate.tsx` usa `Sheet` no lugar de `Modal` e `StatusActions.tsx` usa `Input` no lugar de `TextInput`.
3. Opcional: onde um `Subtitle` é o nome de um item dentro de uma seção (ex.: nome do grupo), usar `level={3}`.

## Contratos criados ou alterados

Nenhum.

## Bloqueios e dúvidas

Nenhum. A barra de abas apertada (item 6 do handoff do QA) é do `arquiteto` (casca do app) e não foi tocada.

## Como testar

`pnpm dev`, abrir `/design-system`: nomes longos, folha, teclado (Tab até o controle, Espaço) e marcadores de estado têm exemplos.
