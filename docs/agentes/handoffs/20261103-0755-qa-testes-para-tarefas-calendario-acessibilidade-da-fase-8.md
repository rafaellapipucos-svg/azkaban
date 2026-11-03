# Handoff: qa-testes para tarefas-calendario, acessibilidade da Fase 8

**De:** qa-testes
**Para:** tarefas-calendario
**Data:** 2026-11-03 07:55 (BRT)
**Branch:** `chore/qa-phase-8`

## Contexto

ADR-0012, seção 9 (F8-1). `e2e/a11y.spec.ts` percorre 31 telas a 320, 375 e 1280 px, claro e escuro, com reduzir movimento, mais zoom de 200% e teclado. Os achados abaixo estão na lista `known` da spec: tire a linha quando corrigir.

## Achados

- **QA8-5 (baixa):** no mês do calendário a 320 px, cada dia tem 38 x 68 px. A largura fica abaixo dos 44 px da regra do projeto (o WCAG 2.2 AA pede 24 px, então a tela passa no WCAG). Sete colunas não cabem em 320 px com 44 px cada mais o respiro. Saídas possíveis: tirar o respiro lateral da grade ou aceitar a exceção no ADR.
- **QA8-6, parte do calendário (média):** com zoom de 200% a 375 px (188 px CSS), os nomes dos dias da semana ("dom.", "seg." e os outros) saem cortados da caixa. Saídas possíveis: uma letra só ("D", "S"), ou deixar quebrar.
- **QA8-7, parte das telas (baixa):** Hoje tem dois títulos de nível 1. Áreas e contextos (`/contexts`) não tem nenhum. Deve haver um título de nível 1 por tela.

## Como testar

Pilha A, `pnpm exec playwright test e2e/a11y.spec.ts --project=app`.
