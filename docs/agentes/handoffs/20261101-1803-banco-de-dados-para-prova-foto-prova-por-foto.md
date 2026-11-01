# Handoff: banco-de-dados para prova-foto, RPCs e leituras da prova (F3-4 a F3-6)

**De:** banco-de-dados
**Para:** prova-foto
**Data:** 2026-11-01 18:03 (BRT)

## Contexto

F3-2 está pronta no banco, na branch `feat/proof-db`. Estas são as superfícies que o cliente alcança. O [ADR-0007](../../adr/0007-prova-por-foto.md) prevalece. Erros chegam do PostgREST como `{ code, message }`: **`message` é o código** (`proof_required`, `challenge_rate_limited`...), `code` é o SQLSTATE. Os tipos gerados estão em `packages/data/src/database.types.ts`.

## O que foi entregue

Tudo com `execute` para `authenticated` (e negado a `anon`):

**`issue_proof_challenge(p_occurrence_id uuid) returns jsonb`** = `{ nonce, expiresInSeconds, checkLocation }`, que valida com `proofChallengeSchema`. Recusas, na ordem em que valem (a primeira que falha é a devolvida):

| `message`                | SQLSTATE | Quando                                                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `forbidden`              | `42501`  | Sem sessão, ocorrência invisível ou inexistente, tarefa arquivada, quem pede não é o responsável da ocorrência ou saiu do grupo |
| `proof_not_required`     | `P0001`  | A tarefa não exige foto                                                                                                         |
| `occurrence_not_open`    | `P0001`  | Estado fora de `pending` e `missed`                                                                                             |
| `proof_disputed`         | `P0001`  | Prova contestada na ocorrência (`missed` com `proof_review_status = 'disputed'`)                                                |
| `late_window_expired`    | `P0001`  | Depois de `overdue_at` + 72 h, sem `task.manage_group`                                                                          |
| `proof_consent_required` | `P0001`  | `profiles.proof_consent_version` ausente ou menor que `proofRules.consentVersion`                                               |
| `challenge_rate_limited` | `P0001`  | 30 desafios por hora do usuário, 10 por hora da ocorrência, ou 30 provas nas últimas 24 h                                       |

O desafio vale `challengeTtlSeconds` (300 s). Cada chamada bem-sucedida conta no limite, mesmo que a foto nunca saia.

**`record_proof_consent(p_version int) returns void`.** Só aceita a versão atual (`proofRules.consentVersion`); qualquer outra: `22023 invalid_consent_version`. Grava `proof_consent_version` e `proof_consent_at` do próprio usuário. O cliente não escreve essas colunas por `update`: `42501 permission denied for table profiles`. Ler elas em `profiles` (própria linha) funciona, e é como o app sabe se mostra o aviso.

**`review_proof(p_proof_id uuid, p_decision text, p_to_status public.occurrence_status, p_note text) returns public.task_occurrences`.** Mapeia `proofReviewInputSchema`:

- aprovar: `p_decision = 'approve'`, `p_to_status = null`, `p_note` opcional;
- contestar: `p_decision = 'dispute'`, `p_to_status` `partial` ou `missed`, `p_note` obrigatório (`22023 reason_required`).

Devolve a ocorrência já atualizada (colunas em `snake_case`, com `status`, `late`, `proof_review_status`, `current_proof_id`, `status_reason`). Erros: `forbidden` (`42501`; não é revisor, é o próprio autor, tarefa privada ou arquivada, ou a prova não existe), `proof_superseded` (a prova não é mais a corrente), `proof_already_reviewed` (mesma decisão; contestar de novo uma prova já contestada também cai aqui: para trocar de amarelo para vermelho, aprove antes), `22023 invalid_decision`, `23514 invalid_transition` (destino que não é `partial` nem `missed`). Efeitos e XP exatos estão na tabela da seção 10 do ADR, e `rls_proof.test.sql` cobre cada linha.

**`set_occurrence_status`** (já existia):

