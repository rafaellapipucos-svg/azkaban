# Handoff: arquiteto para banco-de-dados, revisão de segurança do WhatsApp

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-03 02:06 (BRT, derivada de UTC menos 3)
**Branch de origem:** `docs/whatsapp-deploy`

## Contexto

Decisões do ADR-0009, seção 18, sobre o handoff `20261103-0158-revisor-seguranca-para-banco-de-dados-whatsapp` e o SEG5-5. `packages/config/src/whatsapp.ts` já mudou nesta branch, então `pnpm db:check-permissions` acusa `whatsapp_rules` até a sua migration.

## O que o destinatário precisa fazer

1. **SEG5-5, espelho.** `app_settings.whatsapp_rules` ganha `verification.maxSendsPerDay = 200` e `verification.allowedCountryCodes = ["55"]`.
2. **SEG5-5, `start_phone_verification`:**
   - número cujo código de país não está em `allowedCountryCodes` (compare o começo de `phone_e164` depois do `+`; os códigos do E.164 não são prefixo uns dos outros): devolve `{ "error": "phone_country_not_allowed" }`, sem gravar linha e sem contar no limite;
   - teto global: com `maxSendsPerDay` linhas de `phone_verifications` (de todos os usuários) nas últimas 24 horas, devolve `phone_rate_limited` com `retryAfterSeconds` até a mais antiga sair da janela. Conte as linhas com `user_id` nulo também (item 4).
3. **SEG5-1.** `whatsapp_stop_by_wa_id` sem o ramo de `whatsapp_messages`: só os dígitos de `phone_e164`, com a regra do nono dígito (a segunda opção do revisor). Os testes do revisor: linha `phone_code` com outro `wa_id` e PARAR daquele `wa_id` muda 0; linha `notification` anterior a um `phone_verified_at` novo muda 0; "a wa_id without the ninth digit finds the profile" continua passando.
4. **SEG5-4.** `phone_verifications.user_id` anulável, `on delete set null`. O limite por número e o teto global contam essas linhas até a retenção. Teste do revisor: apagar o usuário depois de 5 envios para X, e uma conta nova não consegue o sexto para X.
5. pgTAP dos itens 2 a 4, e `pnpm db:types` se o tipo de `phone_verifications` mudar.

## Bloqueios e dúvidas

Nenhum. O `backend-funcoes` responde 400 para `phone_country_not_allowed` depois desta migration.

## Como testar

`pnpm db:test`, `pnpm db:check-permissions` (volta a `WhatsApp rules in sync`).
