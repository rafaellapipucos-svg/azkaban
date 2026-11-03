# Handoff: arquiteto para banco-de-dados, prova por foto e atraso preservado (F3-2)

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-01 17:08 (BRT)

## Contexto

Duas decisões entram juntas: a prova por foto, no [ADR-0007](../../adr/0007-prova-por-foto.md), e o atraso preservado ao reagendar, no [ADR-0005, seção 11](../../adr/0005-tarefas-ocorrencias-recorrencia.md). Os ADRs prevalecem sobre este resumo.

Assuma o cliente hostil chamando o REST direto, e confira `insert`, RPC e service role em cada regra.

## O que foi entregue

Branch `feat/proof-contracts`, a partir de `feat/phase-3-proof`.

## Contratos criados ou alterados

- `packages/contracts/src/proof.ts`: formas, limites de texto e `proofErrorCodeSchema`.
- `packages/contracts/src/tasks.ts`: `proofReviewStatusSchema`, ator `reviewer`, `checkApproval`, quatro códigos novos em `taskErrorCodeSchema`.
- `packages/contracts/src/occurrence-transitions.ts`: `done → partial`, `done → missed`, `partial → done` e `missed → done` para `reviewer`.
- `packages/contracts/src/contexts.ts`: `contextLocationSchema`.
- `packages/config/src/proof.ts`: `proofRules`, que vira a linha `proof_rules` de `app_settings`.
- `packages/core/src/permissions/matrix.ts`: `proof.review` para `owner` e `admin`.

`pnpm db:check-permissions` falha até esta entrega se juntar à do arquiteto.

## O que o destinatário precisa fazer

Uma migration por mudança. `reviewer` em `occurrence_actor` vai numa migration só dele, porque o valor novo de enum não pode ser usado na transação que o cria.

**Dados e regras.**

- Permissão `proof.review` e matriz. Linhas novas em `occurrence_transitions`. `proof_rules` em `app_settings` e um acessor como `task_rules()`.
- Estenda `scripts/check-permission-mirror.mjs`: compare `proof_rules` com `proofRules`, e `storage.buckets` de `task-proofs` com `maxBytes` e `contentType`.
- Enum `proof_review_status`, com os valores do contrato.
- `contexts`: `location_address`, `location_lat`, `location_lng`, `location_radius_m`. `check` de todos ou nenhum, raio de 20 a 5000, endereço até 200. `grant` por coluna como os demais campos editáveis.
- `profiles`: `proof_consent_version int`, `proof_consent_at timestamptz`. Sem `grant` de escrita.
- `tasks`: normalize `requires_admin_approval` para falso onde não há foto ou a tarefa é `private`, e depois crie o `check`.
- `task_occurrences`: `auto_miss_at not null`, preenchida com `overdue_at`; `current_proof_id` com FK para `task_proofs`; `proof_review_status`. Índice parcial em `auto_miss_at` onde `status = 'pending'`.
- `task_status_history`: `proof_review_status`.

**`proof_challenges`:** `id uuid default gen_random_uuid()` (é o nonce), `occurrence_id` com `on delete cascade`, `user_id`, `created_at`, `expires_at`, `used_at`. `unique (id, occurrence_id, user_id)`. Índices em `(user_id, created_at)` e `(occurrence_id, created_at)`. RLS ligada, sem política e sem `grant` a `anon` ou `authenticated`.

**`task_proofs`:**