- `done` em tarefa com foto: `P0001 proof_required`, para qualquer pessoa. O botão de verde dessas tarefas é a câmera.
- Ocorrência com `proof_review_status = 'disputed'`: qualquer transição por essa RPC exige `proof.review` e ser outra pessoa que o autor. Senão, `P0001 proof_disputed`.
- `done → partial`, `done → missed`, `partial → done`, `missed → done` por `reviewer` não existem aqui. `done → partial` deixou de ser `invalid_transition` e passou a `42501 forbidden`.

**Leitura de `task_proofs`.** RLS por `can_view_proof`: o autor (com acesso à tarefa) e quem tem `proof.review` em tarefa `group`. Nada mais. Colunas legíveis (grant por coluna): `id, occurrence_id, user_id, sha256, size_bytes, width_px, height_px, captured_at_device, received_at, clock_delta_seconds, distance_m, accuracy_m, flags, platform, app_version, user_agent, review_status, reviewed_by, reviewed_at, review_note, superseded_at, photo_deleted_at`. **`storage_path` e `challenge_id` não são legíveis**, e `select *` falha com `42501 permission denied for table task_proofs`: liste as colunas. Não há escrita nenhuma para o cliente.

- Fila do grupo: `review_status = 'in_review'` e `superseded_at is null`, ordenado por `received_at` (há índice parcial). A tabela não tem `group_id`: junte por `occurrence_id` com `task_occurrences` e `tasks` (`select` liberado, e a RLS de cada uma vale). O autor com `proof.review` também aparece na fila das próprias provas; a tela esconde o botão, e o servidor responde `forbidden`.
- Prova corrente de uma ocorrência: `task_occurrences.current_proof_id` (legível por quem vê a ocorrência, mas a prova só abre para quem passa em `can_view_proof`). Sem prova corrente, `null`.
- A foto só sai por `proof-url`. O banco e o Storage não dão outro caminho: `authenticated` não lê, não envia, não sobrescreve e não apaga nada do bucket `task-proofs` (verificado pela API real do Storage, com `403`).

**`task_occurrences`** ganhou `proof_review_status` (`unreviewed | in_review | approved | disputed`, nulo sem prova corrente) e `current_proof_id`. "Em análise" é `status = 'done'` com `proof_review_status = 'in_review'`. `task_status_history` ganhou `proof_review_status`; uma aprovação sem mudança de status aparece com `from_status = to_status`.

**`contexts`** ganhou `location_address, location_lat, location_lng, location_radius_m`: todos preenchidos ou todos nulos (`23514 contexts_location_check`), raio de 20 a 5000, endereço de 1 a 200. Quem tem `context.manage` escreve (`insert` e `update` por coluna), quem vê o contexto lê.

## O que o destinatário precisa fazer

- `packages/data/src/proof`: uma função por RPC acima, sem inventar parâmetros. `submitProof` continua sendo o `POST` a `proof-validate`.
- Mostre `distance_m`, `accuracy_m` e `flags` ao revisor. Coordenadas não existem em lugar nenhum do banco.
- Trate `challenge_rate_limited`, `proof_consent_required`, `late_window_expired`, `proof_disputed`, `occurrence_not_open` e `proof_not_required` com mensagem própria; todos estão em `proofErrorCodeSchema`.
- `invalid_consent_version`, `invalid_decision` e `invalid_storage_path` não estão no contrato: só acontecem por defeito do cliente.

## Bloqueios e dúvidas

- Os efeitos de `review_proof` sobre XP e `late` estão no ADR e nos testes. Dúvida sobre o texto do aviso de contestação à Fase 4.
- Sem aprovar, o admin de um grupo de um só admin nunca revê a própria prova (ADR, seção 10).

## Como testar

`pnpm db:reset`, `pnpm db:test`. Os fluxos completos estão em `supabase/tests/rls_proof.test.sql`: desafio, revisão linha a linha, visibilidade e bucket.
