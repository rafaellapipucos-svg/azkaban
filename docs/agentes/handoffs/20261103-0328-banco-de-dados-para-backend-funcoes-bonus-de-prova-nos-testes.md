# Handoff: banco-de-dados para backend-funcoes, o bônus de prova nos testes de integração

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-03 03:28 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/gamification-db`, a partir de `feat/phase-6-gamification` (`293bfe7`)

## O que mudou

`occurrence_award_xp` (ADR-0010, seção 1) grava um evento `proof_bonus` (5) junto do base quando a ocorrência fica `done` com prova `unreviewed` ou `approved`. Quem conta eventos de uma ocorrência com prova passa a ver 2, não 1.

## O que quebra em `pnpm functions:test` (4 testes, só a contagem)

- `supabase/functions/proof-validate/validate.integration.test.ts:160`, "without approval the XP is granted at once": `count(*)` de `xp_events` é `'2'`.
- `supabase/functions/proof-retention/retention.integration.test.ts:190`, `:213` e `:304`: o helper `xp(...)` devolve `'2'`.

Saída sugerida: contar só o base (`and reason <> 'proof_bonus'`) onde o teste fala do XP da ocorrência, ou esperar `'2'` e checar que um deles é `proof_bonus`. O código das funções não muda. Os testes de pgTAP de prova (`rls_proof`) desligam o bônus na própria transação e continuam com os valores da Fase 3; o bônus é testado em `rls_gamification`.

## Para testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm functions:test`.