- `id`, `occurrence_id` (`on delete cascade`), `challenge_id` (`unique`), `user_id` (`on delete set null`), `storage_path` (anulável), `sha256` (`unique`, `check` de 64 hexadecimais minúsculos), `size_bytes`, `width_px`, `height_px`.
- `captured_at_device`, `received_at`, `clock_delta_seconds`, `distance_m`, `accuracy_m`, `flags text[]` (`check` com `proofFlagSchema`), `platform`, `app_version`, `user_agent` (até 256).
- `review_status`, `reviewed_by` (`on delete set null`), `reviewed_at`, `review_note` (até 500), `superseded_at`, `photo_deleted_at`.
- FK composta `(challenge_id, occurrence_id, user_id)` para `proof_challenges (id, occurrence_id, user_id)`, com `match simple`: `user_id` nulo depois de excluir a conta não pode falhar.
- Sem `coordenadas`: `lat` e `lng` da seção 8 do prompt saem.
- `grant select` por coluna a `authenticated`, sem `storage_path` nem `challenge_id`, e política com `can_view_proof`. Nenhuma escrita.
- Índice parcial para a fila: `review_status = 'in_review' and superseded_at is null`. Outro para a retenção: `photo_deleted_at is null`.

**Bucket.** `task-proofs` por migration, `public = false`, `file_size_limit = 2097152`, `allowed_mime_types = '{image/jpeg}'`. Nenhuma política em `storage.objects`.

**Funções de acesso.** Seguem a tabela "Quem vê" da seção 10.

- `can_view_proof(proof)`: `can_view_task(tarefa)` e, além disso, autor, ou `visibility = 'group'` com `proof.review`.
- `can_review_proof(occurrence_id, author_id)`: membro atual, `proof.review`, tarefa `group`, não arquivada, e `auth.uid()` diferente do autor.

**Triggers.**

- `occurrences_before_schedule`: a regra da seção 11 do ADR-0005, com `auto_miss_at`.
- Novo `before insert` em `task_occurrences`: status diferente de `pending` em tarefa com foto dá `proof_required`. Confira com `grep` que nenhum caminho interno crie linha resolvida.
- `occurrences_before_status`, nesta ordem, depois do par válido:
  1. `new.status = 'done'` com `requires_photo_proof`: exige `current_proof_id` de prova desta ocorrência, sem `superseded_at`, e `proof_review_status` diferente de `disputed`. Senão, `proof_required`.
  2. `old.status = 'done'` e destino `partial` ou `missed`: exige `new.proof_review_status = 'disputed'`, e `new.late := new.status = 'partial' and old.late`. Sem o relógio.
  3. `old.status = 'partial'` e destino `done`: exige `new.proof_review_status = 'approved'`.
  4. `late`: com `new.status = 'done'` e `current_proof_id`, compare `task_proofs.received_at`, não `now()`, com `overdue_at`.
  5. `new.status = 'pending'`: zera `current_proof_id` e `proof_review_status`, além do que já faz.
- `occurrences_after_status`: extraia o XP para `occurrence_award_xp(occurrence)`. Pule quando `new.status = 'done'` e `new.proof_review_status = 'in_review'`. Grave `proof_review_status` no histórico. Saindo de uma prova para `pending`, marque `superseded_at`.
- `before update` em `task_proofs`: recusa mudança de `occurrence_id`, `challenge_id`, `sha256`, `received_at`, `captured_at_device`, e de `user_id` para outro valor não nulo.

**RPCs para `authenticated`.** Os erros levam o código na mensagem, como `set_occurrence_status`.

- `issue_proof_challenge(p_occurrence_id uuid) returns jsonb`: tabela da seção 2, na ordem. Formato `proofChallengeSchema`. Limites sob `pg_advisory_xact_lock(hashtextextended(uid::text, 0))`.
- `review_proof(p_proof_id uuid, p_decision text, p_to_status public.occurrence_status, p_note text) returns public.task_occurrences`: tabela da seção 10. Aprovar sem mudar status insere em `task_status_history` com `from_status = to_status`. Saindo de `in_review`, chama `occurrence_award_xp`.
- `record_proof_consent(p_version int)`: só aceita `consentVersion` atual.
- `set_occurrence_status`: destino `done` em tarefa com foto dá `proof_required`, para todos. `proof_review_status = 'disputed'` exige `can_review_proof`, senão `proof_disputed`, em qualquer transição.

**RPCs só para `service_role`**, com `revoke` de `public`, `anon` e `authenticated`:

