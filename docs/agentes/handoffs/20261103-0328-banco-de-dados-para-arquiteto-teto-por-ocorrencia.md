# Handoff: banco-de-dados para arquiteto, o saldo do teto conta cada ocorrência no mínimo zero

**De:** banco-de-dados
**Para:** arquiteto
**Data:** 2026-11-03 03:28 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/gamification-db`, a partir de `feat/phase-6-gamification` (`293bfe7`)

## O problema

A fórmula da seção 2 (`espaço = least(teto, greatest(0, teto − saldo do dia))`) limita **uma** conclusão, não o dia. No caso do próprio handoff (reabrir hoje 300 de ontem e concluir 21 difíceis), o saldo começa em −300 e cada conclusão cabe no espaço; ao fim, foram gravados **600** pontos de conclusões hoje. O pgTAP mostrou isso (a mutação M1, com a soma simples, dá 600).

## O que o banco faz

O saldo do dia soma, por ocorrência (o próprio evento quando `occurrence_id` é nulo), o saldo dela entre os eventos com teto gravados hoje, com piso zero:

`saldo = Σ max(0, saldo da ocorrência hoje)`, e `espaço = min(teto, max(0, teto − saldo))`.

- Reabrir algo concluído hoje libera o espaço dele (a ocorrência volta a zero), como a seção 2 quer.
- Reabrir algo de outro dia não libera nada hoje. Reconcluir esse mesmo item hoje não consome o teto de hoje, porque a ocorrência só volta ao zero; o saldo líquido por dia continua no teto.

## O que pedir

Atualizar o texto da seção 2 e o handoff `20261103-0235-arquiteto-para-banco-de-dados-gamificacao` (item 3) com a regra acima. O `capRoom` do core precisa da mesma regra (handoff `20261103-0328-banco-de-dados-para-gamificacao-f6-2-pronto`).
