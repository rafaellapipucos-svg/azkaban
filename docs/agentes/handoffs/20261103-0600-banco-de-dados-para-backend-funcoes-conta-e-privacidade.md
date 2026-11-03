# Handoff: banco-de-dados para backend-funcoes (cópia para auth-grupos)

**De:** banco-de-dados
**Para:** backend-funcoes; auth-grupos para ciência
**Data:** 2026-11-03 06:00 (BRT, derivada de UTC menos 3)
**Branch:** `feat/account-privacy-db` (de `feat/phase-8-polish`, `8dc831c`)

## Contexto

F8-3 do banco, ADR-0012, seções 2, 3 e 6. Migrations `20261104120000` a `20261104120500`. As Edge Functions `account-export` e `account-delete`, o Storage e `auth.admin.deleteUser` são seus. Erros das funções SQL levam o código na mensagem, como nas outras RPCs.

## Contratos SQL (todas só `service_role`; `authenticated` e `anon` levam `42501`)

**`public.export_user_data(p_user uuid) returns jsonb`** devolve `{ "sections": {...}, "photoPaths": { "<proof id>": "<storage_path>" } }`.

- `sections` tem as 25 chaves de `accountExportSections`, cada uma uma lista de linhas, já sem o que o ADR tira (`code` dos convites, `code_hash`, `endpoint`/`p256dh`/`auth` do push, que vira `endpoint_host`, e tudo de `auth.users` fora de `id`, `email`, `created_at`, `email_confirmed_at`, `last_sign_in_at`).
- Toda linha de `proofs` vem sem `storage_path` e com `photo_url: null`. Para cada id em `photoPaths`, assine o caminho (bucket `task-proofs`, `privacyDefaults.exportPhotoUrlTtlSeconds`) e grave em `photo_url` da linha com esse `id`. Foto já apagada pela retenção não está em `photoPaths` e fica `null`. **O caminho nunca vai para o arquivo.**
- O envelope (`format`, `version`, `generatedAt`, `userId`, `photoUrlsExpireAt`) é seu; `photoUrlsExpireAt` é `null` se `photoPaths` vier vazio.
- Conta inexistente: `account_not_found` (`P0002`).

**Ordem de `account-export`:** `consume_rate_limit(user, 'data_export')` (`PT429` vira 429 `rate_limited`, `retryAfterSeconds` do `hint`), `export_user_data(user)`, assinar em lote, responder (`attachment`, `no-store`).

**Exclusão, na ordem do ADR, seção 3:**

1. `public.account_deletion_preview(p_user uuid) returns jsonb`: exatamente `accountDeletePreviewSchema` (`blockingGroups` com `id`, `name`, `memberCount`; `soloGroups` com `id`, `name`). É a resposta de `{ dryRun: true }`.
2. `public.begin_account_deletion(p_user uuid) returns jsonb`: `{ "deletionId": uuid, "preview": {...}, "storagePaths": [text] }`. Recusa com `owns_groups` (`P0001`) e a prévia em JSON no `details` do erro (supabase-js: `error.details`): responda 409 com `preview: JSON.parse(error.details)`. Reaproveita a linha aberta de `account_deletions` numa repetição. `storagePaths` são as fotos de todas as provas cujas linhas vão sumir: as do titular, as das ocorrências que a cascata leva e as dos grupos só dele.
3. Remova `storagePaths` do bucket `task-proofs` em lotes; objeto inexistente não é erro. Some quantos a API disse que removeu.
4. `public.finish_account_deletion(p_user uuid, p_objects_deleted int) returns jsonb`: `{ "groupsDeleted": n, "proofsDeleted": n }`. Confere o bloqueio de novo (`owns_groups`, como no passo 2: alguém pode ter entrado num grupo só dele), apaga as provas com `user_id` do titular e os grupos só dele. As contagens somam, então repetir não apaga o que já foi anotado. Sem `begin` antes: `deletion_not_started`. `p_objects_deleted` negativo ou nulo: `invalid_argument`.
5. `auth.admin.deleteUser(user)`: a cascata leva o resto, e o pgTAP prova que ela corre sem erro por todos os gatilhos das Fases 1 a 8.
6. `public.complete_account_deletion(p_user uuid, p_retention_days int) returns jsonb`, com `privacyDefaults.deletionLogRetentionDays`: marca `completed_at`, poda `account_deletions` mais velhas que o prazo e apaga as linhas de `auth.audit_log_entries` do titular (`payload.actor_id` ou `payload.traits.user_id`, que o GoTrue grava com o e-mail e o IP). Devolve `{ "auditEntriesDeleted": n }`, ou `null` se o dono da função não puder apagar em `auth` (no hospedado, a conferir; aí a política diz que ficam). Antes de `deleteUser`: `account_still_exists`. Prazo menor que 1: `invalid_argument`. Repetir é inofensivo.

`account_not_found` (`P0002`) em `begin` e `finish` quer dizer que o perfil já sumiu: a conta foi excluída antes. Com a conta do Auth ainda viva isso não acontece (o perfil cai em cascata com ela).

## Prova por foto

- `claim_proof_challenge` agora recusa com `proof_consent_required` (`P0001`) quem revogou o aceite depois de pedir o nonce, antes de marcá-lo usado. `proof-validate` já mapeia esse código para 403; vale um teste de função.
- `public.revoke_proof_consent() returns void`, `authenticated`: marca o aceite vivo e zera `profiles.proof_consent_version` e `proof_consent_at`. Repetir não faz nada. Aceitar de novo (`record_proof_consent`) grava linha nova. `proof_consents` ganhou `id` (chave) e `revoked_at`. Isso é do `auth-grupos` (tela Privacidade).

## O que o destinatário precisa fazer

- **backend-funcoes:** `account-export` e `account-delete` nessa ordem, com testes de exclusão repetida e de falha entre os passos; conferir no GoTrue local o formato de `auth.audit_log_entries` depois de `deleteUser` (o pgTAP usou o formato do código do GoTrue, não um registro real) e o `amr`.
- **auth-grupos:** `revoke_proof_consent` na tela Privacidade; `proof_consents` lida pela chave nova, se alguém ler.

## Como testar

Pilha B: `pnpm exec supabase db reset`, `pnpm db:test` (`supabase/tests/rls_account_privacy.test.sql`).
