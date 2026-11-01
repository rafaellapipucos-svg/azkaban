# Handoff: banco-de-dados para tarefas-calendario, prova por foto e atraso preservado (F3-2)

**De:** banco-de-dados
**Para:** tarefas-calendario
**Data:** 2026-11-01 18:03 (BRT)

## Contexto

F3-2 está pronta no banco, na branch `feat/proof-db`: o [ADR-0007](../../adr/0007-prova-por-foto.md) e a seção 11 do [ADR-0005](../../adr/0005-tarefas-ocorrencias-recorrencia.md). Erros do PostgREST chegam como `{ code, message }`, e a `message` é o código do contrato. Tipos regenerados em `packages/data/src/database.types.ts`; o `pnpm typecheck` passa sem ajuste.

## O que foi entregue

**Colunas novas que `packages/data` deve ler (opcionais hoje nos contratos):**

- `task_occurrences.proof_review_status` (`unreviewed | in_review | approved | disputed`, nulo sem prova corrente) e `task_occurrences.current_proof_id`. "Em análise" é `status = 'done'` e `proof_review_status = 'in_review'`.
- `task_occurrences.auto_miss_at`: onde o job de vermelho de F4-6 olha. A tela continua usando `overdue_at`.
- `task_status_history.proof_review_status`.
- `contexts.location_address, location_lat, location_lng, location_radius_m`: todos ou nenhum (`23514 contexts_location_check`), raio de 20 a 5000, endereço de 1 a 200. `insert` e `update` por coluna, como o resto do contexto, e a RLS exige `context.manage`.

**Verde em tarefa com foto.** `set_occurrence_status` com destino `done` responde `P0001 proof_required` para todo mundo (responsável, editor, admin, dono). A tela de uma tarefa com `requires_photo_proof` não pode oferecer "concluir" por essa RPC: o caminho é a câmera de `prova-foto`. Amarelo e vermelho seguem normais, sem foto. Um `insert` de ocorrência já resolvida nessas tarefas também é recusado.

**Ocorrência contestada** (`proof_review_status = 'disputed'`, `partial` ou `missed`). Qualquer transição por `set_occurrence_status` exige `proof.review` e ser outra pessoa que o autor da prova; senão `P0001 proof_disputed`. Só `review_proof` desfaz. A tela deve mostrar o motivo (`status_reason`) e esconder reabrir e cancelar para quem não pode.

**Pares novos de `reviewer`** (`done → partial`, `done → missed`, `partial → done`, `missed → done`) só acontecem em `review_proof`. Para `set_occurrence_status` eles dão `42501 forbidden`, não `invalid_transition`.

**`edit_task`.**

- `42501 proof_flags_locked`: mudar `requiresPhotoProof` ou `requiresAdminApproval` é de quem tem a tarefa própria (criador e responsável) ou `task.manage_group` em tarefa `group`. Quem tem só `task.edit_assigned` não muda; o formulário deve travar os dois campos para ele. Vale para `this`, `this_and_following` e `all`.
- `P0001 overdue_occurrence_blocks_edit`: mudança de agenda que apagaria e recriaria uma pendente vencida, por quem responde por ela. Em `this_and_following` a agenda é comparada com a ocorrência do pivô (início, fim, tipo, fuso e regra sem o `COUNT`); em `all`, com a tarefa. Mudar só título ou notas passa. A mensagem para o usuário é "resolva a pendente, ou use só esta". Quem tem `task.manage_group` e não é responsável antigo nem novo não é bloqueado.
- `requires_admin_approval` só vale com foto e em tarefa `group`: o banco recusa o resto com `23514 tasks_admin_approval_check`. A migration limpou as linhas antigas.

**Atraso preservado (ADR-0005, seção 11).** Reagendar uma ocorrência já vencida (`edit_task` com `this`, ou uma avulsa por qualquer escopo) move a ocorrência para o novo dia, mas `overdue_at` fica: `late`, XP e a janela de 72 h continuam vindo do prazo original. `auto_miss_at` segue a agenda nova. Quem tem `task.manage_group` e não é responsável (antigo ou novo) concede prazo novo: aí `overdue_at` é recalculado. A tela deve avisar ao reagendar uma vencida: "continua atrasada". Reatribuir sem mudar a agenda passa a alcançar as pendentes com `auto_miss_at > now()`.

**XP.** Prova com aprovação (`in_review`) não dá XP até aprovar. Contestar compensa e dá o amarelo; as contas estão em `rls_proof.test.sql`. Dia perfeito, taxa da Equipe e ofensiva (Fase 6) devem olhar `proof_review_status`.

**Erros que a tela deve mapear:** `proof_required`, `proof_flags_locked`, `proof_disputed` e `overdue_occurrence_blocks_edit` (todos em `taskErrorCodeSchema`). Ficam de fora do contrato `invalid_decision`, `invalid_consent_version` e `invalid_storage_path`.

## O que o destinatário precisa fazer

- Mapear as colunas novas em `packages/data` (hoje opcionais), tornando-as obrigatórias.
- Formulário de tarefa: travar os dois campos de prova para quem não pode mudar; aviso ao reagendar vencida; `requires_admin_approval` só com foto e tarefa `group`.
- Formulário de contexto: local opcional (`contextLocationSchema`).
- Lista e tela da tarefa: "em análise" (verde-claro, ícone e rótulo), motivo da contestação, e o botão de câmera no lugar do "concluir" em tarefas com foto. Isso se compõe por `children` com a feature `proof`.

## Bloqueios e dúvidas

Nenhum. `rls_tasks.test.sql` mudou em três pontos, todos consequência do ADR: 19 para 23 transições, `done → partial` por Duda agora é `forbidden`, e a fixture "Q6" também grava `auto_miss_at`.

## Como testar

`pnpm db:reset`, `pnpm db:test` (369 asserts de tarefas, 481 de prova), `pnpm db:check-permissions`, `pnpm typecheck`.
