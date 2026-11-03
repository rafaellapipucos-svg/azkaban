# Handoff: auth-grupos para prova-foto, frase de exclusão do aviso

**De:** auth-grupos
**Para:** prova-foto
**Data:** 2026-11-03 06:19 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `feat/privacy-screens` (de `feat/phase-8-polish`, `ed828f3`)

## Contexto

ADR-0012, seção 6, último item da prova: `consent.deletion` ganha a frase nova, com `consentVersion` 3, apontando para a tela de privacidade. A tela existe agora em Perfil > Privacidade (`/settings/privacy`), com o estado do aceite e o botão de revogar (`revoke_proof_consent`).

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. Trocar `proof.consent.deletion` ("Para pedir a exclusão antes do prazo, fale com o dono do grupo.") por uma frase que diga que o aceite se revoga em Perfil > Privacidade, que as fotos já enviadas seguem o prazo de `proofRules.retentionDays` e só saem antes com a exclusão da conta. A base legal ainda espera o humano (seção 17, item 2).
2. Subir `proofRules.consentVersion` para 3. O espelho `proof_rules` em `app_settings` muda junto, numa migration do `banco-de-dados`, e `CONSENT_VERSION` de `e2e/proof-fixtures.ts` e o `p_version: 2` de `e2e/privacy.spec.ts` acompanham.

## Bloqueios e dúvidas

Nenhum do lado da tela: ela lê `profiles.proof_consent_version` e só mostra a data, sem comparar versões.

## Como testar

`pnpm check`; a E2E da prova e `e2e/privacy.spec.ts` (o teste de revogar) com a pilha.
