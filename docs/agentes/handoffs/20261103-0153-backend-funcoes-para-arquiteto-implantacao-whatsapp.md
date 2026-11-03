# Handoff: backend-funcoes para arquiteto, implantação do WhatsApp

**De:** backend-funcoes
**Para:** arquiteto
**Data:** 2026-11-03 01:53 (BRT, derivada de UTC menos 3)
**Branch de origem:** `feat/whatsapp-functions`, a partir de `feat/whatsapp-db` (`eabbf0e`)

## Contexto

Itens 2 a 5 do handoff `20261103-0030-arquiteto-para-backend-funcoes-whatsapp`. O despacho agora reivindica só os canais que sabe enviar, e duas funções novas sobem: `phone-verification` e `whatsapp-webhook`. `docs/implantacao.md` está fora do meu escopo e ficou desatualizado.

## O que o destinatário precisa fazer

1. `docs/implantacao.md`, linhas 30 e 34: sem os segredos VAPID, `dispatch-notifications` **não** responde mais 500 `vapid_not_configured`. Ela reivindica só `whatsapp` (os push esperam, `pending`, sem tentativa gasta) e responde 200. O 500 agora é `channels_not_configured`, só quando nenhum canal está disponível (VAPID ausente **e** segredos do WhatsApp que não passam em `parseWhatsAppEnv`, como `meta` sem os quatro). Um `VAPID_SUBJECT` inválido deixa de ser 500: o push só não é reivindicado.
2. Acrescentar o deploy das duas funções:
   - `supabase functions deploy phone-verification` (com JWT) e `supabase functions deploy whatsapp-webhook` (o `config.toml` já tem `verify_jwt = false` para ela).
   - `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` por `supabase secrets set`, aleatórios, com pelo menos 16 caracteres. O `.env.example` passou a ter valores `local-demo-*` só para esses dois, como o `CRON_SECRET`, aprovados pelo orquestrador; nunca para o token de acesso nem para o phone number id.
   - URL do webhook no App Dashboard: `https://<projeto>.supabase.co/functions/v1/whatsapp-webhook`, com o mesmo token de verificação; assinar o campo `messages`.
3. Se quiser, registrar no ADR-0009 (seção 2) a decisão de quando o `ConsoleProvider` lança (abaixo).

## Decisão tomada (para registro)

Um provedor que lança (só o `ConsoleProvider` lança, quando o `insert` em `whatsapp_console_messages` falha; o `MetaCloudProvider` responde códigos) vira `retry` com `wa_provider_error`, pelo backoff e `maxAttempts` de sempre: nada chegou a ninguém, então repetir não duplica. Uma falha de **montagem** (tipo fora de `whatsappTypes`, resumo que o contrato recusa) continua `failed` com `send_error`. Na `phone-verification`, o provedor que lança é `502 whatsapp_send_failed`, e o código conta no limite.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm functions:test` com a pilha (os testes novos estão listados no script).
