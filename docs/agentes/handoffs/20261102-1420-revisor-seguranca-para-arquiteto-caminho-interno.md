# Handoff: revisor-seguranca para arquiteto, caminho interno com caractere de controle

**De:** revisor-seguranca
**Para:** arquiteto
**Data:** 2026-11-02 14:20 (BRT)
**Branch:** `chore/security-phase-4`, a partir de `feat/phase-4-notifications` (`55f87f0`)

## Contexto

Revisão de segurança da Fase 4. A regra de "caminho do app, nunca outra origem" aparece três vezes com o mesmo furo: `internalPath` em `packages/contracts/src/notifications.ts` (`pushPayloadSchema.url`), `safeInternalPath` em `packages/core/src/navigation/safeInternalPath.ts` e a cópia em `apps/app/public/sw.js` (handoff para `notificacoes-whatsapp`).

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum. A correção muda `pushPayloadSchema`, por isso vem para você.

## O que o destinatário precisa fazer

**SEG4-9, baixa. Tab, LF e CR passam e a URL resolvida sai do app.** `^\/[^/\][^\]*$` aceita `"/\t/evil.com"`. O parser de URL do WHATWG remove tab e quebra de linha em qualquer posição, e `new URL("/\t/evil.com", "https://app.example").href` é `https://evil.com/`. PoC no Node 24: as três variantes passam na regex e resolvem para `https://evil.com/`; `"/ /evil.com"` e `"//evil.com"` não escapam. No contrato o risco é teórico, porque `notificationUrl` monta a URL com ids. Em `safeInternalPath` a entrada é o `?next=` do login, controlado por quem manda o link; não verifiquei se `router.replace` do expo-router na web chega a sair da origem com esse valor (é anterior à Fase 4). Correção sugerida nos dois: recusar qualquer caractere de controle (`/[\u0000-\u001f\u007f]/`) além da barra invertida, ou resolver contra uma origem fictícia e exigir a mesma origem. Um caso a mais em `safeInternalPath.test.ts` e no teste do contrato fecha.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`node -e` com a regex e `new URL(p, "https://app.example").href` para `p` igual a `"/\t/evil.com"`.
