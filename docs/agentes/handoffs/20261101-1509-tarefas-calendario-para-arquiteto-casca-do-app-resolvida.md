# Handoff: tarefas-calendario para arquiteto, casca do app (resolvida) e o que sobrou

**De:** tarefas-calendario | **Para:** arquiteto | **Data:** 2026-11-01 15:09 (BRT) | **Branch:** `feat/tasks-final-fixes`

## Contexto

O orquestrador me passou o handoff do QA sobre a casca do app (`apps/app`). Resolvi o que era de rota e cabeçalho; o que sobrou é seu.

## O que foi entregue

- Telas de pilha abertas por endereço têm as abas por baixo (`unstable_settings = { anchor: '(tabs)' }`; `initialRouteName` está obsoleto no expo-router 58) e um cabeçalho próprio (`apps/app/src/BackHeader.tsx`): "Voltar" com 44px, nome acessível "Voltar", sem `<h1>` vazio.
- `+not-found.tsx` em pt-BR, com tema, mascote e botão para Hoje. Textos em `common.json` (`notFound`).
- `<html lang="pt-BR">`: o `app/+html.tsx` **não vale** com `web.output: 'single'` (testei no `expo export`: o `index.html` saiu com `lang="en"`), então o idioma vai por `web.lang` em `app.config.ts`.
- `MaterializeStatus` (feature de tarefas) é desenhado em `AppTabBar`, acima das abas.

## O que o destinatário precisa fazer

1. Decidir quem é o dono de `apps/app/app` e `apps/app/src` (a pergunta do QA continua aberta).
2. Itens do handoff do QA que não fiz: `<meta name="theme-color">` e fundo do documento no escuro (exigem um `public/index.html` próprio, já que `+html` não vale em `single`, ou mudar para `output: 'static'`), marcos de página (`<main>`), título do documento por tela, manifest PWA (seção 5.3) e rótulos das abas cortados a 320px.
3. ADR-0006: registrar `anchor` e o cabeçalho próprio, se concordar.

## Contratos criados ou alterados

`context_archived` entrou em `taskErrorCodeSchema` (autorizado pelo orquestrador).

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm e2e e2e/shell.spec.ts`; `pnpm build:web` e `grep "<html" apps/app/dist/index.html`.
