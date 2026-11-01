# Handoff: arquiteto para banco-de-dados, tarefas (F2-2)

**De:** arquiteto
**Para:** banco-de-dados
**Data:** 2026-11-01 09:35 (BRT)

## Contexto

Contratos da Fase 2 publicados antes das branches paralelas. As regras e os motivos estão no [ADR-0005](../../adr/0005-tarefas-ocorrencias-recorrencia.md), que prevalece sobre este resumo. Em caso de dúvida no modelo, a seção 8 do prompt mestre vale só onde o ADR não mudou nada.

## O que foi entregue

Branch `feat/tasks-contracts`, a partir de `feat/phase-2-tasks`.

## Contratos criados ou alterados

- `packages/contracts/src/tasks.ts`: formas de tarefa, ocorrência, histórico, Equipe, XP e códigos de erro.
- `packages/contracts/src/occurrence-transitions.ts`: `occurrenceTransitions`.
- `packages/config/src/tasks.ts`: `taskRules`, que vira a linha de `app_settings`.

Os limites de tamanho dos schemas Zod devem virar `check` iguais: título 120, notas 2000, motivo 500, duração de 1 a 1440.

## O que o destinatário precisa fazer

Uma migration por mudança. Nada de `delete` de tarefa ou ocorrência para o cliente.

**Permissões.** Nova migration com as 5 chaves e a matriz da seção 3 do ADR. `tarefas-calendario` faz o espelho em `matrix.ts`, e `pnpm db:check-permissions` falha até as duas entregas se juntarem.

**Tipos e tabelas.**

- Enums: `occurrence_status`, `schedule_type`, `task_visibility`, `task_difficulty`, `task_priority`, com os valores do contrato.
- `app_settings (key text primary key, value jsonb not null)`: leitura para `authenticated`, nenhuma escrita, linha `task_rules` igual a `taskRules`, inserida por migration.
- `occurrence_transitions (from_status, to_status, actor)`: uma linha por par e ator, leitura para `authenticated`, inserida por migration.
- `tasks`: id, context_id (not null), group_id, created_by, assignee_id (not null), title, notes, schedule_type, start_at, due_at, duration_min, timezone, rrule, exdates (`timestamptz[]`, padrão `{}`), reminders (jsonb), requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility, parent_task_id (`on delete set null`), materialized_until, archived_at, created_at.
- `task_occurrences`: id, task_id, assignee_id, scheduled_start e scheduled_due (not null), overdue_at (not null), status (padrão `pending`), late (padrão false), status_reason, status_changed_at, status_changed_by. Único em `(task_id, scheduled_start)`.
- `task_status_history`: id, occurrence_id, from_status, to_status, changed_by, changed_at, reason.
- `xp_events`: id, user_id, group_id, occurrence_id (`on delete set null`), amount, reason, created_at. `reason` como `check` com os valores de `xpEventReasonSchema`.
- `check` em `tasks` repetindo `checkSchedule` de `tasks.ts`, e `check (visibility = 'group' or assignee_id = created_by)`.
- Índices: `task_occurrences (assignee_id, scheduled_start)`, parcial em `overdue_at` onde `status = 'pending'`, `tasks (assignee_id)`, `tasks (group_id)`, `tasks (parent_task_id)`, e parcial em `tasks` onde `rrule is not null and archived_at is null`.

**Funções de acesso.** `can_view_task`, `can_edit_task` e `can_delete_task`, `stable`, `security definer`, `search_path = ''`, seguindo a seção 4 do ADR.

`can_view_task` em tarefa de grupo exige ser membro e uma destas: responsável, criador, responsável por alguma ocorrência da tarefa, ou `visibility = 'group'` com `task.view_group`. Em tarefa pessoal, só o responsável.

**Triggers.**

