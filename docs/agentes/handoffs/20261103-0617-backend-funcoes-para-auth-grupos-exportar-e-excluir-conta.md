# Handoff: backend-funcoes para auth-grupos

**De:** backend-funcoes
**Para:** auth-grupos
**Data:** 2026-11-03 06:17 (BRT, derivada de UTC menos 3)
**Branch:** `feat/account-functions` (de `feat/phase-8-polish`, `ed828f3`)

## Contexto

F8-3b do ADR-0012, seções 2 e 3: as Edge Functions `account-export` e `account-delete` existem. As telas Privacidade e Excluir conta são suas.

## O que foi entregue

- `account-export`: `POST` sem corpo, com o JWT do usuário (`supabase.functions.invoke('account-export')`). 200 com o arquivo em `accountExportSchema`; 429 `{ error: 'rate_limited', retryAfterSeconds }` (3 por dia); 500 `export_failed`; 401 `unauthorized` sem usuário.
- `account-delete`: `POST { dryRun: boolean }` (`accountDeleteRequestSchema`, nada a mais). `dryRun: true` devolve `accountDeletePreviewSchema`; `dryRun: false` devolve `{ deleted: true }`. Erros: 401 `reauth_required`, 409 `{ error: 'owns_groups', preview }`, 500 `delete_failed` (repetir é seguro), 400 `invalid_request`, 401 `unauthorized`.

## O que o destinatário precisa saber

1. **`reauth_required` vale para a prévia também.** A função confere o login da sessão (o maior `timestamp` de `amr` no JWT, no máximo `privacyDefaults.reauthMaxAgeMinutes`) antes de qualquer coisa, inclusive com `dryRun: true`. Assim a tela manda entrar de novo antes da prévia e da palavra de confirmação, e não depois. Renovar o token não renova o login: é preciso entrar de novo (senha ou link mágico) e voltar.
2. O nome do arquivo vai em `Content-Disposition`, mas o CORS não o expõe ao navegador. Monte no cliente: `azkaban-dados-AAAA-MM-DD.json`, com a data de São Paulo.
3. `owns_groups` pode vir também depois que as fotos já saíram (alguém entrou num grupo só seu entre os passos). A conta continua; mostre a prévia que veio no erro.
4. Depois de `{ deleted: true }`, o token não abre mais nada (401). `signOut({ scope: 'local' })`, descartar a fila offline e a chave local do push, como o ADR diz.

## Como testar

Com a pilha: `pnpm functions:test` (`account-export/export.integration.test.ts`, `account-delete/delete.integration.test.ts`).
