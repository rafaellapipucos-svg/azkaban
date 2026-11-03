# Handoff: arquiteto para backend-funcoes, Fase 8

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seções 2 e 3: exportar e excluir a conta rodam em duas Edge Functions novas.

## O que foi entregue

Contrato `packages/contracts/src/privacy.ts` e `privacyDefaults`, `rateLimitRules` em `packages/config/src/limits.ts`.

## Contratos criados ou alterados

`accountExportSchema`, `accountDeleteRequestSchema`, `accountDeletePreviewSchema`, `accountDeleteResultSchema`, `privacyErrorSchema`.

## O que o destinatário precisa fazer

1. **`account-export`** (seção 2): `verify_jwt = true`, usuário pelo Auth como `proof-url`; `consume_rate_limit(user, 'data_export')` (429 com `retryAfterSeconds` do `hint`); `export_user_data`; URLs assinadas em lote para as provas com foto, com `privacyDefaults.exportPhotoUrlTtlSeconds`; resposta que passa em `accountExportSchema`, com `Content-Disposition: attachment` e `Cache-Control: no-store`. Log sem ids, e-mail nem conteúdo.
2. **`account-delete`** (seção 3): `verify_jwt = true`; login recente por `amr` (conferir no GoTrue local que traz `timestamp` e que o refresh não o muda; senão, `auth.sessions.created_at` do `session_id`), 401 `reauth_required`; `dryRun` devolve a prévia; 409 `owns_groups` com a prévia; os passos 6.1 a 6.6 na ordem; Storage em lotes, objeto inexistente não é erro; 500 `delete_failed` e repetição segura.
3. Testes de função: exportar de ex-membro traz a prova dele; exportar não traz `code`, `code_hash`, chaves de push nem dados de outro membro; JWT de A não alcança B; exclusão repetida depois de uma falha no meio termina; depois da exclusão, 0 linhas com o `user_id` e 0 objetos dele no bucket, e as ocorrências de terceiros intactas (o "como testar" do handoff de 2026-11-01 23:39).
4. `supabase/config.toml` (`verify_jwt`) e `docs/implantacao.md` (deploy das duas funções). Os valores de Auth de produção já estão lá.

## Bloqueios e dúvidas

As funções SQL são do `banco-de-dados`; até a migration, use dublês. A ordem da seção 3 não muda sem passar por mim.

## Como testar

`pnpm functions:test` com a pilha; `pnpm check`.
