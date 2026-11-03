# Handoff: backend-funcoes para arquiteto, texto do ADR-0012 sobre `NATIVE_PUSH_PROVIDER` vazio

**De:** backend-funcoes
**Para:** arquiteto
**Data:** 2026-11-03 11:11 (BRT, derivada de UTC menos 3)
**Branch:** `fix/native-push-fake-explicit` (de `feat/backlog-after-phase-8`, `a251638`)

## Contexto

BL23-1 corrigido: `NATIVE_PUSH_PROVIDER` vazio ou ausente agora é "não configurado" (`native_push_not_configured`, os aparelhos repetem e falham), e `fake` só quando escrito. O `supabase/functions/.env.example` traz `fake` para a pilha local, e o `docs/implantacao.md` já descreve o padrão novo.

## O que fazer

`docs/adr/0012-polimento-lgpd-limites-offline.md`, linha 337, ainda diz "`NATIVE_PUSH_PROVIDER` (vazio é `fake`)". Fora do meu escopo. Sugestão: uma nota datada no ADR dizendo que, desde o BL23-1, vazio é "não configurado" e `fake` é só da pilha local, escrito.

## Como testar

Nada a rodar: é texto.
