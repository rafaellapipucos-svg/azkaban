# Handoff: qa-testes para design-system, transição rodando com `prefers-reduced-motion: reduce`

**De:** qa-testes
**Para:** design-system
**Data:** 2026-11-03 11:15 (BRT)
**Branch:** `test/backlog-e2e` (a partir de `feat/backlog-after-phase-8`, `960c107`)

## Contexto

A falha intermitente de `e2e/a11y.spec.ts` ("running animations with reduce"), que o LOG de 09:20 não conseguiu reproduzir e por isso passou a dar nome ao que roda, voltou na E2E completa do BL-22 e de novo em 1 de 3 rodadas da spec sozinha. Agora com o nome:

- E2E completa: `signed out /transparency 375px dark: transition filter on , transition opacity on , transition transform on `
- Repetição: `signed out /transparency 375px light: ...` e `/profile 1280px dark: ...`, as mesmas três transições.

O alvo sai vazio: um elemento **sem `aria-label` e sem texto**. Aparece em telas diferentes, logado e deslogado, em larguras e esquemas diferentes, sempre as três propriedades juntas (o conjunto do `transition` padrão do Tailwind que muda: `opacity`, `transform`, `filter`). Isso aponta para um elemento global (layout, cabeçalho da pilha, barra de abas, aviso ao vivo, ou algo do servidor de dev do Expo), e não para uma tela. Nada em `packages/ui`, `packages/features/*` ou `apps/app` declara `transition` por leitura (grep), então a origem provável é de biblioteca ou do servidor de dev. Não há relação com o backlog: a mesma falha apareceu antes dele, em `/sign-up`.

## O que o destinatário precisa fazer

1. Descobrir o elemento. Sugestão: no `audit` de `e2e/a11y.spec.ts`, por um momento, trocar `short(target)` por `target.outerHTML.slice(0, 200)` (ou ler o trace com `retain-on-failure`) e rodar `pnpm exec playwright test e2e/a11y.spec.ts --project=app --no-deps --repeat-each=3`.
2. Separar dev de build: `E2E_BUILD=1 pnpm exec playwright test e2e/a11y.spec.ts --project=app --no-deps --repeat-each=3`. Se só o servidor de dev mostra, é fora do produto: registre e peça ao `qa-testes` um padrão em `known`, com este handoff.
3. Se for do app (ou de biblioteca que o app usa), zerar a transição com reduce (ADR de acessibilidade da Fase 8). Não mexer em `e2e/`.

## Como testar

Pilha A sozinha: `pnpm exec playwright test e2e/a11y.spec.ts --project=app --no-deps --repeat-each=3` (com `EXPO_PUBLIC_VAPID_PUBLIC_KEY` gerada em memória, como na E2E). As três passam com `0 problems`.
