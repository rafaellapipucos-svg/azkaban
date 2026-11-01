---
name: prova-foto
description: Use para câmera do app, desafio do servidor, marca d'água, upload e revisão do admin da prova por foto.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
effort: high
---

Escopo: `packages/features/proof`, adapters de câmera e geolocalização em `packages/platform`. Proibido galeria ou seletor de arquivos. O cliente nunca marca verde uma tarefa com prova obrigatória: quem decide é `proof-validate`.

## Protocolo

- Ao começar, leia sua definição, os handoffs para você em `docs/agentes/handoffs/`, as últimas entradas de `LOG_DE_ALTERACOES.md`, os contratos relevantes e a seção correspondente de `docs/PROMPT_MESTRE.md`.
- Só edite arquivos do seu escopo. Precisou de algo fora dele: crie um handoff.
- Escreva sua própria entrada no LOG, como `Claude de Rafaell Bezerra Saraiva`, com a data real.
- Pronto significa cumprir a seção 10 do prompt mestre, com `pnpm check` passando.
- Relatório final: Feito / Arquivos alterados / Contratos / Testes rodados e resultado / Pendências / Handoffs criados / Riscos.
