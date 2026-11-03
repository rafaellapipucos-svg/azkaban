# Handoff: arquiteto para banco-de-dados, Fase 8

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md): LGPD (F8-3), limites de uso (F8-4), fila offline (F8-5) e backlog. Você tem a maior parte do servidor. A Fase 6 conta como integrada.

## O que foi entregue

ADR-0012, contratos e config (seção 15).

## Contratos criados ou alterados

- `packages/config/src/limits.ts`: `rateLimitRules`, com espelho em `app_settings.rate_limit_rules`. `pnpm db:check-permissions` precisa passar a comparar a chave (`scripts/check-permission-mirror.mjs`).
- `packages/contracts/src/shopping.ts`: `requestId` opcional no stepper.
- `packages/contracts/src/privacy.ts`: seções da exportação, na ordem de `accountExportSections`.

## O que o destinatário precisa fazer

0. **Antes de tudo, na integração das Fases 6 e 7 (seção 14):** as duas usam os mesmos prefixos (`20261103170000` a `20261103180300`). Renomeie as da Fase 7 para depois de `20261103180600`, na mesma ordem, sem mudar o conteúdo. `db reset` e `db:test` provam. Nada disso foi para `main` nem para o projeto hospedado.
1. **Faixas de versão desta fase** (seção 14): F8-4 `20261104100000`+, F8-5 `20261104110000`+, F8-3 `20261104120000`+, backlog `20261104130000`+.
2. **F8-4 (seção 4):** espelho; `rate_limit_counters`; `consume_rate_limit(p_user, p_action)` só para `service_role`, com `PT429` e o `hint` em segundos; usos em `tasks` (trigger `before insert`), `set_occurrence_status`, `create_shopping_list`, `group_invites` (trigger `before insert`) e `get_invite_preview`; `p_user` nulo não conta; limpeza no cron diário. pgTAP: o limite + 1 recusa, a janela seguinte libera, o cliente não executa a função, o service role não conta.
3. **F8-5 (seção 5):** `processed_requests` e `p_request_id uuid default null` em `adjust_shopping_item_quantity` e `add_catalog_item_to_list`; repetição devolve a linha atual sem somar. Limpeza no mesmo cron.
4. **F8-3 (seções 2, 3 e 6):** `export_user_data(p_user) returns jsonb` com as seções e colunas da tabela da seção 2; `account_deletion_preview`, `begin_account_deletion` e `finish_account_deletion` (nomes livres, todas só `service_role`); `account_deletions`; `proof_consents` com `id`, `revoked_at` e o `unique` parcial; `revoke_proof_consent()`; `record_proof_consent` gravando linha nova depois de uma revogação; `claim_proof_challenge` conferindo o aceite; `revoke_invites_on_removal` pulando quando o perfil de `old.user_id` já não existe.
5. **O pgTAP da exclusão (seção 3), primeiro:** apagar de `auth.users` um usuário com linhas em todas as tabelas, com ocorrências que disparam os triggers de status, XP e dia (inclusive da Fase 6) e itens de compras sob os guardas, termina sem erro; prova superada em ocorrência alheia sobra só até `finish_account_deletion`; os convites dos grupos dele continuam ativos. Confira também se `auth.audit_log_entries` guarda e-mail ou IP e se `service_role` apaga as linhas dele; registre o resultado.
6. **Backlog (seção 13):** `issue_proof_challenge` contando usados nas 24 horas mais emitidos vivos e não usados; depois de eu mudar `gamificationRules.closeJob.batchSize` para 64 na base integrada, o espelho.
7. Tipos (`pnpm db:types`).

## Bloqueios e dúvidas

A base legal (seção 17, item 2) pode mudar a revogação depois. O desenho atual é reversível.

## Como testar

Pilha B: `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`.