- `claim_proof_challenge(p_nonce uuid, p_user_id uuid)`: `challenge_invalid` (inexistente ou de outro usuário), `challenge_expired`, `challenge_used`. Marca `used_at` e reconfere ocorrência, responsável e janela. Devolve `occurrence_id`, `created_at` do desafio, `received_at` e o local do contexto.
- `commit_proof(p_nonce uuid, p_user_id uuid, p_storage_path text, p_sha256 text, p_size_bytes int, p_width_px int, p_height_px int, p_captured_at_device timestamptz, p_distance_m int, p_accuracy_m int, p_flags text[], p_platform text, p_app_version text, p_user_agent text) returns jsonb`: seção 8, passo a passo. Resposta em `proofResultSchema`. O `set_config('request.jwt.claims', ..., true)` tem de ser local à transação. Violação de `unique (sha256)` responde `proof_duplicate`.
- Para a retenção: `proofs_due_for_retention(p_limit int)`, `mark_proof_photo_deleted(p_proof_id uuid)` (aprova `in_review`, com XP, e limpa os campos da seção 14), `orphan_proof_objects(p_limit int)` e `delete_stale_proof_challenges()`.
- Cron a cada hora para `proof-retention`, como o de `materialize-occurrences`.

**`edit_task`.**

- `proof_flags_locked` quando `requires_photo_proof` ou `requires_admin_approval` mudam, e quem edita não tem a tarefa própria nem `task.manage_group` em tarefa `group`. Logo depois de ler o formulário: `this` também cria tarefa.
- `overdue_occurrence_blocks_edit`, conforme a seção 11 do ADR-0005. `changed` hoje só é calculado em `all`, então compare a agenda também em `this_and_following`. Use o mesmo `perdoa` do trigger, numa função só.
- Filtro da reatribuição: `auto_miss_at > now()`, no lugar de `overdue_at > now()`.

Rode `pnpm db:types` no fim.

## Bloqueios e dúvidas

Nenhum bloqueio. `backend-funcoes` e `prova-foto` dependem das assinaturas acima. Se precisar mudar uma, avise por handoff.

## Como testar

`pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm db:types`, `pnpm check`. Escreva os testes antes e veja-os falhar. Prova em `supabase/tests/rls_proof.test.sql`.

**Atraso preservado:**

1. Tarefa própria vencida ontem, reagendada para amanhã: `overdue_at` não muda, `auto_miss_at` muda, `done` hoje dá `late`, XP `done_late`, sem `occurrence_done`.
2. O mesmo com `partial`: `late` verdadeiro, XP de `partial`.
3. Reagendada depois da janela: `done` responde `late_window_expired`.
4. Reagendada dentro da janela, resolvida depois que a janela do `overdue_at` original acabou: `late_window_expired`.
5. `missed → pending` por `editor`, reagendar, `done`: `late`.
6. `done` atrasado, reabrir, reagendar, `done`: `late`.
7. `this` em série: mesma linha, mesmo resultado.
8. Avulsa pelos escopos `this`, `this_and_following` e `all`.
9. Dois reagendamentos seguidos: mantém o primeiro `overdue_at`.
10. Não vencida: `overdue_at` acompanha a agenda.
11. Mover para mais cedo: `overdue_at` diminui.
12. Admin com `task.manage_group` reagenda a tarefa `group` de um membro: `overdue_at` novo, `done` sem `late`.
13. Admin em tarefa própria, ou como responsável: mantém.
14. Membro com `task.edit_assigned`, ajustado na matriz dentro do teste, em tarefa atribuída a ele: mantém.
15. `update` de `scheduled_*` como service role, sem `auth.uid()`: mantém.
16. Admin reatribui uma vencida de um membro para outro, com data nova: perdoa. Se o admin era o responsável antigo, ou passa a ser o novo: mantém.
17. `this_and_following` com mudança de agenda a partir de pendente vencida, por membro: `overdue_occurrence_blocks_edit`, e o mesmo escopo pelo admin passa.
18. `this_and_following` só com título: passa.
19. `all` deixando de repetir com pendente vencida: bloqueia.
20. Acrescentar repetição a uma avulsa reagendada para o futuro: bloqueia.
21. Reatribuir sem mudar agenda alcança a linha reagendada.
22. Linhas existentes têm `auto_miss_at = overdue_at` depois da migration.

