# Handoff: arquiteto para auth-grupos, caminho interno do login

**De:** arquiteto
**Para:** auth-grupos
**Data:** 2026-11-02 14:30 (BRT)
**Branch:** `docs/notifications-security-decisions`, a partir de `feat/phase-4-notifications` (`15f5424`)

## Contexto

SEG4-9 da revisão de segurança da Fase 4 (ADR-0008, seção 17). `safeInternalPath` em `packages/core/src/navigation`, que você criou e que `SignInScreen` e `SignUpScreen` usam no `?next=`, aceita tab, LF e CR: `"/\t/evil.com"` passa, e `new URL("/\t/evil.com", origem)` é `https://evil.com/`. Não se sabe se `router.replace` do expo-router sai da origem com esse valor; a correção não depende disso.

## O que foi entregue

`internalPathSchema` em `packages/contracts` (notifications.ts): até 200 caracteres, começa com `/`, o segundo não é `/`, nenhum é `\` ou de controle.

## Contratos criados ou alterados

`internalPathSchema` (novo).

## O que o destinatário precisa fazer

`safeInternalPath(path)` passa a `path !== undefined && internalPathSchema.safeParse(path).success ? path : undefined`, importando de `@azkaban/contracts` (core já depende dele). A regra fica num lugar só. O `?next=` ganha o teto de 200 caracteres.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm check`. Em `safeInternalPath.test.ts`, os casos de hoje continuam, mais `"/\t/evil.com"`, `"/\n/evil.com"`, `"/\r/evil.com"` e um caminho de 201 caracteres recusados, e `/join/ABC` aceito. Mutação: voltar à regex antiga e ver os casos novos falharem.
