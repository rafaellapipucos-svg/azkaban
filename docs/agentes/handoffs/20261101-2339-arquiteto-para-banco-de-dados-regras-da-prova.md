# Handoff: arquiteto para banco-de-dados, regras da prova depois da revisão

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-01 23:39 (BRT)
**Branch:** `docs/proof-security-decisions`

## Contexto

Decisões sobre SEG-1, 2, 3, 5, 7, 8, 9 e o item 1 do QA, na [seção 20 do ADR-0007](../../adr/0007-prova-por-foto.md). O ADR prevalece sobre este resumo. Você entra primeiro: `backend-funcoes`, `tarefas-calendario` e `prova-foto` dependem daqui.

## O que foi entregue

ADR-0007 atualizado e contratos em `packages/contracts/src/tasks.ts`.

## Contratos criados ou alterados

- `taskSchema.proofFlagsLocked`, com `default(false)` para a leitura não quebrar antes da sua migration.
- `taskRuleChangeSchema` e `taskRuleFieldSchema`: as colunas abaixo.
- `taskErrorCodeSchema`: `proof_visibility_locked`.

## O que o destinatário precisa fazer

Uma migration por mudança, nesta ordem.

**1. `tasks.proof_flags_locked`:** `boolean not null default false`. Sem `grant` de `insert`: o `grant` da tabela é por coluna, então nada a mudar. Não preencha as linhas antigas.

**2. `can_delete_task`:** o caminho de tarefa própria passa a exigir `not t.proof_flags_locked`. `set_occurrence_status` e `delete_task` herdam isso. Não mexa em `can_edit_task`: o dono segue editando título e horário.

**3. `edit_task`,** em cima de `20261101172000`. Troque a checagem das flags, logo depois de ler o formulário:

```sql
own := t.created_by = uid and t.assignee_id = uid;
manager := t.group_id is not null and t.visibility = 'group'
  and public.has_permission(t.group_id, 'task.manage_group');
flags_changed := f."requiresPhotoProof" is distinct from t.requires_photo_proof
  or f."requiresAdminApproval" is distinct from t.requires_admin_approval;

if (flags_changed and not (manager or (own and not t.proof_flags_locked)))
  or (f.visibility = 'private' and t.proof_flags_locked) then
  raise exception 'proof_flags_locked' using errcode = '42501';
end if;

locked := case
  when flags_changed and not own
    then f.visibility = 'group' and (f."requiresPhotoProof" or f."requiresAdminApproval")
  else t.proof_flags_locked
end;
```

Depois de normalizar `scope`, ao lado de `private_with_other_assignee`:

```sql
if f.visibility is distinct from t.visibility and exists (
  select 1
  from public.task_occurrences o
  join public.task_proofs p on p.occurrence_id = o.id
  where o.task_id = t.id
    and case scope
      when 'all' then true
      when 'this' then o.id = occ.id
      else o.status <> 'pending' and o.scheduled_start >= occ.scheduled_start
    end
) then
  raise exception 'proof_visibility_locked' using errcode = '23514';
end if;
```

`else` é `this_and_following`: só as linhas resolvidas vão para a tarefa nova. Grave `locked` no `update` de `all` e no `insert` da tarefa nova. Nos dois escopos de divisão, a tarefa original fica com a coluna como está.

**4. `task_rule_changes`:** `id uuid`, `task_id` com `on delete cascade`, `field text` com `check` dos três valores de `taskRuleFieldSchema`, `from_value text not null`, `to_value text not null`, `changed_by` com `on delete set null`, `changed_at`. Índice em `(task_id, changed_at)`. RLS com `select` por `can_view_task(task_id)`, e só `grant select`.

Trigger `after insert or update of requires_photo_proof, requires_admin_approval, visibility` em `tasks`. No `update`, compara com `old`. No `insert`, compara com a tarefa de `parent_task_id`, e sai se ela for nula. Uma linha por regra diferente, com `changed_by = auth.uid()`:

```sql
insert into public.task_rule_changes (task_id, field, from_value, to_value, changed_by)
select new.id, c.field, c.before, c.after, auth.uid()
from (values
  ('requires_photo_proof', prev.requires_photo_proof::text, new.requires_photo_proof::text),
  ('requires_admin_approval', prev.requires_admin_approval::text, new.requires_admin_approval::text),
  ('visibility', prev.visibility::text, new.visibility::text)
) as c (field, before, after)
where c.before is distinct from c.after;
```

