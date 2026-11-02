# Handoff: arquiteto para prova-foto, aviso versão 2 e fila

**De:** arquiteto
**Para:** prova-foto
**Data:** 2026-11-01 23:39 (BRT)
**Branch:** `docs/proof-security-decisions`

## Contexto

Decisões na [seção 20 do ADR-0007](../../adr/0007-prova-por-foto.md). Respondem aos itens 1 e 2 do handoff `20261101-2240-qa-testes-para-prova-foto-achados-do-qa`. Depende das migrations 5 e 8 do handoff para `banco-de-dados`.

## O que foi entregue

ADR-0007 atualizado.

## Contratos criados ou alterados

`proofRules.consentVersion` passa a 2 e entra `recordRetentionDays`, em `packages/config/src/proof.ts`, pela entrega de `banco-de-dados`.

## O que o destinatário precisa fazer

**1. Aviso, em `packages/i18n/src/pt-BR/proof.json`, chave `consent`, e em `ProofCaptureScreen`.** Três chaves novas, `stamp`, `thirdParties` e `deletion`, e a troca de `retention`:

- `stamp`: "A foto leva carimbados o seu nome, o título da tarefa e o horário."
- `thirdParties`: "Evite mostrar outras pessoas na foto. Se alguém aparecer, quem revisa também vê."
- `retention`: "A foto é apagada depois de {{days}} dias. O registro sem a imagem, com horários e marcas de local, é apagado depois de {{recordDays}} dias."
- `deletion`: "Para pedir a exclusão antes do prazo, fale com o dono do grupo."

`recordDays` vem de `proofRules.recordRetentionDays`. Ajuste o outro idioma, se houver.

**2. Item 1 do QA: nada a mudar na fila.** `can_review_proof` passa a aceitar tarefa arquivada, e `canReviewProof` e `listReviewQueue` já não olham isso, então fila, botões e servidor batem. Confira na tela, com a tarefa excluída: aprovar e contestar funcionam.

**3. Item 2 do QA: Equipe.** `apps/app/app/(app)/team/[groupId].tsx` compõe `ProofQueueLink` acima de `TeamScreen`, como `groups/[id].tsx`. A rota continua fina, e nenhuma feature importa outra.

Os itens 3 a 7 do QA não dependem de decisão minha.

## Bloqueios e dúvidas

Só integre junto com a migration 8: com o aviso velho e `consentVersion` 2, alguém aceitaria um texto que não leu. Nada foi implantado, então basta entrarem na mesma integração.

A frase de `deletion` é provisória. Se o humano definir um contato de privacidade antes da integração, troque a frase. F8-3 troca de novo, pela tela.

## Como testar

`pnpm check`. Na E2E, o aviso aparece de novo para quem aceitou a versão 1, com as frases novas, e a prova de uma tarefa excluída é aprovada pela fila, com o XP concedido. A Equipe mostra o link só para quem tem `proof.review`.
