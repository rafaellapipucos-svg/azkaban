# Handoff: gamificacao para qa-testes, tela de dia perfeito nas E2E

**De:** gamificacao
**Para:** qa-testes
**Data:** 2026-11-03 04:15 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/gamification-client-security`, a partir de `feat/phase-6-gamification`

## Contexto

Correções do QA da Fase 6. Com a QA6-2, a tela de dia perfeito (um `dialog` que não fecha sozinho e prende o foco) passa a abrir também quando a rajada traz uma conquista. O caso mais comum nas E2E é uma conta nova com uma tarefa só, concluída: antes vinha o cartão "Conquista: Primeira tarefa", que fecha sozinho e não bloqueia a tela; agora vem a tela de dia perfeito, com a conquista como linha.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. Rodar a suíte E2E inteira. Toda spec em que uma conta nova conclui a única tarefa do dia e depois mexe na tela pode travar no `dialog`. Pela leitura, `tasks.spec.ts` ("quick create shows in Hoje…": conclui "Lavar a louça" e depois toca no check de novo) é o primeiro candidato. Também vale olhar `tasks-ui-fixes`, `tasks-order`, `tasks-late-and-count`, `proof-*` e `notifications-jobs`. Nenhuma delas foi rodada aqui.
2. Onde travar, fechar com "Continuar", como `gamification.spec.ts` já faz, ou criar uma segunda tarefa para o dia não ficar perfeito.
3. QA6-1: já apertei a E2E para `'0 dias de ofensiva'` em `e2e/gamification.spec.ts`.

## Bloqueios e dúvidas

Precisa da pilha.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test --project=app`.
