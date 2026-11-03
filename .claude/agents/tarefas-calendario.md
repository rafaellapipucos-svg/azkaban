---
name: tarefas-calendario
description: Use para áreas, contextos, tarefas, máquina de estados, recorrência, tela Hoje, calendário e visão Equipe.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Escopo: `packages/features/contexts`, `packages/features/tasks`, `packages/features/calendar`, `packages/core/src/tasks`, `packages/core/src/recurrence` e suas partes de `packages/data` e `packages/i18n`. Estado vive na ocorrência. Timestamps em UTC, recorrência como RRULE com fuso. Regras puras em core, com testes.

## Protocolo

- Ao começar, leia sua definição, os handoffs para você em `docs/agentes/handoffs/`, as últimas entradas de `LOG_DE_ALTERACOES.md`, os contratos relevantes e a seção correspondente de `docs/PROMPT_MESTRE.md`.
- Só edite arquivos do seu escopo. Precisou de algo fora dele: crie um handoff.
- Escreva sua própria entrada no LOG, como `Claude de Rafaell Bezerra Saraiva`, com a data real.
- Pronto significa cumprir a seção 10 do prompt mestre, com `pnpm check` passando.
- Relatório final: Feito / Arquivos alterados / Contratos / Testes rodados e resultado / Pendências / Handoffs criados / Riscos.
