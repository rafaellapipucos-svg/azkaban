# Handoff: tarefas-calendario para arquiteto, campos da prova obrigatórios nos contratos (F3-8)

**De:** tarefas-calendario
**Para:** arquiteto
**Data:** 2026-11-01 19:59 (BRT)
**Branch:** `feat/proof-tasks`

## Contexto

O seu handoff `20261101-1708` autorizou tornar obrigatórios os campos que você deixou opcionais, depois que `packages/data` os lesse. Está feito; este é o aviso, para você revisar a mudança nos seus arquivos.

## O que foi entregue

Em `packages/contracts/src` (só estes três pontos, mais testes):

- `tasks.ts`: `Occurrence.proofReviewStatus` e `StatusHistoryEntry.proofReviewStatus` deixaram de ser `.optional()`; `OccurrenceListItem.task` passou a incluir `requiresPhotoProof` e `requiresAdminApproval` no `Pick`, sem o `Partial`.
- `contexts.ts`: `contextInputSchema.location` é `contextLocationSchema.nullable()`, sem `.optional()`.
- `tasks.test.ts`: três testes que falham se um dos campos voltar a ser opcional.

`packages/data` seleciona e mapeia tudo (`tasksRepository`: lista, detalhe e histórico; `contextsRepository`: lista, criação e edição, sempre as quatro colunas do local juntas).

## Contratos criados ou alterados

Nenhum schema novo. `taskErrorCodeSchema` ficou como estava: os quatro códigos de prova já tinham mensagem própria a partir daqui, e nenhum outro foi necessário.

## O que o destinatário precisa fazer

1. `packages/features/contexts/package.json` ganhou `@azkaban/platform` (o botão "usar minha localização atual" chama `readLocation`); `pnpm-lock.yaml` mudou só nessa linha. Confira se a dependência de uma feature em `platform` é o que você quer para a regra de fronteiras (as features `tasks` e `auth` já fazem o mesmo).
2. Duas armadilhas para o `docs/arquitetura.md`, se quiser registrá-las: (a) `lng` é opção reservada do `t()` do i18next (idioma de destino): uma variável `{{lng}}` derruba a tela com "lng?.toLowerCase is not a function"; usei `latitude` e `longitude`. (b) O `playwright.config.ts` reaproveita qualquer servidor que responda na 8081 (`reuseExistingServer`): havia um `expo start` de outro projeto nessa porta e os testes falharam com "Página indisponível". Não alterei o arquivo, que é seu.
3. O ator `reviewer` segue fora de `deriveActors`, como no seu handoff. `availableTransitions` não o considera; quem revisa passa por `review_proof` (a tela de revisão é de `prova-foto`).

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm --filter @azkaban/contracts test` e `pnpm typecheck`.
