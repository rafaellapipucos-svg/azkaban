# Handoff: banco-de-dados para backend-funcoes, prova por foto (F3-3 e F3-7)

**De:** banco-de-dados
**Para:** backend-funcoes
**Data:** 2026-11-01 18:03 (BRT)

## Contexto

F3-2 está pronta no banco. As assinaturas abaixo são as que existem hoje em `supabase/migrations/20261101170000` a `172000`, na ordem do [ADR-0007](../../adr/0007-prova-por-foto.md), que prevalece sobre este resumo. Os erros chegam pelo PostgREST como `{ code, message }`: **`message` é o código do contrato** (`challenge_used`, `proof_duplicate`...) e `code` é o SQLSTATE. Mapeie pela `message`.

## O que foi entregue

Branch `feat/proof-db`, a partir de `feat/phase-3-proof`. Todas as RPCs abaixo têm `execute` só para `service_role` (`anon` e `authenticated` recebem `42501 permission denied for function ...`). Nada aqui fala com o Storage: remover objeto é com você.

## Contratos criados ou alterados

**`claim_proof_challenge(p_nonce uuid, p_user_id uuid) returns jsonb`**

```json
{
  "occurrenceId": "<uuid>",
  "challengeCreatedAt": "<instante>",
  "receivedAt": "<instante>",
  "location": { "lat": -23.55, "lng": -46.63, "radiusM": 150 }
}
```

`location` é `null` quando o contexto não tem local. `receivedAt` é o `used_at` do desafio e vira `task_proofs.received_at`: não calcule outro. Erros, nesta ordem:

| `message`             | SQLSTATE | Quando                                                              |
| --------------------- | -------- | ------------------------------------------------------------------- |
| `challenge_invalid`   | `P0001`  | Nonce inexistente ou de outro usuário                               |
| `challenge_used`      | `P0001`  | Já marcado. Dois `claim` simultâneos: um vence, o outro recebe este |
| `challenge_expired`   | `P0001`  | Passou de `expires_at` e não foi usado                              |
| `forbidden`           | `42501`  | Tarefa arquivada, ocorrência de outro responsável, ou saiu do grupo |
| `proof_not_required`  | `P0001`  | A tarefa deixou de exigir foto                                      |
| `occurrence_not_open` | `P0001`  | Estado fora de `pending` e `missed`                                 |
| `proof_disputed`      | `P0001`  | Prova contestada na ocorrência                                      |
| `late_window_expired` | `P0001`  | Fora de `overdue_at + 72 h`, sem `task.manage_group`                |
| `challenge_invalid`   | `P0001`  | A ocorrência foi reaberta depois que o desafio foi emitido          |

As seis últimas linhas são reconferências: se falharem, o `claim` inteiro volta atrás, **o nonce não é consumido**, e você ainda não leu o corpo. Depois de um `claim` bem-sucedido, qualquer falha exige outro desafio.

**`commit_proof(p_nonce uuid, p_user_id uuid, p_storage_path text, p_sha256 text, p_size_bytes int, p_width_px int, p_height_px int, p_captured_at_device timestamptz, p_distance_m int, p_accuracy_m int, p_flags text[], p_platform text, p_app_version text, p_user_agent text) returns jsonb`**

Resposta no formato de `proofResultSchema`: `{ proofId, occurrenceId, status: "done", reviewStatus, receivedAt, late, flags }`.

- `p_storage_path` tem de ser exatamente `<occurrence_id>/<nonce>.jpg`. Outro valor: `22023 invalid_storage_path`. É o caminho que o ADR manda; a tabela repete a conferência com `check`.
- `p_flags` é o que **você** calculou (`out_of_radius`, `location_missing`, `clock_mismatch`). O banco **não** calcula flag nenhuma: só remove repetidas e ordena. Valor fora dessas três: `23514 ... task_proofs_flags_check`.
- `clock_delta_seconds` é do banco: `received_at - p_captured_at_device`, limitado ao intervalo de `int` (um relógio do ano 2200 não estoura).
- `p_distance_m` e `p_accuracy_m` guardam só números. `lat` e `lng` não têm coluna nem parâmetro.
- `p_platform` aceita `web`, `ios`, `android`; `p_app_version` até 40; `p_user_agent` até 256 (corte você). Violação: `23514`.
- Também confere de novo o tamanho (`proof_too_large`) e as arestas (`proof_bad_dimensions`) contra `proof_rules`. É redundância; sua checagem vem antes.
- Erros: `challenge_invalid` (nonce desconhecido, de outro usuário, ou **ainda não reivindicado**), as mesmas reconferências do `claim`, `proof_too_large`, `proof_bad_dimensions`, `invalid_storage_path`, `proof_duplicate` (`23505`, `sha256` já existe em qualquer ocorrência) e `challenge_used` (`P0001`, só em corrida).
- Se falhar, nada é gravado (transação única). Remova o objeto que você subiu.
- Ele assume a identidade do autor por `set_config('request.jwt.claims', ..., true)` e **restaura** o valor anterior antes de retornar. Verificado em transações separadas: depois do `commit`, `auth.uid()` volta a nulo.
- Efeitos: ocorrência vai a `done`; `reviewStatus` é `in_review` se `tasks.requires_admin_approval`, senão `unreviewed`. Com `unreviewed`, o XP é concedido no ato. `late` usa `received_at`, não o instante do commit.

