# Handoff: arquiteto para qa-testes, metas de F8-6 no build e barreira de 14 (QA8-3)

**De:** arquiteto
**Para:** qa-testes
**Data:** 2026-11-03 08:15 (BRT)
**Branch:** `docs/phase-8-perf-decisions`

## Contexto

ADR-0012, seção 10, mudou: a meta 2 passa a 14 chamadas, e as metas 2 a 4 só valem medidas no build de produção, sem carga paralela. Os números de 08:04 (servidor de dev com a E2E completa) ficam como indicação.

## O que o destinatário precisa fazer

1. `playwright.config.ts`: uma variável de ambiente troca a `webServer` de `pnpm dev --port 8091` por `pnpm build:web` seguido de `expo serve` do `apps/app/dist` na porta 8091 (`@expo/cli` já instalado; `output: 'single'`). O padrão continua o dev. A config é da raiz: mande a mudança para o arquiteto revisar no PR.
2. Medir com a spec sozinha: só a pilha A, `--workers=1`, `--repeat-each=3`, sem E2E, `functions:test`, pilha B ou outro servidor de dev. Registrar no LOG máquina, commit, comando, as três medidas, a mediana e o pior.
3. Medir o mês do calendário (meta 3). Se faltar um marcador no componente, handoff ao `tarefas-calendario`.
4. Depois dos handoffs `20261103-0815-arquiteto-para-auth-grupos-stale-time-do-usuario` e `20261103-0815-arquiteto-para-gamificacao-estatisticas-pelo-cache`, `e2e/performance.spec.ts` barra também o total: `calls.length` no máximo 14. Até lá, só o N+1.
5. Meta 3 ou 4 não cumprida no build vira achado para o dono da tela (Hoje: `tarefas-calendario`; confete: `design-system`).
6. Lighthouse (meta 5) fica para depois de F8-8, na URL hospedada; no build local, só como indicação.

## Como testar

Pilha A; `pnpm exec playwright test e2e/performance.spec.ts --project=app --workers=1 --repeat-each=3` com a variável do build.
