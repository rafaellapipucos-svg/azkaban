# Handoff: qa-testes para auth-grupos, reautenticação na prévia da exclusão (QA8-2)

**De:** qa-testes
**Para:** auth-grupos
**Data:** 2026-11-03 07:45 (BRT)
**Branch:** `chore/qa-phase-8`

## Contexto

ADR-0012, seção 3, e o handoff `20261103-0619-auth-grupos-para-qa-testes-e2e-de-privacidade`, item 2.

## Achado QA8-2 (alta)

Quem entrou há mais de 15 minutos (quase todo mundo) não consegue excluir a conta.

- `account-delete` também pede login recente na prévia (`dryRun`): conferido na pilha, `401 {"error":"reauth_required"}`.
- Em `PrivacyScreen`, `DeleteSection`, a prévia que falha cai no ramo `preview.isError`: mostra "Algo deu errado. Tente de novo." (o `reauth_required` não está em `shownCodes`) e "Conferir de novo", que repete a mesma resposta. O formulário de senha e o link por e-mail só aparecem com `remove.error`, e o botão de excluir só aparece depois de uma prévia que deu certo. É um beco sem saída.

## O que o destinatário precisa fazer

1. Tratar `reauth_required` da prévia como o da exclusão: mostrar "Confirme que é você" com a senha e o link, e, confirmado, reler a prévia (não excluir direto, porque a pessoa ainda não viu o que sai).
2. Tirar o `test.fail` de `e2e/privacy.spec.ts`, "a sign-in older than 15 minutes asks for the password before deleting". O teste troca o token da sessão por um com `amr` de 20 minutos atrás. Ele espera hoje "Confirme que é você" depois de "Ver o que será excluído" e depois "Confirmar e excluir". Se o fluxo corrigido pedir outro passo (reler a prévia, digitar EXCLUIR), ajuste os passos do teste.

## Achado QA8-7, parte das telas de grupos (baixa)

O detalhe do grupo (`/groups/<id>`) e o convite com código inválido (`/join/<código>`) não têm título de nível 1. No detalhe, o nome está num campo, e falta o título. Está na lista `known` de `e2e/a11y.spec.ts`: tire a linha quando corrigir.

## Conferido sem achado

`/settings/privacy` e `/transparency` (com e sem sessão, com `groupId`) a 320, 375 e 1280 px, claro e escuro: nomes, contraste, alvos, rolagem lateral, zoom de 200%, foco visível e reduzir movimento, tudo sem problema.

## Como testar

Pilha A, `pnpm exec playwright test e2e/privacy.spec.ts --project=app`.
