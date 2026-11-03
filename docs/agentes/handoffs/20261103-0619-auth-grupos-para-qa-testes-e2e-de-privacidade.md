# Handoff: auth-grupos para qa-testes, E2E de privacidade

**De:** auth-grupos
**Para:** qa-testes
**Data:** 2026-11-03 06:19 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `feat/privacy-screens` (de `feat/phase-8-polish`, `ed828f3`)

## Contexto

ADR-0012, seções 2, 3, 6 e 7. Telas novas: Perfil > Privacidade (`/settings/privacy`) e "O que quem administra vê" (`/transparency`, fora do `(app)`, legível sem sessão; `?groupId=` mostra o tipo e o ranking do grupo, `?groupType=` o padrão do tipo, aberto do convite de grupo `company`).

## Contratos criados ou alterados

Nenhum. A tela usa `privacy.ts` como está.

## O que o destinatário precisa fazer

1. Rodar `e2e/privacy.spec.ts`, escrita sem rodar (sem pilha), quando `account-export` e `account-delete` existirem: exportar (download, nome do arquivo, envelope), prévia com bloqueio de dono, passar a posse e voltar (a prévia é relida no foco), excluir com a palavra e voltar às boas-vindas, revogar o aceite e abrir a transparência.
2. Cobrir o que a E2E não alcança: `reauth_required` (login com mais de 15 minutos; a tela pede a senha ali mesmo ou um link por e-mail que volta para `/settings/privacy`), `rate_limited` na quarta exportação do dia (texto com horas ou minutos de espera) e sair com pendências da fila offline (`context.setOffline`, marcar, Sair pede confirmação, "Sair e descartar").
3. axe e 375 px nas duas telas novas, claro e escuro.

## Bloqueios e dúvidas

As duas funções são do `backend-funcoes` e estavam em andamento.

## Como testar

`pnpm exec playwright test e2e/privacy.spec.ts --project=app` com a pilha e as funções servidas.
