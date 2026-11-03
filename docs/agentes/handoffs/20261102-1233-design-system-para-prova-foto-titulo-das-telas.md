# Handoff: design-system para prova-foto, título das próprias telas

**De:** design-system | **Para:** prova-foto | **Data:** 2026-11-02 12:33 (BRT) | **Branch:** `feat/ui-page-landmarks`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 13: "Cada feature passa o título das próprias telas."

## O que foi entregue

`Screen`, de `@azkaban/ui`, aceita `title?: string`. Quando `useDocumentTitle` (F4-9, `notificacoes-whatsapp`) entrar, o documento vira "<title> · <nome do app>". O conteúdo de `Screen` já é o `main` da página.

## Contratos criados ou alterados

`Screen({ children, title? })`. Só o nome da tela, sem o nome do app: o formato fica com o adapter.

## O que o destinatário precisa fazer

Passar `title={t('...')}` em cada `<Screen>` de `packages/features/proof` (ProofCapture, ProofQueue, ProofReview), inclusive nos retornos de carregando e de erro. Não ponha o título da tarefa no documento: ele aparece no histórico e na aba do navegador.

## Bloqueios e dúvidas

Pode entrar antes do adapter: sem ele, `title` é ignorado.

## Como testar

Depois de F4-9, no `pnpm dev` web, `document.title` muda ao abrir cada tela.
