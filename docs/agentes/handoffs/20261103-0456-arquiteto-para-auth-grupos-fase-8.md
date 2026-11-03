# Handoff: arquiteto para auth-grupos, Fase 8

**De:** arquiteto
**Para:** auth-grupos
**Data:** 2026-11-03 04:56 (BRT)
**Branch:** `docs/phase-8-adr`

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seções 2, 3, 4, 6, 7 e 13. Substitui o que faltava do handoff `20261101-2339-arquiteto-para-auth-grupos-f8-3-da-prova`: os itens 1 a 5 de lá estão decididos nas seções 3 e 6.

## O que foi entregue

Contrato `packages/contracts/src/privacy.ts` e `rateLimitedErrorCode` em `common.ts`.

## Contratos criados ou alterados

`accountDeleteRequestSchema`, `accountDeletePreviewSchema`, `accountDeleteResultSchema`, `privacyErrorSchema`, `rateLimitedErrorCode`.

## O que o destinatário precisa fazer

1. **Tela Privacidade** em Perfil (seção 6): exportar, excluir, estado do aceite da prova com revogar, atalhos para notificações e WhatsApp por composição de rota, link para a transparência.
2. **Exportar** (seção 2): `privacyRepository` em `packages/data/src/profiles` (ou pasta nova sua), adapter `saveTextFile` em `packages/platform` (web por `Blob` e `<a download>`; nativo responde não suportado e a tela diz para usar a web), `rate_limited` com o tempo de espera.
3. **Excluir** (seção 3): prévia com `dryRun`, grupos que bloqueiam com atalho para passar a posse ou excluir o grupo, grupos que saem junto pelo nome, palavra digitada, `reauth_required` levando a entrar de novo e voltar, e no sucesso `signOut({ scope: 'local' })`, descarte da fila offline (a função que `tarefas-calendario` expõe) e volta às boas-vindas.
4. **Revogar o aceite da prova:** `revoke_proof_consent()`; `consent.deletion` com a frase nova e `consentVersion` 3 (com `prova-foto`, dono do aviso, se preferir).
5. **Transparência** (seção 7): os nove itens, números da config, tipo do grupo e ranking por grupo; aberta de Privacidade, do detalhe do grupo e do convite de grupo `company` antes de aceitar.
6. **429 do GoTrue** (seção 4) nas telas de entrar, cadastrar e link mágico; `rate_limited` ao criar convite e na prévia do código.
7. **`PushSetupCard` depois do primeiro login** (seção 13, item 2), com "Agora não" e uma chave no aparelho.

## Bloqueios e dúvidas

Controlador, contato e base legal esperam o humano (seção 17, itens 1 e 2). A tela sai sem contato; não invente um.

## Como testar

`pnpm check`; E2E de exportar e excluir com `qa-testes` quando as funções existirem.
