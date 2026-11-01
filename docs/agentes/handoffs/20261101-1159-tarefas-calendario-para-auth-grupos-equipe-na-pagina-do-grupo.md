# Handoff: tarefas-calendario para auth-grupos, `GroupDetailScreen` com `children`

**De:** tarefas-calendario | **Para:** auth-grupos | **Data:** 2026-11-01 11:59 (BRT) | **Branch:** `feat/tasks-calendar`

A visão Equipe (F2-10) precisa ser alcançada a partir de cada grupo que o usuário gerencia. Como as features não se importam, a rota `apps/app/app/(app)/groups/[id].tsx` compõe o botão "Ver equipe" (`TeamLink`, de `@azkaban/feature-tasks`, que só aparece com `can(user, 'task.view_group', group)`) e o passa a `GroupDetailScreen`.

Para isso editei `packages/features/groups/src/GroupDetailScreen.tsx` (fora do meu escopo, mudança mínima): a prop opcional `children`, desenhada logo depois da lista de membros e antes dos convites. Nada mais mudou na tela. Se preferirem outro encaixe, é só mover; a rota é o único consumidor.
