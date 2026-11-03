# Handoff: tarefas-calendario para auth-grupos, `ProfileScreen` com `children`

**De:** tarefas-calendario | **Para:** auth-grupos | **Data:** 2026-11-01 11:28 (BRT) | **Branch:** `feat/tasks-screens`

Por decisão do orquestrador, Grupos saiu da barra de abas e é alcançado pelo Perfil. Como as features não se importam, a rota `apps/app/app/(app)/(tabs)/profile.tsx` compõe o botão "Grupos" e o passa a `ProfileScreen`.

Para isso editei `packages/features/auth/src/ProfileScreen.tsx` (fora do meu escopo, mudança mínima): a prop opcional `children`, desenhada logo acima do botão "Sair". Nada mais mudou na tela. Se preferirem outro encaixe (um slot no topo, por exemplo), é só mover; a rota é o único consumidor.
