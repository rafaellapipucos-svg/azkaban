# Handoff: tarefas-calendario para prova-foto, o ponto de entrada da câmera nas telas de tarefa (F3-8)

**De:** tarefas-calendario
**Para:** prova-foto
**Data:** 2026-11-01 19:59 (BRT)
**Branch:** `feat/proof-tasks`, a partir de `feat/phase-3-proof` (`e3af38d`)

## Contexto

Atende aos handoffs do `arquiteto` e do `banco-de-dados` (F3-8). As telas de tarefa agora sabem o que é uma tarefa com foto, o "em análise" e a contestação. A câmera, o envio e a revisão do admin continuam com você: não construí nada disso. Features não se importam, então a ligação entre as telas de tarefa e o seu fluxo é feita pela rota, por uma prop.

## O que foi entregue

Tarefa com `requiresPhotoProof` não pode ser marcada como feita pela lista nem pelo detalhe: o `canTransition` responde `proof_required`, `availableTransitions` não oferece `done`, e o banco recusa de qualquer jeito. O amarelo ("Tentei") e o vermelho ("Não fiz") continuam normais, sem foto.

## O ponto de entrada

Features não se importam, então a rota compõe a entrada do seu fluxo na tela de tarefa, como o [ADR-0006](../../adr/0006-calendario-equipe-navegacao.md) já faz com a Equipe. Há dois encaixes, cada um no formato que a tela pede:

| Tela               | Rota (`apps/app/app/(app)`) | Encaixe                                                                                                                                                            |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TaskDetailScreen` | `tasks/[id]/index.tsx`      | `children`: o seu botão ("Tirar a foto para concluir" ou o que preferir). A tela o desenha no lugar do "Marcar como feito", só enquanto o usuário puder enviar.    |
| `TodayScreen`      | `(tabs)/index.tsx`          | `onProof?: ProofEntry`, com `ProofEntry = (occurrenceId: string) => void`, exportado por `@azkaban/feature-tasks`. O check da tarefa com foto chama `onProof(id)`. |
| `AreaScreen`       | `(tabs)/area/[areaKey].tsx` | O mesmo `onProof`.                                                                                                                                                 |

**O encaixe só aparece quando o usuário pode mandar a foto agora** (`canSendProof` em `@azkaban/core`): ele é o responsável pela ocorrência, a ocorrência está `pending` ou `missed`, a janela de 72 h está aberta (ou ele tem `task.manage_group`) e não há contestação. Fora disso o check fica desligado e o detalhe explica ("Quem faz a tarefa é quem tira a foto.", "Já passaram 72 horas…").

**Sem encaixe (hoje):** o check fica desligado, a linha diz "Pede foto para concluir" e o detalhe diz "Esta tarefa só fica feita com uma foto tirada na hora.", sem botão. Não criei rota nenhuma: `/tasks/[id]/proof` não existe.

O que fazer:

1. Criar a rota do seu fluxo (sugestão: `apps/app/app/(app)/tasks/[id]/proof.tsx`, fina, só monta a sua tela).
2. Nas três rotas acima, trocar o re-export por um componente: no detalhe, `<TaskDetailScreen occurrenceId={id}><SeuBotao occurrenceId={id} /></TaskDetailScreen>`; em Hoje e na área, `onProof={(id) => router.push(`/tasks/${id}/proof`)}`. As rotas são casca (`apps/app`), nem minhas nem suas: se o orquestrador preferir editá-las, é só pedir.
3. Depois do envio com sucesso, invalidar as consultas das telas: `['occurrences']`, `['occurrence']`, `['history']`, todas com `useQueryClient().invalidateQueries({ queryKey })`. `useRefreshTasks` não é exportado de propósito, para você não depender do módulo de tarefas.
4. O teste `e2e/tasks-proof.spec.ts` ("cannot be marked done…") afirma que o check de uma tarefa com foto está **desligado**, o que vale sem encaixe. Ao ligar `onProof`, o check do responsável passa a estar ligado: troque essa asserção por uma que leve ao seu fluxo.

## Contratos criados ou alterados

Os campos que o `arquiteto` deixou opcionais viraram obrigatórios, como o handoff dele autorizava (sem novo pedido):

- `Occurrence.proofReviewStatus`: `proofReviewStatusSchema.nullable()`.
- `OccurrenceListItem.task.requiresPhotoProof` e `requiresAdminApproval`: obrigatórios.
- `StatusHistoryEntry.proofReviewStatus`: obrigatório, anulável.
- `contextInputSchema.location`: `contextLocationSchema.nullable()`, obrigatório. `Context` herda.

Quem montar um desses objetos à mão (testes, fixtures) agora precisa passar os campos. `pnpm typecheck` aponta os lugares.

Em `@azkaban/core`, novos e úteis para a sua revisão: `canReviewProof(user, { groupId, visibility, authorId })` (espelho de `can_review_proof`, só para esconder controles), `canSendProof(request)`, `proofFlagsLocked(user, task)`. `canTransition` e `availableTransitions` ganharam `requiresPhotoProof` e `canReviewProof` na requisição, ambos obrigatórios. `occurrenceXp` pede `proofReviewStatus` e devolve 0 para `done` em análise.

## O que o destinatário precisa fazer

- Usar `StatusBadge`, `StatusMark` e `TaskCheck` com `reviewing={proofReviewStatus === 'in_review'}` na sua tela de revisão e no retorno do envio, como o `design-system` pediu.
- A tela de revisão do admin precisa de uma lista de provas a revisar. Hoje nenhuma lista filtra por `proofReviewStatus`: `tasksRepository.listOccurrences` já devolve o campo em cada linha, mas não filtra. Se precisar do filtro no repositório, peça por handoff.
- O motivo de uma contestação já aparece no detalhe (`statusReason`, "Motivo: …") e no histórico ("Foto contestada").
- Mensagens dos quatro códigos novos de tarefa estão em `packages/i18n/src/pt-BR/tasks.json` (`errors.proof_required`, `proof_flags_locked`, `proof_disputed`, `overdue_occurrence_blocks_edit`). Os erros do seu fluxo (`proofErrorCodeSchema`) são seus.
- **Offline (F8-5):** a fila offline ainda não existe. Quando existir, ela precisa recusar `done` em tarefa com foto (ADR-0007, seção 16). `OccurrenceListItem.task.requiresPhotoProof` está disponível para isso.

## Bloqueios e dúvidas

- O autor da prova não vem na linha da lista. `canReviewProof` usa o responsável da ocorrência como autor, que é quem pode mandar a prova (`proof_assert_open`). Se um dia outra pessoa puder enviar, a lista precisa do `user_id` da prova corrente, e o banco já o expõe por `task_proofs`.
- Uma ocorrência remarcada que continua atrasada aparece em "Atrasadas" e não de novo em "Para hoje", mesmo que o novo dia seja hoje. É o que o ADR-0005 (seção 11) pede; a meta do dia não a conta.

## Como testar

`pnpm check`; `pnpm e2e e2e/tasks-proof.spec.ts` (precisa de `pnpm db:start`). Os ajudantes `e2e/proof-fixtures.ts` (`sendProof`, `reviewProof`, `spotOf`) mandam e revisam uma prova pelas mesmas funções do banco que o seu fluxo vai chamar, sem câmera, e você pode usá-los nos seus testes. Em 375 px, claro e escuro: Hoje, uma área, o detalhe e o Calendário com uma tarefa em análise.
