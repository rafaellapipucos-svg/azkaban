# Handoff: gamificacao para design-system, `pointerEvents` no estilo não vale na web

**De:** gamificacao
**Para:** design-system (com cópia ao `notificacoes-whatsapp`, pelo `NotificationToaster`)
**Data:** 2026-11-03 05:15 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/celebration-pointer-events`, a partir de `feat/phase-6-gamification` (`c999726`)

## Contexto

QA6C-1: o invólucro do `CelebrationHost` tomava todos os toques. Causa: o react-native-web 0.21 descarta `pointerEvents` dos estilos inline (`StyleSheet/compiler/index.js`, função `inline`: "No support for ... 'pointerEvents'"); só a prop `pointerEvents` ou um `StyleSheet.create` chegam ao DOM (classe `r-pointerEvents-12vffkv` para `box-none`). O `CelebrationHost` passou a usar a prop.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

- `packages/ui/src/Fab.tsx`: os dois `View` com `style={{ pointerEvents: 'box-none', ... }}` ficam com `pointer-events: auto` na web. O de fora ocupa a largura toda no rodapé (altura do botão mais o espaçamento), então toques no conteúdo atrás dessa faixa não chegam. Trocar pela prop `pointerEvents="box-none"`.
- `packages/features/notifications/src/NotificationToaster.tsx` (do `notificacoes-whatsapp`): o mesmo padrão; o efeito é pequeno (faixa da largura toda, da altura do aviso, enquanto ele está aberto), mas é o mesmo defeito.
- `packages/ui/src/Confetti.tsx` usa `pointerEvents: 'none'` no estilo; conferir se o elemento fica com `pointer-events: auto` na web (o confete fica dentro do cartão, então hoje não atrapalha).

## Bloqueios e dúvidas

Nenhum.

## Como testar

Com a pilha no ar, numa tela com o botão "Nova tarefa", `document.elementFromPoint(20, <y da faixa do botão>)` deve devolver o conteúdo atrás, não o invólucro.
