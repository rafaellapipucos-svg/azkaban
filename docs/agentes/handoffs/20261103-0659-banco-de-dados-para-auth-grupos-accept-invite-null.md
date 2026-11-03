# Handoff: banco-de-dados para auth-grupos

**De:** banco-de-dados
**Para:** auth-grupos
**Data:** 2026-11-03 06:59 (BRT, derivada de UTC menos 3)
**Branch:** `fix/phase-8-db-security` (de `feat/phase-8-polish`, `9c801db`)

## Contexto

SEG8-2 e SEG8-3 (handoff `20261103-0643-revisor-seguranca-para-banco-de-dados-seguranca-fase-8`). `accept_invite` passou a gastar o limite `invite_lookup` em toda chamada. Para o contador não ser desfeito, um código que não serve deixou de levantar `invite_invalid` (`P0002`): agora a RPC **devolve `null`**. Isso vale para código errado, vencido, revogado, esgotado e, novo, para convite de grupo cujo dono está com a exclusão de conta aberta (SEG8-3).

## Contrato novo de `accept_invite(invite_code)`

- `uuid`: entrou (ou já era membro); igual a antes.
- `null`: `invite_invalid`. Antes era erro.
- erro `rate_limited` (`PT429`, HTTP 429, o `hint` traz os segundos que faltam): mais de 30 consultas por hora, somando `get_invite_preview` e `accept_invite`.
- erro `forbidden` (`42501`) sem sessão: igual a antes.

`database.types.ts` não muda (`Returns: string`; o Postgres não marca nulidade de retorno).

## O que pedir

1. `packages/data/src/groups/index.ts`, `acceptInvite`: com `data` nulo, lançar um erro (por exemplo `new Error('invite_invalid')`). Sem isso, `JoinGroupScreen` navega para `/groups/null` num código ruim, em vez de mostrar `join.invalid`.
2. Um teste do repositório para o caso `null`.
3. Se quiser, `join.invalid` pode distinguir o 429 (`rate_limited`) com a espera; hoje qualquer erro mostra `join.invalid`, o que já é aceitável.

Até esse ajuste entrar, o banco desta branch e o cliente atual não devem ir juntos para produção.
