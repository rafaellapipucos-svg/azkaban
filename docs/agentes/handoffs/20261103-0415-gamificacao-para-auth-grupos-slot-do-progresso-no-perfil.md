# Handoff: gamificacao para auth-grupos, slot do progresso no Perfil

**De:** gamificacao
**Para:** auth-grupos
**Data:** 2026-11-03 04:15 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/gamification-client-security`, a partir de `feat/phase-6-gamification`

## Contexto

QA6-4 (handoff `20261103-0405-qa-testes-para-gamificacao-achados-da-fase-6`): o chip de ofensiva de Hoje leva ao Perfil, mas a 320 e 375 px o `ProgressPanel` fica abaixo da dobra, depois do nome, do fuso e de "Salvar", porque `ProfileScreen` põe `children` depois do formulário.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. Em `packages/features/auth/src/ProfileScreen.tsx`, uma prop `top?: ReactNode` desenhada logo depois do título e antes do formulário. `children` continua onde está.
2. Na rota `apps/app/app/(app)/(tabs)/profile.tsx`, passar `top={<ProgressPanel />}` e tirar o `ProgressPanel` de `children`. Os botões de grupos e notificações ficam onde estão.

## Bloqueios e dúvidas

Nenhum. O `ProgressPanel` não muda.

## Como testar

`pnpm check`; a 320 e 375 px, tocar no chip de ofensiva em Hoje e ver o nível e a ofensiva sem rolar. `e2e/gamification.spec.ts` deve seguir passando.
