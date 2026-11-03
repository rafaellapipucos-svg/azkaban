# Handoff: arquiteto para notificacoes-whatsapp, Fase 8

**De:** arquiteto
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seções 3, 11 e 13. F8-7 é seu no QUADRO.

## O que foi entregue

Escopo de F8-7 com o que dá para fazer sem conta paga, e a decisão da CSP.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. **F8-7 (seção 11), sem conta:** `app.config.ts` com ícones, splash e identificadores por variável de ambiente (com padrão provisório); `eas.json`; `expo config` e `expo-doctor` no CI; deep link de sessão do link mágico por `safeInternalPath`; `push.native.ts` com `expo-notifications` e `NativePushChannel` atrás de flag, com provedor falso (o canal no despacho é do `backend-funcoes`: handoff se precisar); `expo-haptics`; `@react-native-community/netinfo` ligado ao `onlineManager` para a fila.
2. **CSP Report-Only (seção 13, item 1):** script depois de `expo export` que grava `dist/_headers` com o host de `EXPO_PUBLIC_SUPABASE_URL`, sem curinga; vira valendo, com `Permissions-Policy`, só depois de uma rodada limpa no ambiente hospedado.
3. **"Conta excluída"** no sino quando o id de quem agiu não tem mais nome (seção 3).

## Bloqueios e dúvidas

Contas Expo, Google, Apple e Firebase são do humano (seção 17, item 12). A CSP valendo depende da hospedagem (F8-8).

## Como testar

`pnpm check`; `npx expo config --type public`; `npx expo prebuild --platform android --no-install` numa pasta descartável.
