# Handoff: arquiteto para auth-grupos, `staleTime` em `useCurrentUser` (QA8-3)

**De:** arquiteto
**Para:** auth-grupos
**Data:** 2026-11-03 08:15 (BRT)
**Branch:** `docs/phase-8-perf-decisions`

## Contexto

ADR-0012, seção 10, meta 2 (agora 14 chamadas REST ao abrir Hoje com 50 ocorrências). Das 17 medidas em QA8-3, `profiles` e `groups` saem duas vezes cada: `useCurrentUser` usa `staleTime` 0, e as `OccurrenceRow`, que montam depois de o dado chegar, o acham velho e pedem de novo.

## O que o destinatário precisa fazer

- Em `packages/data/src/session/index.ts`, `staleTime: defaults.currentUserStaleMs` (60 s, já em `packages/config/src/defaults.ts`) nas duas consultas, `['profile']` e `['groups']`.
- Conferir que toda mutação do próprio usuário que muda perfil ou grupos (nome, fuso, criar, renomear, sair, aceitar convite, papel) invalida a chave, porque o refetch na montagem deixa de cobrir a falta.
- Não pôr `staleTime` global no `QueryClient` (decisão do ADR).

## Como testar

`pnpm check`. Na pilha A, `pnpm exec playwright test e2e/performance.spec.ts --project=app`: `profiles` e `groups` uma vez cada no console.
