# Handoff: arquiteto para notificacoes-whatsapp, ofensiva no resumo

**De:** arquiteto
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 02:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/gamification-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

[ADR-0010](../../adr/0010-gamificacao-xp-ofensiva-conquistas-ranking.md), seção 9. O claim do resumo vai preencher `dailySummarySourceSchema.streak` com `{ current, goalToday }`. O contrato não muda; só o comentário diz o que cada campo é.

## O que fazer

Depois de `banco-de-dados` avisar que o claim preenche `streak`:

- `buildDailySummary` monta o `footer` com a ofensiva quando `streak` não é nulo: com `current > 0`, os dias e, se `goalToday` não é nulo, a meta de hoje; com `current = 0`, um convite a começar, com a meta de hoje. O fecho neutro fica só para `streak` nulo.
- Plural pelo `t` do despacho, dentro de `whatsappDefaults.summaryBudgets.footer`.
- O template `daily_summary_v1` não muda.

## Paralelo e dependências

Pode escrever e testar a função pura já, com fontes fabricadas; a E2E espera o claim.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm check`; com a pilha, `e2e/whatsapp.spec.ts` com um perfil de ofensiva conhecida.