**5. `can_review_proof`:** tire `and t.archived_at is null` e o "not archived" do comentário. `set_occurrence_status` testa `archived_at` antes, então continua recusando. Confira se o `dispute` e o `approve` de `review_proof` passam em tarefa arquivada: nenhum trigger olha `archived_at`, pela leitura.

**6. Limites (SEG-3):**

- `alter table public.proof_challenges drop constraint` da chave de `occurrence_id`. A composta de `task_proofs` referencia a tabela, não depende dessa.
- Em `issue_proof_challenge`, o terceiro limite passa a ser `count(*) from proof_challenges c where c.user_id = uid and c.used_at > now() - interval '1 day'`, comparado com `maxProofsPerUserPerDay`.
- `proof_assert_open`, primeira linha: `if p_occ.id is null then raise exception 'challenge_invalid' using errcode = 'P0001'; end if;`. Hoje uma ocorrência sumida passaria nulo por todos os testes até o `update`.
- `delete_stale_proof_challenges` fica como está. O limite pode perder no máximo os 5 minutos do nonce nas bordas das 24 horas, e isso é aceito.

**7. `proof_consents`:** `user_id` com `on delete cascade`, `version int check (version > 0)`, `accepted_at timestamptz not null default now()`, `primary key (user_id, version)`. Copie o que já existe em `profiles`. RLS com `select` da própria linha, sem escrita. `record_proof_consent` faz `insert ... on conflict do nothing` e mantém o `update` de `profiles`.

**8. `proof_rules`, e `packages/config/src/proof.ts` no mesmo commit.** Você recebe autorização para editar esse arquivo aqui, porque o espelho de `check-permission-mirror.mjs` não pode divergir entre commits:

- `consentVersion: 2`;
- `recordRetentionDays: 365`, com o comentário "How long a proof row outlives its photo. ADR-0007, section 20.".

`public.delete_expired_proof_records(p_limit int) returns int`, `security definer`, `execute` só para `service_role`. Apaga, das mais antigas, até `p_limit` linhas com `photo_deleted_at is not null` e `received_at` além de `recordRetentionDays`. A chave composta zera `current_proof_id`, e `occurrences_before_status` não reage, porque o status não muda.

**9. Comentário de `user_id` (SEG-7):** `comment on column public.task_proofs.user_id` dizendo que a exclusão da conta apaga a prova pela ocorrência, e que o nulo só alcança prova superada de ocorrência de outra pessoa. Sem mudança de schema. Pode ir na migration 6.

**SEG-8:** nada a fazer. `proofs_due_for_retention` continua sem olhar `review_status`.

Depois: `pnpm db:types` e testes.

## Bloqueios e dúvidas

Nenhum. Só a fixture de `rls_tasks.test.sql:487`, do handoff `20261101-2310`, que segue à parte.

## Como testar

`pnpm db:test` e `pnpm db:check-permissions`, que precisa continuar em dia. Em `supabase/tests/rls_proof.test.sql`, cubra:

- SEG-1: admin liga a foto na tarefa própria do membro; o membro recebe `proof_flags_locked` ao desligar, ao levar a `private` e em `edit_task` `this`. `delete_task` e `set_occurrence_status(cancelled)` dão `forbidden`. O admin desliga as duas flags, a coluna volta a falso e o membro recupera a exceção. A tarefa nova de uma divisão herda a coluna.
- Rastro: uma linha por regra, com o autor, inclusive na divisão. Colega sem acesso à tarefa não lê.
- SEG-2 e SEG-9: `proof_visibility_locked` nos dois sentidos, com prova corrente, superada e contestada, em `all` e `this_and_following`. Um `this_and_following` com linhas sem prova passa.
- Arquivada: `review_proof` aprova e contesta, e `set_occurrence_status` segue `forbidden`.
- SEG-3: 30 desafios consumidos, grupo apagado, novo desafio responde `challenge_rate_limited`. Nonce com a ocorrência apagada responde `challenge_invalid`. Apagar o grupo com prova não falha.
- `proof_consents`: dois aceites da mesma versão deixam uma linha.
- `delete_expired_proof_records`: não toca linha com foto, nem linha dentro do prazo, e a ocorrência fica `done`.
