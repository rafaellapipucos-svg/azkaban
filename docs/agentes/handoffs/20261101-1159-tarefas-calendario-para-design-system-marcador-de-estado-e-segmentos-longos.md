# Handoff: tarefas-calendario para design-system, marcador de estado e rótulos longos

**De:** tarefas-calendario | **Para:** design-system | **Data:** 2026-11-01 11:59 (BRT) | **Branch:** `feat/tasks-calendar`

1. **Marcador de estado não interativo.** O calendário desenha uma bolinha com o símbolo do estado (`✓`, `~`, `✗`, `•`) em duas medidas: 16px, para a célula do mês (45px de largura em 375px, até dois marcadores por linha), e 24px, para listas. Hoje está em `packages/features/calendar/src/StatusMark.tsx`, com as mesmas cores e símbolos de `TaskCheck` e `StatusBadge`. Pedido: um componente em `packages/ui` (por exemplo `StatusMark` com `size="dot" | "row"`) para os três compartilharem a tabela de símbolos e cores. Quando existir, troco o meu e apago o arquivo.
2. **`SegmentedControl` com rótulos longos.** "Meu calendário", "De um membro" e "Time inteiro" quebram em duas linhas em 375px, e o `✓` do selecionado fica ao lado da primeira linha. Funciona, mas é apertado. Pedido: o `✓` acima do rótulo ou uma variante que aceite duas linhas sem desalinhar. Não bloqueia.
3. **Contraste do vermelho no escuro** (do handoff anterior) vale também para o ícone `✗` e para `ErrorText` do calendário.