- `tasks` antes de inserir ou atualizar: preenche `group_id`, trava mudança de dono do contexto e aplica as regras de contexto pessoal e de atribuição (`task.create_for_others`, responsável membro do grupo).
- `tasks` depois de inserir, com `rrule` nula e `parent_task_id` nulo: cria a ocorrência. Depois de atualizar a agenda de uma avulsa: ajusta a ocorrência `pending`.
- `task_occurrences` antes de inserir ou de mudar `scheduled_*`: calcula `overdue_at` com `task_rules.autoMiss`. `end_of_day` é a meia-noite local, no fuso da tarefa, depois de `greatest(scheduled_start, scheduled_due - interval '1 second')`. Isso cobre `all_day`, cujo `scheduled_due` é exclusivo, e tarefa à meia-noite sem duração. Some `toleranceMinutes`.
- `task_occurrences` antes de mudar `status`: recusa par fora de `occurrence_transitions` com `invalid_transition`, calcula `late` e preenche `status_changed_*`.
- `task_occurrences` depois de mudar `status`: grava histórico e XP, conforme a seção 6 do ADR.

**RPCs.** Todas `security definer`, `search_path = ''`, sem acesso para `anon`. Mensagens de erro são os códigos de `taskErrorCodeSchema`, com o padrão `errcode` já usado na Fase 1.

- `set_occurrence_status(p_occurrence_id uuid, p_to_status, p_expected_status, p_reason text)` devolve a ocorrência. Ordem: `for update`, `status_conflict`, ator (`forbidden`), motivo (`reason_required`), janela (`late_window_expired`), update.
- `edit_task(p_occurrence_id uuid, p_scope, p_task jsonb, p_rrule text, p_head_rrule text)` devolve `uuid[]`, as tarefas a materializar. Exige `can_edit_task`. Com `p_head_rrule` nulo, `this_and_following` segue como `all`. Em `this`, ignora `p_rrule`.
- `delete_task(p_occurrence_id uuid, p_scope, p_head_rrule text)` devolve nada. Exige `can_delete_task`. `this` com ocorrência `pending` ou `missed` segue a transição para `cancelled`.
- `team_overview(p_group_id uuid, p_from date, p_to date)` devolve as linhas de `teamOverviewRowSchema`. Exige `task.view_group`. Conta só tarefas `group` do grupo e membros atuais, ignora `cancelled`, e o dia é o local de `scheduled_start` no fuso da tarefa. `late` conta ocorrências com `late = true`.

As tabelas de escopos estão na seção 8 do ADR.

**RLS e privilégios.**

- `tasks` select: `can_view_task(id)`. Insert só das colunas do formulário, mais `rrule`, com `created_by = auth.uid()`.
- `task_occurrences` e `task_status_history` select: `can_view_task(task_id)`.
- `xp_events` select: `user_id = auth.uid()`.
- Nada mais para o cliente.

**Cron da materialização.** `cron.schedule` diário às 06:00 UTC, com `net.http_post` para `materialize-occurrences`, enviando o header `x-cron-secret`. URL e segredo vêm do Vault, nunca da migration. Sem segredo no Vault, o job não faz nada. Nomes combinados com `backend-funcoes`: `materialize_url` e `cron_secret`.

**Espelho.** Estenda `scripts/check-permission-mirror.mjs` para comparar também `taskRules` com `app_settings` e `occurrenceTransitions` com `occurrence_transitions`. Node 24 importa os dois arquivos `.ts` direto, porque foram escritos sem importações em tempo de execução.

**Depois:** `pnpm db:types`.

## Bloqueios e dúvidas

- A regra da prova e `proof_review_status` são da Fase 3. Não bloqueie `done` por `requires_photo_proof` agora.
- O job de vermelho automático é F4-6.
- Se algo no modelo se mostrar inviável, handoff de volta. Não mude contrato em silêncio.

## Como testar

`pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`. Os testes de RLS precisam cobrir, além da seção 9 do prompt mestre:

- `update` direto em `status` falha para `authenticated`;
- transição fora da tabela falha mesmo com service role;
- admin de outro grupo não vê nada, e admin não vê tarefa `private`;
- membro não cancela tarefa de admin, mas muda o estado dela;
- quem saiu do grupo perde o acesso;
- `done` depois de `overdue_at` grava `late`, XP reduzido, histórico;
- depois da janela, membro recebe `late_window_expired` e admin consegue;
- reabrir soma zero em `xp_events`;
- os três escopos de edição e de exclusão, com `this` preservando o `id`, o histórico e o XP.
