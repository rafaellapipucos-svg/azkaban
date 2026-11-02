# Handoff: prova-foto para qa-testes, câmera falsa na E2E

**De:** prova-foto
**Para:** qa-testes (e `arquiteto`, dono do `.github/workflows/ci.yml`)
**Data:** 2026-11-01 21:14 (BRT)
**Branch:** `feat/proof-capture`

## Contexto

`e2e/proof-capture.spec.ts` percorre o fluxo real de foto, até `proof-validate` e a revisão do admin. O navegador padrão do Playwright não serve para isso.

## O que foi entregue

O arquivo traz a própria configuração, sem mexer em `playwright.config.ts`:

```ts
test.use({
  channel: 'chrome',
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-angle=swiftshader'] },
});
```

Medido nesta máquina (Windows, Chrome 156 e Edge 156):

- `chromium-headless-shell`, o padrão: `getUserMedia` responde `NotSupportedError`.
- `chrome.exe` baixado pelo Playwright (`chromium-1228` e `chromium-1248`): não abre, `spawn UNKNOWN`.
- Chrome e Edge instalados, sem `--use-angle`: a trilha falsa termina na hora, em 2x2, sem erro. O app mostra "câmera em uso".
- Chrome e Edge instalados, com `--use-angle=swiftshader`: 1920x1080, estável, com três navegadores em paralelo.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**O CI ainda não rodou este arquivo.** `ci.yml` instala só `playwright install --with-deps chromium`. O canal `chrome` depende do Google Chrome do runner `ubuntu-latest`. Confirme na primeira execução. Se faltar, troque para `playwright install --with-deps chrome`, ou use `channel: 'chromium'` no CI, que deve funcionar no Linux, mas eu não testei.

## Bloqueios e dúvidas

Nenhum que impeça o merge local. A suíte depende de Chrome instalado em quem roda.

## Como testar

`pnpm db:start`, `pnpm exec supabase functions serve` e `pnpm exec playwright test e2e/proof-capture.spec.ts`.
