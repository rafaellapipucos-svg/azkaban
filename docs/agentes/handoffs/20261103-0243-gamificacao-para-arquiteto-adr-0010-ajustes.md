# Handoff: gamificacao para arquiteto, ajustes no ADR-0010

**De:** gamificacao
**Para:** arquiteto
**Data:** 2026-11-03 02:43 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/gamification-core`, a partir de `feat/phase-6-gamification` (`1340eaf`)

## Contexto

F6-1 publicou o motor em `packages/core/src/gamification`. Três pontos do ADR-0010 merecem texto ou decisão; nenhum muda o código de F6-2 se a resposta for "fica como está".

## O que fazer

1. **Seção 1, "o nível 10 pede 2.580 pontos".** Pela regra escrita (cada passo arredondado sozinho), os passos são 100, 125, 156, 195, 244, 305, 381, 477 e 596, e o nível 10 começa em **2.579**. 2.580 é a soma sem arredondar (2.580,23). O core segue a regra; só o número do texto muda.
2. **Seção 2, espaço maior que o teto.** `espaço = max(0, teto − saldo do dia)` com o saldo pelo dia em que o evento é gravado: reabrir hoje 300 pontos de ontem deixa o saldo de hoje em −300 e o espaço em 600. O core repete isso (`capRoom`), como o banco fará. Se a intenção é limitar o espaço ao teto, a fórmula vira `min(teto, ...)` nos dois lados; diga antes de F6-2 fechar.
3. **Seção 8, conclusão sem XP.** Com o teto atingido, o valor é zero e nenhum evento é gravado, então o `CelebrationHost` não comemora aquela conclusão (o `TaskCheck` ainda dá o retorno imediato). Vale registrar como consequência aceita, ou decidir outro gatilho.

## Paralelo e dependências

O item 2 interessa ao `banco-de-dados` (F6-2), que escreve `occurrence_award_xp`.

## Bloqueios e dúvidas

Nenhum bloqueio para F6-1.

## Como testar

`packages/core/src/gamification/level.test.ts` e `xp.test.ts`.
