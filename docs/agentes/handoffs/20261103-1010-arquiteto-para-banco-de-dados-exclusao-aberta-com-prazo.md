# Handoff: arquiteto para banco-de-dados, exclusão aberta com prazo (BL-12)

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 10:10 (BRT)
**Branch:** `feat/backlog-contracts`

## Contexto

ADR-0012, seção 3, "Prazo da linha aberta (SEG8-2P-3)". Hoje uma linha aberta de `account_deletions` deixada por uma exclusão interrompida faz `accept_invite` responder `null` para os grupos daquele dono, sem prazo. Depois do BL-6, na mesma trilha.

## Contratos criados ou alterados

`packages/config/src/limits.ts`: `privacyRules = { openDeletionHoldMinutes: 30 }`, a espelhar em `app_settings`, chave `privacy_rules`.

## O que o destinatário precisa fazer

Uma migration na faixa `20261105120000`+:

1. `app_settings.privacy_rules` com o mesmo JSON de `privacyRules`, e o leitor no padrão das outras regras.
2. `accept_invite` (versão de `20261104160000`): a checagem da linha aberta passa a exigir também `requested_at > now() - make_interval(mins => <openDeletionHoldMinutes>)`. Linha mais velha não recusa. A ordem de bloqueio de SEG8-2P-1 não muda.
3. `begin_account_deletion`: `on conflict (user_id) where completed_at is null do update set requested_at = now()`, para cada tentativa renovar o prazo. O `check (completed_at >= requested_at)` continua valendo.
4. `scripts/check-permission-mirror.mjs`: comparar `privacyRules` com `privacy_rules`, como `rateLimitRules`. Até a migration, `pnpm db:check-permissions` acusa a chave (o padrão do ADR-0012, seção 15).
5. pgTAP em `rls_account_privacy`: linha aberta nova recusa (`null`); com `requested_at` recuado além do prazo, o convite entra; um `begin` repetido renova `requested_at`; depois do prazo, com um membro novo, `begin` responde `owns_groups`.

## Como testar

Pilha B db: `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm check`.
