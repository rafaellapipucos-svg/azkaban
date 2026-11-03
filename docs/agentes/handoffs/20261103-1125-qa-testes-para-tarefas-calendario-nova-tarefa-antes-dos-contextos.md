# Handoff: qa-testes para tarefas-calendario, "Nova tarefa" leva a "Novo contexto" antes de os contextos chegarem

**De:** qa-testes
**Para:** tarefas-calendario
**Data:** 2026-11-03 11:25 (BRT)
**Branch:** `test/backlog-e2e` (a partir de `feat/backlog-after-phase-8`, `960c107`)

## Contexto

Na repetição de `e2e/a11y.spec.ts` (`--repeat-each=3`, 3 workers), uma das três ficou parada 15 minutos: depois de `page.goto('/')` e do toque em "Nova tarefa", a tela era **"Novo contexto"**, e não a folha de criação rápida. A pessoa tem contexto ("Escritório", criado pelo `groupWithMember`).

Causa, por leitura: em `packages/features/tasks/src/QuickCreate.tsx`, `const list = contexts.data ?? []` e o `Fab` faz `list.length === 0 ? router.push('/contexts/new') : setOpen(true)`. Enquanto a consulta de contextos ainda carrega, `list` é vazio, e um toque rápido manda quem já tem contextos para criar um. Com a máquina carregada, a janela é larga o bastante para a E2E cair nela. O arquivo não mudou no backlog; a falha é antiga e intermitente.

## O que o destinatário precisa fazer

1. Só decidir "sem contexto" com a consulta resolvida: enquanto `contexts.isPending`, o `Fab` fica em carregamento (ou desligado), e não navega. Erro da consulta segue o caminho de erro da tela, não "Novo contexto".
2. Um teste de unidade do caso "carregando não navega", se o pacote tiver onde. Não mexer em `e2e/`.

## Como testar

Pilha A sozinha: `pnpm exec playwright test e2e/a11y.spec.ts --project=app --no-deps --repeat-each=3`. Para forçar a janela: atrasar `**/rest/v1/contexts*` com `page.route` em 3 s e tocar "Nova tarefa" logo depois do `goto('/')`; deve abrir a folha quando os contextos chegarem, e nunca "Novo contexto".

Observação para `qa-testes`: o clique do Playwright não tem `actionTimeout`, então essa falha esperou o timeout do teste (900 s) em vez de cair em segundos. Fica para avaliar um `actionTimeout` na config.