**Seção 9 do prompt:**

23. Membro não marca verde em tarefa com foto: `proof_required`.
24. Usuário não apaga nem sobrescreve prova: `insert`, `update` e `delete` em `task_proofs`, e `insert`, `update`, `delete` e `select` em `storage.objects` do bucket, como `authenticated` e `anon`.

**Barreiras:**

25. Admin, `editor` e dono: `set_occurrence_status` com `done` dá `proof_required`, de `pending` e de `missed`.
26. Service role: `update status = 'done'` sem prova falha.
27. Service role: `insert` de ocorrência `done` em tarefa com foto falha.
28. `current_proof_id` de outra ocorrência, ou superada: falha.
29. `authenticated` chama `claim_proof_challenge` e `commit_proof`: sem permissão.
30. `authenticated` lê `proof_challenges`: nada.
31. Membro com só `task.edit_assigned` desliga a flag, por `this` e `all`: `proof_flags_locked`. Dono da tarefa própria e admin conseguem.
32. Tarefa sem foto: tudo igual ao ADR-0005.
33. `requires_admin_approval` em tarefa privada ou sem foto: `check`.

**Desafio:**

34. Uma linha da tabela da seção 2 para cada recusa, na ordem.
35. Outro usuário usa o nonce: `challenge_invalid`.
36. Dois `claim` do mesmo nonce: um vence, `challenge_used` no outro.
37. Vencido: `challenge_expired`.
38. Limites: a 31ª por hora, a 11ª na ocorrência, com 30 provas no dia.
39. Consentimento antigo depois de subir `consentVersion`.

**`commit_proof`:**

40. `status_changed_by` e `changed_by` iguais ao autor, não nulos.
41. Sem aprovação: `unreviewed`, XP na hora. Com aprovação: `in_review`, sem XP.
42. `received_at` antes de `overdue_at` e commit depois: `late` falso.
43. `received_at` depois de `overdue_at`: `done_late`.
44. `missed → done` dentro da janela e fora dela.
45. Ocorrência cancelada, reatribuída ou reaberta entre `claim` e `commit`: falha sem criar linha.
46. Assignee que deixou o grupo: falha.
47. `sha256` repetido: `proof_duplicate`.

**Revisão:**

48. Cada linha da tabela da seção 10, com o XP exato.
49. Autor com `proof.review` não revê a própria: `forbidden`.
50. Membro sem a chave: `forbidden`. Admin de outro grupo: `forbidden`.
51. Tarefa `private`: admin não vê nem revê.
52. Contestar depois do prazo mantém `late` falso. Desfazer recalcula pelo `received_at`.
53. Aprovar duas vezes: `proof_already_reviewed`, sem XP dobrado.
54. Prova superada: `proof_superseded`.
55. Contestada: assignee não reabre, não cancela e não pede desafio; `proof_disputed`. Outro admin reabre.
56. Histórico tem uma linha por decisão, em ordem.

**Reabrir:**

57. `done → pending`: zera os campos, marca `superseded_at`, compensa o XP, e a foto continua.
58. Em seguida, `done` exige nova prova.

**Visibilidade:**

59. Tabela "Quem vê" da seção 10, linha por linha, inclusive ex-membro e responsável por outro dia da série.
60. Admin do Grupo A não vê provas do Grupo B.
61. `storage_path` não é legível por `authenticated`.

**Retenção:**

62. `mark_proof_photo_deleted` em `in_review` aprova e dá XP uma vez, e não toca prova superada.
63. Trigger de imutabilidade recusa mudança de `sha256` como service role.
