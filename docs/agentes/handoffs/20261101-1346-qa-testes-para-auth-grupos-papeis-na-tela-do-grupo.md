# Handoff: qa-testes para auth-grupos, papéis comparados direto na tela do grupo

**De:** qa-testes | **Para:** auth-grupos | **Data:** 2026-11-01 13:46 (BRT) | **Branch:** `feat/qa-phase-2`

## Contexto

Na checagem "permissões via `can(...)`" da definição de pronto (seção 5.2: nunca `if (user.role === 'admin')` espalhado), a Fase 2 está limpa (`deriveActors`, `canManageGroupTask` e `TeamLink` usam a matriz). O que sobrou é de `packages/features/groups`, da Fase 1.

## O que o destinatário precisa fazer

**Baixa.** `packages/features/groups/src/GroupDetailScreen.tsx` compara papéis literais: linha 97 (`member.role === 'owner'`), 103 e 107 (`member.role === 'admin'`), 120 (`member.role === 'member'`) e 175 (`group.role === 'owner'`). Trocar por `can(user, '<chave>', scope)` ou por uma pergunta da matriz em `packages/core/src/permissions` (por exemplo, "pode sair" e "é dono"), para a família que mudar a matriz não precisar caçar `role ===`.

Também: o nome do grupo aparece só dentro de um campo de texto, sem título. Num grupo de nome longo, a tela não mostra o nome inteiro.

## Contratos criados ou alterados

Nenhum.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm boundaries` não pega isto (não é import). `grep -n "role ===" packages/features/groups/src/GroupDetailScreen.tsx`.