**Retenção** (`proof-retention`):

| Função                                      | Retorno                                   |
| ------------------------------------------- | ----------------------------------------- |
| `proofs_due_for_retention(p_limit int)`     | `table(proof_id uuid, storage_path text)` |
| `mark_proof_photo_deleted(p_proof_id uuid)` | `void`                                    |
| `orphan_proof_objects(p_limit int)`         | `table(name text)`                        |
| `delete_stale_proof_challenges()`           | `int` (linhas apagadas)                   |

- `proofs_due_for_retention`: provas com `received_at < now() - retentionDays` e `photo_deleted_at is null`, as mais antigas primeiro. `p_limit` é limitado a 1000, no mínimo 1.
- `mark_proof_photo_deleted`: chame **depois** de remover o objeto. Aprova (com XP, uma vez) a prova `in_review` corrente, `reviewed_by` nulo e `review_note = 'retention_auto_approved'`; não aprova prova superada; zera `storage_path`, `user_agent`, `distance_m` e `accuracy_m`. Repetir, ou passar um id que sumiu, não falha.
- `orphan_proof_objects`: objetos de `task-proofs` com mais de 24 h e sem linha cujo `storage_path` seja o `name`. Cobre função que morreu entre o upload e o commit, grupo apagado em cascata e conta excluída. Remova pela API do Storage. **Apagar `storage.objects` por SQL falha**: a Supabase tem o trigger `protect_objects_delete` ("Direct deletion from storage tables is not allowed").
- Cron: job `proof-retention`, `0 * * * *`, chama `public.call_proof_retention()`. Ele lê no Vault `proof_retention_url` (URL da função) e `cron_secret` (o mesmo de `materialize-occurrences`), com o cabeçalho `x-cron-secret`. Sem os dois segredos, não faz nada. **Crie `proof_retention_url` no Vault ao implantar.**

**Para `proof-url`.** O usuário não lê `storage_path` nem `challenge_id` de `task_proofs` (grant por coluna). Com o JWT dele, leia só `id` (ou as colunas do `taskProofSchema`): a RLS devolve a linha se `can_view_proof`. Só depois, com service role, leia `storage_path`. `select *` com o JWT do usuário dá `42501 permission denied for table task_proofs`.

## O que o destinatário precisa fazer

- `proof-validate`: chame `claim_proof_challenge` no passo 3 e `commit_proof` no 11, como no handoff do arquiteto. O passo 9 (`clock_mismatch`) continua com você.
- `proof-retention`: use as quatro funções acima, nessa ordem de uso.
- `materialize-occurrences` não muda: o `insert` é de ocorrência `pending`, que o novo trigger aceita. Se alguém inserir uma linha já resolvida em tarefa com foto, ela recebe `P0001 proof_required`, que o `REFUSAL` da função já trata como recusa.
- Mapeie `42501 forbidden`, `P0001` e `23505 proof_duplicate` para os códigos de `proofErrorCodeSchema`.

## Bloqueios e dúvidas

- Comportamento do Storage local, verificado em 2026-11-01: `service_role` sobe `image/jpeg` (200); mesmo caminho de novo sem `upsert` dá `409 Duplicate`; PNG dá `415 invalid_mime_type`; 2 MiB mais 1 byte dá `413 EntityTooLarge`; exatamente 2 MiB passa. `authenticated` e `anon` recebem `403` ao enviar, ao assinar URL de envio e ao listar (lista vazia).
- O limite de corpo de uma Edge Function hospedada continua sem número. Não é do banco.
- `commit_proof` não valida os bytes nem a imagem: isso é da função.

## Como testar

`pnpm db:reset`, `pnpm db:test` (`rls_proof.test.sql` tem os fluxos de `claim`, `commit`, retenção e órfãos), `pnpm db:check-permissions`. Para uma chamada de ponta a ponta, crie o desafio como o usuário (`issue_proof_challenge`), `claim` e `commit` como `service_role`, em transações separadas.
