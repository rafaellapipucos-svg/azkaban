# Handoff: banco-de-dados para notificacoes-whatsapp, RPCs e colunas das telas

**De:** banco-de-dados
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 01:35 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/whatsapp-db`, a partir de `feat/phase-5-whatsapp` (`da2fd5d`)

## Contexto

As migrations da Fase 5 (ADR-0009) estão prontas e `database.types.ts` foi regenerado. Este handoff lista o que as telas e o repositório usam.

## Leitura (o dono lê a própria linha de `profiles`, como antes)

- `whatsappStatusSchema`: `phone_e164`, `phone_verified_at`, `whatsapp_opt_in_at`, `whatsapp_opt_in_version`, `whatsapp_opt_out_at`.
  - Também existe `whatsapp_opt_out_source` (`app` ou `webhook`).
  - Pronto = verificado e `whatsapp_opt_out_at` nulo ou anterior a `whatsapp_opt_in_at`: o mesmo `isWhatsAppReady` do core.
- `dailySummaryPreferencesSchema`: `daily_summary_enabled`, `daily_summary_time` (`time`; o Postgres devolve `08:00:00`, corte para `HH:mm` como em `quiet_hours_*`), `daily_summary_include_overdue`, `daily_summary_deadline_days` (`smallint`), `daily_summary_skip_empty`.
- `daily_summary_last_date` é do sistema. A tela não precisa dele.
- Ninguém mais lê essas colunas: `group_member_profiles()` continua só com nome, papel e data.

## Escrita

- `update` direto só nas cinco `daily_summary_*`. `daily_summary_deadline_days` fora de 0 a 30 dá 23514. As colunas do telefone e do consentimento dão 42501: só as RPCs escrevem.
- RPCs `authenticated`:
  - `confirm_phone_verification(p_code text)` → `jsonb` no formato de `phoneVerificationConfirmResultSchema`: `{ phoneE164, verifiedAt }` ou `{ error: 'phone_code_invalid' | 'phone_code_expired' }`. Ela **não levanta exceção** no código errado.
    - Depois de 5 tentativas, até o código certo dá `phone_code_expired`: peça outro.
    - Confirmar outro número troca o telefone e apaga o opt-in. A tela deve mostrar o aviso de novo.
  - `remove_phone()` → `void`: apaga telefone, verificação e opt-in, e mata o código vivo.
  - `whatsapp_opt_in(p_consent_version int)` → `void`. Levanta, com 22023, `phone_not_verified` ou `invalid_consent_version` (a versão é `whatsappRules.consentVersion`).
  - `whatsapp_opt_out()` → `void`. Repetir mantém a data.
- O código é pedido pela Edge Function `phone-verification` do `backend-funcoes`, não por RPC.

## Notificações

- `daily_summary` está no enum `notification_type`. **O cast em `setPreference` (`packages/data/src/notifications/index.ts`) já pode sair:** conferi `tsc --noEmit` em `packages/data` sem ele, sem erro, e restaurei o arquivo.
- A linha do sino do resumo nasce com `read_at = created_at`, sem ocorrência e sem grupo, e `data = { localDate }`.
- Uma preferência `(daily_summary, web_push)` ligada não grava nada. Uma `(<outro tipo>, whatsapp)` também não.

## E2E (item 6 do seu handoff, ou do `qa-testes`)

- Com service role: `start_phone_verification` é chamada pela função. O código está em `whatsapp_console_messages.message`, que só a service role lê.
- `select public.enqueue_daily_summaries()` (service role ou `postgres`) devolve quantos resumos gravou. Para que um perfil entre, `daily_summary_time` precisa ficar entre agora e duas horas atrás, no fuso do perfil, e `daily_summary_last_date` precisa ser anterior à data local.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`.
