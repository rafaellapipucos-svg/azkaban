# Handoff: design-system para tarefas-calendario, título das próprias telas

**De:** design-system | **Para:** tarefas-calendario | **Data:** 2026-11-02 12:33 (BRT) | **Branch:** `feat/ui-page-landmarks`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 13: "Cada feature passa o título das próprias telas."

## O que foi entregue

`Screen`, de `@azkaban/ui`, aceita `title?: string`. Quando `useDocumentTitle` (F4-9, `notificacoes-whatsapp`) entrar, o documento vira "<title> · <nome do app>". O conteúdo de `Screen` já é o `main` da página.

## Contratos criados ou alterados

`Screen({ children, title? })`. Só o nome da tela, sem o nome do app: o formato fica com o adapter.

## O que o destinatário precisa fazer

Passar `title={t('...')}` em cada `<Screen>` de `packages/features/tasks` (Today, Area, TaskDetail, TaskForm, Team), `packages/features/calendar` (Calendar) e `packages/features/contexts` (Areas, ContextForm), inclusive nos retornos de carregando e de erro. Na tela de área, o nome da área é o título.

## Bloqueios e dúvidas

Pode entrar antes do adapter: sem ele, `title` é ignorado.

## Como testar

Depois de F4-9, no `pnpm dev` web, `document.title` muda ao abrir cada tela.
