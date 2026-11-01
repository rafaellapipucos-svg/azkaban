# Handoff: qa-testes para design-system, chips que estouram a tela, teclado e contraste

**De:** qa-testes | **Para:** design-system | **Data:** 2026-11-01 13:46 (BRT) | **Branch:** `feat/qa-phase-2`

## Contexto

Auditoria de acessibilidade e de layout da Fase 2 em 375px, com axe-core 4.10.2 (rodado fora do repositório) e teclado real no Chromium. Em ordem de gravidade.

## O que o destinatário precisa fazer

1. **Média. Nome longo de grupo ou de contexto estoura a largura.** `Chip` não quebra linha nem corta o texto. Medido: um grupo chamado "Associação dos moradores do condomínio Residencial Jardim das Acácias Fase 2" vira um chip de 643px numa coluna de 343px, cortado na borda direita, no formulário de contexto, no formulário de tarefa ("Onde") e nos filtros do Calendário (contexto com 50 caracteres). Parte do nome fica ilegível e o toque rola a tela para o lado. Sugestão: `maxWidth: 100%` com `numberOfLines={2}` (ou reticências e o nome completo no `aria-label`) no `Chip`.
2. **Média. A tecla Espaço não aciona `checkbox` nem `switch`.** Medido com o foco real (Tab até o item): em `TaskCheck` (`role="checkbox"`), `SwitchRow` (`switch`) e `Chip` múltiplo (`checkbox`), Enter alterna e Espaço não. O padrão ARIA e o WCAG 2.1.1 pedem Espaço. Em RN-web, `Pressable` só trata Espaço como ativação para `button`. Sugestão: tratar `keydown` de Espaço nesses componentes (na web, dentro de `packages/platform` se for API de navegador).
3. **Baixa. Contraste do texto de exemplo no tema claro:** `placeholderTextColor={tokens.colors.muted}` não pegou na web; o computado é `#9ca3af` sobre `#ffffff`, 2,53:1 (axe `color-contrast`, serious) em "Ex.: faltou material" (`StatusActions`). `FormTextField` usa o mesmo mecanismo, então qualquer placeholder cai igual. O escuro tem zero violações de contraste.
4. **Baixa. Modal da criação rápida:** o `View aria-modal` que o `Modal` do RN-web gera não tem nome (axe `aria-dialog-name`, serious); o fundo clicável tem `aria-label` sem `role` (`aria-prohibited-attr`). Ao fechar com Esc, o foco vai para o `body` e não volta para "Nova tarefa".
5. **Baixa. Todos os títulos são nível 1** (`Title`, `Subtitle` e `Section` não definem `aria-level`): "Hoje", "Para hoje" e "Casa" aparecem como `heading [level=1]`. Dar níveis 1, 2 e 3.
6. **Baixa. Barra de abas apertada:** em 375px "Doméstico" (71 de 75px) e "Calendário" quase se tocam; em 320px os rótulos são cortados. Com fonte maior do sistema o corte aparece também em 375px.

## Contratos criados ou alterados

Nenhum.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm dev`; crie um grupo com o nome acima, depois `/contexts/new` e escolha o grupo; ou `/tasks/new` com um contexto de nome longo. Para o teclado: Tab até uma tarefa em Hoje e aperte Espaço.
