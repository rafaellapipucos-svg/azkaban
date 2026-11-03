# Handoff: arquiteto para banco-de-dados, WhatsApp da Fase 5

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 00:30 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/whatsapp-adr`, a partir de `feat/phase-4-notifications` (`e54968d`)

## Contexto

F5-1 decidiu o WhatsApp no [ADR-0009](../../adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md). O banco é o primeiro elo: as telas e a integração das funções dependem das suas migrations. Responde também ao handoff `20261102-1451` (prazo do vermelho no push): opção (a).

## O que foi entregue

- ADR-0009 e a remissão no ADR-0008, seção 11.
- `packages/config/src/whatsapp.ts`: `whatsappRules` (espelho, chave `whatsapp_rules`) e `whatsappDefaults` (sem espelho).
- `packages/config/src/notifications.ts`: `activeChannels` com `whatsapp`, `whatsappTypes: ['daily_summary']` e `defaultChannels.daily_summary = { web_push: false, whatsapp: true }`. Muda o espelho `notification_rules`.
- `packages/contracts/src/whatsapp.ts` (seção 13 do ADR).

## O que fazer

Uma migration por mudança, com pgTAP. Seções do ADR entre parênteses.

1. **Espelhos:** `app_settings.whatsapp_rules` = `whatsappRules`; `notification_rules` com os três campos acima. Acrescente o bloco de `whatsapp_rules` em `scripts/check-permission-mirror.mjs`, como o de `proof_rules` (o arquivo de config não tem import).
2. **`profiles`** (4 e 5): `phone_e164` (`check` `^\+[1-9][0-9]{7,14}$`), `phone_verified_at`, `whatsapp_opt_in_at`, `whatsapp_opt_in_version`, `whatsapp_opt_out_at`, `whatsapp_opt_out_source` (`app`/`webhook`), com os `check`s de par; `daily_summary_enabled`, `daily_summary_time`, `daily_summary_include_overdue`, `daily_summary_deadline_days` (0 a 30), `daily_summary_skip_empty`, com os padrões de `whatsappRules.dailySummary`; `daily_summary_last_date`. `grant update` só nas cinco `daily_summary_*` editáveis. Confira que `group_member_profiles()` continua sem telefone.
3. **Verificação** (3): `phone_verifications`, sem `grant`; `start_phone_verification(p_user_id, p_phone)` só `service_role`, devolvendo jsonb (sucesso com o código, ou `phone_rate_limited` com `retryAfterSeconds`); `confirm_phone_verification(p_code)` `authenticated`, devolvendo `phoneVerificationConfirmResultSchema`. **Não levante exceção no código errado**: ela desfaz o `attempts + 1`. Teste que a sexta tentativa falha mesmo com o código certo. `remove_phone()`. Hash: `encode(extensions.digest(id::text || ':' || code, 'sha256'), 'hex')`.
4. **Opt-in e opt-out** (4): `whatsapp_opt_in(p_consent_version)` (levanta `phone_not_verified` e `invalid_consent_version`), `whatsapp_opt_out()`, e uma função interna "perfil pronto", usada pela gravação, pelo job e pelo claim.
5. **Mensagens** (7 e 8): `whatsapp_messages` e `whatsapp_console_messages`, RLS ligada e sem `grant` a `anon` nem `authenticated`; `record_whatsapp_statuses(p_events jsonb)` com o status que só avança (`failed` vale sobre qualquer um); `whatsapp_stop_by_wa_id(p_wa_id)` pelos dígitos do telefone **ou** por `recipient_wa_id`, devolvendo quantos perfis mudaram.
6. **Gravação** (2): `enqueue_notification` cria a linha `whatsapp` só com o tipo em `whatsappTypes`, a preferência ligada e o perfil pronto. Aceita `daily_summary` sem ocorrência e sem grupo, e grava a linha do sino já lida.
7. **Job** (5): `enqueue_daily_summaries()`, pg_cron a cada minuto, como descrito; teste com o relógio do perfil em fusos diferentes, a janela de `catchUpMinutes`, o dia vazio com e sem `skip_empty`, e que rodar duas vezes não duplica.
8. **Claim e report** (2 e 9):
   - `p_channels text[]`;
   - rechecagens com `whatsapp_not_ready`, `whatsapp_type_not_allowed` e `summary_empty`;
   - expiração do resumo por `catchUpMinutes`;
   - silêncio sem o resumo;
   - itens com `timezone`, `overdueAt`, `occurrenceStatus`, `phone` e `summary` (`dailySummarySourceSchema`, com os cortes de `maxItems` e `totals`);
   - `report_notification_results` com `whatsapp: { providerMessageId, waId, template }`, que grava `whatsapp_messages`.

   Avise `backend-funcoes` do nome final dos argumentos.

9. **Retenção:** `phone_verifications` (48 h), `whatsapp_messages` (30 dias) e `whatsapp_console_messages` (1 dia), no cron diário.
10. `pnpm db:types`.

## Paralelo e dependências

- Depende só do ADR. `backend-funcoes` e `notificacoes-whatsapp` começam as partes puras ao mesmo tempo.
- A ordem sugerida é 1, 2, 4, 3, 5, 6, 8, 7 e 9: o claim (8) é o que destrava a integração do despacho, e o job (7) precisa dele para ser testado de ponta a ponta.
- `daily_summary` só entra em `notificationTypeSchema` pelo `notificacoes-whatsapp`. No SQL, use o texto direto, sem esperar o contrato.

## Bloqueios e dúvidas

Nenhum. A fonte do resumo segue "Atrasadas" de Hoje (QA4-1), sem a exceção de quem tem `task.manage_group`.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`.
