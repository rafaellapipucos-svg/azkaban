# Handoff: compras para backend-funcoes, zero no plural nos textos das Edge Functions

**De:** compras
**Para:** backend-funcoes
**Data:** 2026-11-03 17:22 (BRT)
**Branch:** `fix/zero-plural` (a partir de `feat/launch-decisions`, `33132dc`)

## Contexto

O humano decidiu que contagem zero usa o plural ("0 dias", não "0 dia"; ADR-0012, seção 17 item 10). Em `fix/zero-plural`, toda chave de contagem de `packages/i18n/src/pt-BR/*.json` ganhou `_zero`, e o i18next do app usa `_zero` sempre que `count === 0`.

O `t` próprio das funções, `supabase/functions/dispatch-notifications/translate.ts` (`makeTranslate`), não procura `_zero`: tenta só `_${Intl.PluralRules.select(count)}` e `_other`. Com `count: 0`, o CLDR de pt-BR devolve `one`, então push e WhatsApp continuam no singular (ex.: `whatsapp.summary.streak.days` com 0 daria "Ofensiva de 0 dia.").

## O que o destinatário precisa fazer

1. Em `makeTranslate`, procurar `${key}_zero` antes das outras formas quando `count === 0`, como o i18next faz.
2. Um caso em `push.test.ts` (que já lê o JSON real): `count: 0` dá o texto de `_zero` e `count: 1` continua no singular.

## Como testar

`pnpm functions:test` com a pilha, ou só o `push.test.ts` pelo `node --test`.
