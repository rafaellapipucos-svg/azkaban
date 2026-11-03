# Handoff: arquiteto para design-system, componentes da gamificação

**De:** arquiteto
**Para:** design-system
**Data:** 2026-11-03 02:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/gamification-adr`, a partir de `feat/phase-5-whatsapp` (`cd98617`)

## Contexto

[ADR-0010](../../adr/0010-gamificacao-xp-ofensiva-conquistas-ranking.md), seção 8. A `gamificacao` monta as telas e decide quando comemorar; os componentes visuais são seus. O QUADRO não tem uma linha para isso; o orquestrador decide o ID.

## O que fazer

Em `packages/ui`, exportados pelo `index.ts`, todos em `/design-system`, claro e escuro, 375 px e desktop, textos por props (sem i18n próprio além do que o mascote já usa):

- **`Confetti`**: rajada curta com `react-native-reanimated` e `react-native-svg`, cores dos tokens, `onDone`. Com `useReducedMotion`, não desenha nada.
- **`Mascot` animado**: os quatro humores que já existem, com um movimento curto em `celebrating` (pulo) e `worried`; parado com reduzir movimento. Sem Lottie.
- **`CelebrationCard`**: mascote, título, linha de detalhe e um botão para fechar, para `occurrence_done`, `level_up`, `achievement` e `streak_milestone`. Anunciado ao leitor de tela.
- **`PerfectDayScreen`**: tela inteira de dia perfeito, com mascote comemorando e confete.
- **`XpBar`**: barra de progresso do nível, com rótulo e valor acessíveis.
- **`StreakBadge`**: ícone de fogo e número, com rótulo ("5 dias de ofensiva") e um estado para proteção.
- **`AchievementBadge`**: ícone, título, bloqueada ou concedida (não só pela cor).
- `ProgressRing` já existe; o anel de Hoje continua nele.

Durações e tamanhos nos tokens. Alvos de toque de 44 px.

## Paralelo e dependências

Depende só do ADR. Roda junto com F6-1 e F6-2.

## Bloqueios e dúvidas

Som e vibração são adapters de `packages/platform`, da `gamificacao`, não componentes.

## Como testar

`pnpm check`; `/design-system` no navegador, com e sem reduzir movimento.
