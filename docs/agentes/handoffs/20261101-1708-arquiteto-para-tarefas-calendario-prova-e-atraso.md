# Handoff: arquiteto para tarefas-calendario, prova nas telas de tarefa e atraso preservado

**De:** arquiteto
**Para:** tarefas-calendario
**Data:** 2026-11-01 17:08 (BRT)

## Contexto

A prova por foto muda telas e repositório que são seus, e `prova-foto` não pode editá-los. O humano também aprovou a regra de reagendamento do [ADR-0005, seção 11](../../adr/0005-tarefas-ocorrencias-recorrencia.md). A regra da prova está no [ADR-0007](../../adr/0007-prova-por-foto.md).

## O que foi entregue

Branch `feat/proof-contracts`, a partir de `feat/phase-3-proof`.

Mudei dois arquivos de teste e um de matriz fora do meu escopo, por serem consequência direta do contrato: `transitions.test.ts` agora espera os pares de `reviewer`, e `matrix.ts` e `matrix.test.ts` ganharam `proof.review`.

## Contratos criados ou alterados

Em `packages/contracts/src/tasks.ts`, três campos nasceram opcionais para não quebrar `packages/data`:

- `Occurrence.proofReviewStatus`;
- `OccurrenceListItem.task.requiresPhotoProof` e `requiresAdminApproval`;
- `StatusHistoryEntry.proofReviewStatus`.

Também: `proof_required`, `proof_flags_locked`, `proof_disputed`, `overdue_occurrence_blocks_edit` em `taskErrorCodeSchema`; `checkApproval` nos schemas de tarefa; `location` opcional em `contextInputSchema`; ator `reviewer`.

## O que o destinatário precisa fazer

**Depois de F3-2:**

1. Selecione e mapeie esses campos em `packages/data/src/tasks`. Depois, torne-os obrigatórios nos contratos: é uma mudança aprovada, sem novo pedido.
2. `canTransition`: novo parâmetro `requiresPhotoProof`. `done` responde `proof_required`, e `availableTransitions` não oferece esse destino. `TransitionError` ganha o código. `deriveActors` continua sem `reviewer`.
3. Ocorrência contestada só muda para quem pode revisar: `proof_disputed`.
4. Detalhe da tarefa: em tarefa com foto, a ação principal é a entrada que `prova-foto` expõe, composta pela rota, e o amarelo segue igual.
5. Mensagens em pt-BR para os quatro códigos novos.
6. Linhas de Hoje, abas, calendário e histórico mostram em análise com a variante de `StatusMark`. O histórico mostra aprovação e contestação.

**Formulário de tarefa:**

7. Interruptores de foto e aprovação. A aprovação só aparece com foto, em tarefa `group`, e com responsável diferente de quem edita. Quem tem só `task.edit_assigned` vê os dois travados.

**Formulário de contexto:**

8. Local opcional: endereço em texto, "usar minha localização atual" e raio com `proofDefaults.contextRadiusM`. Sem geocodificação. Grave pelo repositório de `contexts`. Depois, torne `location` obrigatório e nulo no contrato.

**Atraso preservado:**

9. Reagendar uma vencida: avise antes que ela continua atrasada, com XP reduzido, e que a janela não muda.
10. Uma ocorrência reagendada tem `scheduledStart` futuro e `overdueAt` passado, e aparece em Atrasadas e no novo dia. É o esperado. Confira que `listOverdue` e `today.ts` não a dupliquem no mesmo dia.
11. `overdue_occurrence_blocks_edit`: a mensagem sugere resolver a ocorrência ou usar "só esta".

**Limpeza:**

12. `packages/features/tasks/src/config.ts`: tire o `PROVISIONAL` de `bands`. O humano aceitou os valores.
13. F8-5: a fila offline recusa `done` em tarefa com foto.

## Bloqueios e dúvidas

Itens 1 a 6 dependem de F3-2. Itens 7, 8 e 12 não dependem. O item 6 depende de `design-system`.

## Como testar

`pnpm check`, `pnpm e2e`, em 375px, claro e escuro.

- `canTransition` com foto: `proof_required` para todo ator, e `availableTransitions` sem `done`.
- `missed` com foto: oferece amarelo e não verde.
- Tarefa sem foto: nada muda.
- Reagendar vencida própria, concluir: mostra atrasada, com XP de atrasada. Uma não vencida não mostra aviso.
- Interruptores: quem tem só `task.edit_assigned` não os altera.
- Contexto com local: salvar, editar, remover.
