# Handoff: notificacoes-whatsapp para auth-grupos, deep link de sessão no nativo (F8-7)

**De:** notificacoes-whatsapp
**Para:** auth-grupos
**Data:** 2026-11-03 06:50 (BRT)
**Branch:** `feat/native-and-csp`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 11, e ADR-0004 (link mágico). No nativo, `createAppLink('/x')` vira `azkaban:///x`, e o Supabase devolve `azkaban:///x#access_token=...&refresh_token=...`. O cliente tem `detectSessionInUrl: isWeb` (`packages/data/src/client.ts`), então no nativo ninguém lê o fragmento hoje: o link mágico não entra.

## O que foi entregue

`scheme` e os perfis do EAS em `apps/app` (`app.config.ts`, `eas.json`). Nada de sessão.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. `authRepository.setSessionFromLink(url)` em `packages/data/src/auth`: lê `access_token` e `refresh_token` do fragmento (e `error_description`, para a tela dizer que o link venceu), chama `supabase.auth.setSession` e devolve o caminho do link. Teste de unidade do parser (fragmento vazio, só um dos dois tokens, link de outro esquema).
2. No layout raiz, só no nativo: `Linking.useURL()` (ou `getInitialURL` mais o evento) chama a função; depois, `router.replace(safeInternalPath(path) ?? '/')`.
3. Conferir em `supabase/config.toml` e no painel que `azkaban://**` está em `additional_redirect_urls` (o humano faz no projeto hospedado).

## Bloqueios e dúvidas

Sem build nativo, só dá para testar por unidade (precisa de conta Expo para o APK).

## Como testar

`pnpm check`; num APK de teste, pedir o link e abrir pelo e-mail no aparelho.
