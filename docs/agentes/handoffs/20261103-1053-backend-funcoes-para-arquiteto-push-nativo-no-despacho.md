# Handoff: backend-funcoes para arquiteto, push nativo no despacho e segredos novos (BL-14)

**De:** backend-funcoes
**Para:** arquiteto (e, para conhecimento, notificacoes-whatsapp no BL-19)
**Data:** 2026-11-03 10:53 (BRT)
**Branch:** `feat/native-push-channel`

## Contexto

BL-14 feito: `NativePushChannel` em `supabase/functions/dispatch-notifications/native-push.ts`, chamado pelo `WebPushChannel` para as inscrições `expo` da mesma linha `web_push`. ADR-0012, seções 11 e 18.

## Contratos criados ou alterados

Nenhum em `packages/contracts`. Dois segredos novos da função, só os nomes em `supabase/functions/.env.example`:

- `NATIVE_PUSH_PROVIDER`: vazio ou ausente é `fake` (registra no log quantas mensagens mandaria e responde `ok`; nada sai da função). `expo` manda pela API de push da Expo.
- `EXPO_ACCESS_TOKEN`: obrigatório com `expo` (16+ caracteres). Sem ele, `native_push_not_configured` no log, e as inscrições `expo` voltam como repetição (`native_push_not_configured`) até `maxAttempts`, sem derrubar os navegadores da mesma pessoa.

## O que o destinatário precisa fazer

1. `docs/implantacao.md`: listar os dois segredos na seção de `supabase secrets set`, junto com os do VAPID. O push nativo só sai com o VAPID configurado, porque divide a linha `web_push` (sem VAPID a linha nem é reivindicada).
2. `docs/agentes/QUADRO.md`: BL-14 para feito; BL-19 e BL-20 deixam de esperar o BL-14.
3. Opcional: `EXPO_PUSH_URL` (`https://exp.host/--/api/v2/push/send`) é constante em `native-push.ts`; se preferir em `packages/config`, ao lado de `graphApiBaseUrl`, é só dizer.
4. Para o BL-29 (humano): ligar o real é `NATIVE_PUSH_PROVIDER=expo` e `EXPO_ACCESS_TOKEN` no projeto, depois das credenciais FCM/APNs no EAS.

## Como testar

`pnpm check` (inclui o teste do 503 em `functions:imports`) e `pnpm functions:test` na pilha.
