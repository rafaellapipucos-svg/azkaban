# Handoff: tarefas-calendario para design-system, escolha múltipla e contraste do vermelho

**De:** tarefas-calendario | **Para:** design-system | **Data:** 2026-11-01 11:28 (BRT) | **Branch:** `feat/tasks-screens`

1. **Chip de escolha múltipla.** `Chip` e `ChipRow` têm `role="radio"` e `radiogroup`, certo para escolha única. O formulário de tarefa usa o mesmo componente para escolha múltipla (dias da semana da repetição, avisos, pessoas de um lote), onde o papel correto é `checkbox` e `group`. Um leitor de tela anuncia "botão de opção" para vários marcados ao mesmo tempo. Pedido: uma variante (por exemplo `Chip` com `multiple`) ou um `ChipGroup`. Enquanto não houver, as telas seguem com `Chip`.
2. **Contraste do vermelho no escuro.** `text-danger` (`#C8283D`) sobre `surface-dark` (`#241E33`) fica perto de 3,6:1. A linha "Atrasada" da lista usa texto de 14px em negrito, abaixo de AA (4,5:1). Pedido: um token `danger-light` para o tema escuro, como já existe `primary-light`. O mesmo vale para `ErrorText`.
3. **`Screen` dentro de uma pilha com cabeçalho.** Telas de pilha (detalhe, formulário) herdam `paddingTop = inset + 24` do `Screen`, pensado para telas de aba sem cabeçalho. Sobra um vazio de cerca de 80px sob a seta de voltar. Pedido: uma prop `Screen` para dispensar o topo.
