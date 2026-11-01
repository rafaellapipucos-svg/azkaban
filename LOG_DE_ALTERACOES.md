# Log de Alterações

## ⚠️ Instruções para qualquer IA que trabalhar neste repositório

(Claude, GPT/Codex, Gemini, Copilot, Cursor ou qualquer outra — leia antes de alterar qualquer coisa)

1. Antes de começar, leia: este cabeçalho, as últimas 10 entradas deste log, o `AGENTES.md`, o `CLAUDE.md`/`AGENTS.md`, `docs/arquitetura.md` e os ADRs em `docs/adr/`.
2. Ao terminar cada bloco de trabalho (antes de cada commit/PR), adicione UMA entrada NO FINAL deste arquivo.
3. Identifique-se no título da entrada exatamente neste formato:
   `### [Nome da IA] de [Nome da pessoa] — AAAA-MM-DD HH:mm (BRT)`
   Exemplos:
   `### Claude de Rafaell — 2026-11-01 14:32 (BRT)`
   `### GPT de Davi — 2026-11-02 09:10 (BRT)`
4. Como obter os dados (nunca invente):
   - Nome da pessoa: pergunte a ela ou use `git config user.name`.
   - Data e hora: rode `TZ=America/Sao_Paulo date "+%Y-%m-%d %H:%M"`. No Git Bash do Windows esse comando devolve UTC; lá, use o PowerShell: `(Get-Date).ToString('yyyy-MM-dd HH:mm')` se o fuso da máquina for o de Brasília.
   - Nome da IA: o nome do seu modelo/ferramenta (Claude, GPT, Gemini...).
5. Nunca edite nem apague entradas antigas. Correções viram uma nova entrada.
6. Em conflito de merge neste arquivo, mantenha as duas entradas, em ordem de data.
7. Seja específico: o que mudou, por quê, onde, como testar e o que ficou pendente.
8. Respeite a arquitetura e os ADRs. Se discordar, crie um ADR propondo a mudança — não mude silenciosamente.

### Modelo de entrada

```markdown
### [IA] de [Pessoa] — AAAA-MM-DD HH:mm (BRT)

- **Branch:**
- **Agente(s):** (se aplicável)
- **Resumo:** 1–2 frases
- **Alterações:**
  - ...
- **Arquivos/módulos principais:**
- **Migrations:** (nome ou "nenhuma")
- **Decisões/ADRs:**
- **Como testar:**
- **Pendências / próximos passos:**
```

---

## Entradas

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 08:29 (BRT)

- **Branch:** chore/phase-0-foundation
- **Agente(s):** orquestrador
- **Resumo:** Fase 0 entregue: documentação base, monorepo, app Expo rodando na web com tokens e i18n, fronteiras verificadas, CI e Supabase local.
- **Alterações:**
  - Documentação: `CLAUDE.md`, `AGENTS.md`, `AGENTES.md`, 12 subagentes em `.claude/agents/`, `docs/arquitetura.md`, ADRs 0001 a 0003, `docs/agentes/QUADRO.md` com o backlog das Fases 0 a 8, e cópia da especificação em `docs/PROMPT_MESTRE.md`.
  - Monorepo pnpm + Turborepo, com pacotes base e nove features. Expo SDK 58, React Native 0.88, TypeScript 6.
  - `packages/config` com env validado por Zod, que recusa chave secreta em variável pública.
  - `packages/ui` com tokens próprios e `StatusBadge`; `packages/i18n` com pt-BR por módulo; tela inicial em `packages/features/auth`.
  - dependency-cruiser, ESLint, Prettier, Husky, lint-staged, commitlint e GitHub Actions.
- **Arquivos/módulos principais:** `apps/app`, `packages/*`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `supabase/config.toml`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0001, ADR-0002 e ADR-0003, todos aguardando validação. `darkMode: 'class'` no NativeWind, porque `media` dispara erro na web; `useSystemColorScheme` acompanha o sistema. Playwright fica para a primeira entrega com fluxo real, F8-2 ou antes.
- **Como testar:** `pnpm install`, copiar os dois `.env.example` para `.env.local`, `pnpm check` e `pnpm dev`. O app abre em http://localhost:8081.
- **Verificado:** `pnpm check` e `pnpm build:web` passam. Tela conferida em 375px, nos temas claro e escuro, com console limpo. Importações proibidas plantadas de propósito foram barradas por `pnpm boundaries`. `supabase db reset` funcionou no banco local. O projeto hospedado respondeu, sem migrations aplicadas.
- **Não verificado:** o CI nunca rodou, porque nada foi enviado ao GitHub. O app não foi testado em iOS nem Android.
- **Pendências / próximos passos:** respostas do humano às perguntas da seção 15 e aprovação para a Fase 1. O nome do app é provisório.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 09:10 (BRT)

- **Branch:** feat/phase-1-accounts, criada a partir de chore/phase-0-foundation
- **Agente(s):** orquestrador; revisor-seguranca como subagente de leitura
- **Resumo:** Fase 1 entregue: contas, perfil, grupos, convites, papéis, permissões com RLS, áreas, contextos, design system base, mascote e onboarding de boas-vindas.
- **Alterações:**
  - Banco: cinco migrations com RLS e privilégios por coluna, seed de áreas e 56 testes pgTAP.
  - Domínio: `can()` e `safeInternalPath` em `packages/core`, com testes; contratos em `packages/contracts`; repositórios em `packages/data`.
  - Telas: boas-vindas, entrar, criar conta, link mágico, perfil, grupos, detalhe do grupo, convite por código, link e QR, início com áreas e contextos.
  - Design system: botões 3D, campos, cards, chips, estados vazios, mascote Broto e página `/design-system`, só em desenvolvimento.
  - Qualidade: Playwright com 4 fluxos E2E, `pnpm db:check-permissions` e CI com banco e E2E.
- **Arquivos/módulos principais:** `supabase/`, `packages/core`, `packages/data`, `packages/ui`, `packages/features/{auth,groups,contexts}`, `apps/app/app`, `e2e/`
- **Migrations:** 20261101120000_profiles, 20261101120100_permissions, 20261101120200_groups, 20261101120300_group_invites, 20261101120400_areas_contexts. Aplicadas só no banco local.
- **Decisões/ADRs:** ADR-0004. ADRs 0001 a 0003 passam a aceitos.
- **Como testar:** `pnpm db:start`, `pnpm dev`, depois `pnpm db:test`, `pnpm db:check-permissions`, `pnpm check` e `pnpm e2e`.
- **Verificado:** todos os comandos acima passam, além de `pnpm build:web`. Telas conferidas em 375px, claro e escuro. Uma política RLS enfraquecida de propósito fez os testes reprovarem. Os achados 1, 2, 3, 4, 5, 7 e 8 da revisão de segurança foram corrigidos, e o 6 em parte.
- **Não verificado:** CI no GitHub, migrations no projeto hospedado, e iOS e Android. Os exploits do revisor foram cobertos por testes pgTAP equivalentes, exceto a corrida da transferência de posse, que só tem teste do caminho de erro.
- **Pendências / próximos passos:** rate limiting (F8-4). Convite por telefone e login por OTP na Fase 5. Upload de avatar sem fase definida. Link mágico nativo em F8-7. Conferir no painel do Supabase: confirmação de e-mail ligada, senha mínima 8 e redirecionamentos sem curinga.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 09:37 (BRT)

- **Branch:** feat/tasks-contracts, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** Contratos da Fase 2 publicados (F2-1) e regra de "concluído atrasado" decidida (F2-11), antes das branches paralelas de banco, tarefas e funções.
- **Alterações:**
  - `packages/contracts` dividido por módulo, sem mudar o que existia, com tarefa, ocorrência, transições, histórico, recorrência amigável, escopos de edição, visão Equipe, XP, códigos de erro e o corpo da materialização.
  - `packages/config/src/tasks.ts`: `taskDefaults` e `taskRules`.
  - ADR-0005 com a regra de atraso, os refinos da seção 8, a matriz com 5 chaves, a tabela de transições, a garantia no banco, XP, materialização e os três escopos.
  - Handoffs para `banco-de-dados`, `tarefas-calendario` e `backend-funcoes`.
  - Teste de unidade dos contratos, com `vitest` em `packages/contracts`.
- **Arquivos/módulos principais:** `packages/contracts/src`, `packages/config/src/tasks.ts`, `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`, `docs/arquitetura.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005. Janela de atraso de 72 horas. Chave extra `task.manage_group`. Banco como único escritor de `xp_events`, e por isso F2-12 encolhe. `taskRules` e `occurrenceTransitions` ganham espelho no banco. Checklist e comentários ficam fora da Fase 2.
- **Como testar:** `pnpm install` e `pnpm check`.
- **Verificado:** `pnpm check` passa. O Node 24 carrega `occurrence-transitions.ts` e `config/src/tasks.ts` direto, o que `pnpm db:check-permissions` vai precisar.
- **Não verificado:** nada disso foi exercitado contra um banco ou uma Edge Function: o desenho só se prova em F2-2 e F2-5. O empacotamento de `packages/core` no deploy de Edge Functions não foi testado.
- **Pendências / próximos passos:** implementar F2-2 a F2-10 e F2-12 a partir dos handoffs. Checklist e comentários não têm item no QUADRO.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 09:51 (BRT)

- **Branch:** feat/tasks-core, criada a partir de feat/phase-2-tasks
- **Agente(s):** tarefas-calendario
- **Resumo:** Domínio puro de tarefas em `packages/core` (F2-3, F2-4 e a parte de exibição de F2-12): atores, transições, janela de atraso, XP para a tela, RRULE, expansão em hora local e divisão de série. Sem telas nesta etapa.
- **Alterações:**
  - `packages/core/src/tasks`: `deriveActors` e `canManageGroupTask` (ADR-0005, seção 4), `canTransition` e `availableTransitions` sobre `occurrenceTransitions` sem copiar a tabela, `requiresReason`, janela de atraso (`isLate`, `lateWindowEnd`, `isLateWindowOpen`, `isOverdue`) e `occurrenceXp`.
  - `packages/core/src/recurrence`: `toRRule` e `fromRRule`, `expandOccurrences` (hora local no fuso da tarefa, EXDATE, âncora, COUNT, UNTIL, `monthDay` 29 a 31 no último dia do mês) e `splitRecurrence` (`headRrule` nulo quando o pivô é a primeira ocorrência, `COUNT` da cauda igual ao que resta).
  - `packages/core/src/permissions/matrix.ts`: as 5 chaves `task.*` do ADR-0005 para `owner` e `admin`, mais `matrix.test.ts`.
  - Dependência nova: `rrule` (catálogo do pnpm). 301 testes em `packages/core`, em tabelas.
- **Arquivos/módulos principais:** `packages/core/src/{tasks,recurrence,permissions}`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhum ADR novo. `date-fns` e `date-fns-tz` ficaram de fora: o `getTimezoneOffset` da 3.2.0 erra ao redor da virada de horário de verão e o `fromZonedTime` depende do fuso da máquina na hora repetida, então a conversão local/UTC usa só `Intl` (`recurrence/zone.ts`). `monthDay` 29 a 31 vira `BYMONTHDAY=28,...,d;BYSETPOS=-1`. `UNTIL` da cabeça da série é o fim do dia local anterior ao pivô. Escolhas e dúvidas estão no handoff para o `arquiteto`.
- **Como testar:** `pnpm install` e `pnpm check`. Os testes de `packages/core` também passam com `TZ=Asia/Tokyo` e `TZ=America/New_York`.
- **Verificado:** `pnpm check` passa. Virada de horário de verão testada em `America/New_York` (março e novembro, hora inexistente e hora repetida) e em `America/Sao_Paulo`, inclusive a meia-noite inexistente de 2018. A divisão foi conferida pela propriedade "cabeça + cauda = série original" em 5 regras e 11 pivôs.
- **Não verificado:** execução dentro do Deno (nada no módulo é específico do Node, mas o empacotamento da Edge Function é de `backend-funcoes`). `pnpm db:check-permissions` não roda sozinho nesta branch: o banco ainda não tem as 5 chaves novas, que chegam com a branch de `banco-de-dados`.
- **Pendências / próximos passos:** telas e repositórios (F2-6 a F2-10) depois da integração do banco. Pedido de contrato ao `arquiteto`: `OccurrenceListItem.task` precisa de `createdBy`, `groupId` e `difficulty` para a UI derivar atores e mostrar XP.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 09:58 (BRT)

- **Branch:** feat/tasks-contracts-list, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** Pedido de `tarefas-calendario` atendido: `OccurrenceListItem.task` ganhou os campos que a UI precisa, as escolhas de F2-3 e F2-4 foram aprovadas no ADR-0005 e `date-fns-tz` saiu da stack por nota no ADR-0001.
- **Alterações:**
  - `OccurrenceListItem.task`: `groupId`, `createdBy` e `difficulty`, como pedido, mais `assigneeId`. Ocorrências anteriores a uma reatribuição têm responsável diferente do da tarefa.
  - ADR-0005, seção 4: `editor`, `deleter` e `própria` comparam com `tasks.assignee_id`; `assignee` compara com `task_occurrences.assignee_id`.
  - ADR-0005, seções 7 e 8: forma de `monthDay` 29 a 31, âncora fora da regra, `UNTIL` da tarefa original e contagem de `after_count`.
  - Handoffs para `tarefas-calendario` e `banco-de-dados`.
- **Arquivos/módulos principais:** `packages/contracts/src/tasks.ts`, `docs/adr/0001-stack.md`, `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005 e ADR-0001 atualizados. `date-fns-tz` fora, sujeito à validação do humano. `packages/core` usa só `Intl` para fuso.
- **Correção da entrada de 09:51:** a dependência da hora repetida com o fuso da máquina não se reproduziu em UTC nem em `Asia/Tokyo`, conforme o orquestrador. O motivo registrado é só o erro de `getTimezoneOffset`.
- **Como testar:** `pnpm install` e `pnpm check`.
- **Verificado:** `pnpm check` passa. O valor -4 do `getTimezoneOffset` foi verificado pelo orquestrador, não por mim.
- **Não verificado:** a leitura com os campos novos, que depende de `feat/tasks-db`.
- **Pendências / próximos passos:** `tarefas-calendario` separa os dois responsáveis em `deriveActors` e corrige o comentário de `actors.ts`. `banco-de-dados` devolve os campos listados no handoff.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 09:59 (BRT)

- **Branch:** feat/tasks-adr-timezone, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** Decidido o que acontece com `exdates` quando o fuso de uma tarefa recorrente muda em `all`.
- **Alterações:**
  - ADR-0005, seção 8: mudar `timezone` em `all` é mudança de agenda, e `edit_task` regrava `exdates` mantendo a hora local.
  - Handoff curto para `banco-de-dados`.
- **Arquivos/módulos principais:** `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005. Sem contrato novo, e `packages/core` não muda.
- **Como testar:** `pnpm check`. A regra em si se testa no pgTAP, em `feat/tasks-db`.
- **Verificado:** `pnpm check` passa.
- **Não verificado:** a expressão SQL não rodou em um banco. Na hora repetida da virada de horário de verão, o Postgres pode escolher um instante diferente do de `packages/core`. Nesse caso, o instante fica inerte e a ocorrência excluída volta.
- **Pendências / próximos passos:** `banco-de-dados` aplica a regra em `edit_task`.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:02 (BRT)

- **Branch:** feat/tasks-adr-exdates, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** Um dia excluído ou destacado não volta mais ao editar a série: `exdates` passa a guardar dias locais, não instantes. Substitui a regra de remapeamento da entrada de 09:59.
- **Alterações:**
  - `Task.exdates` agora é lista de dias locais em `packages/contracts`.
  - ADR-0005, seções 2 e 8: quem grava cada dia, série que muda de dias da semana, linha `cancelled` antiga e `on conflict do nothing`.
  - Handoffs para `banco-de-dados`, com o teste pgTAP esperado, e para `tarefas-calendario`.
- **Arquivos/módulos principais:** `packages/contracts/src/tasks.ts`, `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005. Dia local em vez de instante remapeado, porque não exige recalcular nada e não depende de o Postgres e `packages/core` concordarem na hora repetida. Vale enquanto as regras tiverem no máximo uma ocorrência por dia local.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passa.
- **Não verificado:** a regra ainda não existe no banco nem em `expandOccurrences`. Até `tarefas-calendario` mudar `expand.ts`, os dias em `exdates` são ignorados sem erro de tipo, então as duas mudanças precisam entrar juntas.
- **Pendências / próximos passos:** `tarefas-calendario` ajusta `expand.ts`, e `banco-de-dados` aplica `date[]` e as gravações.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:06 (BRT)

- **Branch:** feat/tasks-core-exdates, criada a partir de feat/phase-2-tasks
- **Agente(s):** tarefas-calendario
- **Resumo:** `packages/core` acompanha as mudanças de contrato: `exdates` por dia local em `expandOccurrences` e os dois responsáveis (da ocorrência e da tarefa) em `deriveActors`.
- **Alterações:**
  - `expandOccurrences` pula a instância cujo dia local, no fuso da tarefa, está em `exdates`. O trecho do handoff foi validado: `localDateOf(timezone, start)` equivale a `wallClockOf(...).toISOString().slice(0, 10)`. Testes novos: dia excluído continua fora depois de mudar hora e fuso, 23:30 em `America/Sao_Paulo` usa o dia local e não o de UTC, hora inexistente e hora repetida na virada em `America/New_York`, dia fora da regra fica inerte e a exclusão de sábado não atinge domingo.
  - `splitRecurrence`: nenhuma mudança de lógica. Dividir `exdates` não é de core segundo o ADR (a RPC `edit_task` herda os dias a partir do pivô, em SQL). Comentários atualizados, e teste de que os dias excluídos antes do pivô contam no `COUNT`.
  - `ActorSubject` troca `assigneeId` por `occurrenceAssigneeId` (decide `assignee`) e `taskAssigneeId` (decide `própria`, `task.edit_assigned` e `task.delete_assigned`). Comentário corrigido e testes de ocorrência resolvida antes de uma reatribuição.
- **Arquivos/módulos principais:** `packages/core/src/recurrence/{expand,split}.ts`, `packages/core/src/tasks/actors.ts` e os testes
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhum novo.
- **Como testar:** `pnpm check`. Os testes de `packages/core` também passam com `TZ=Asia/Tokyo`.
- **Verificado:** `pnpm check` passa, 316 testes em `packages/core`.
- **Não verificado:** SQL de `edit_task` e `set_occurrence_status` gravando os dias, que é de `banco-de-dados`. Deno.
- **Pendências / próximos passos:** quem lê tarefas e ocorrências para a UI deve preencher `ActorSubject` com `OccurrenceListItem.assigneeId` e `OccurrenceListItem.task.assigneeId`.
- **Branch:** feat/tasks-db, criada a partir de feat/phase-2-tasks (com os commits 3fc37db e cfce952)
- **Agente(s):** banco-de-dados
- **Resumo:** Banco da Fase 2 (F2-2): tarefas, ocorrências, histórico, XP, regras e transições espelhadas, RPCs de status, edição, exclusão e visão Equipe, cron da materialização e testes de RLS.
- **Alterações:**
  - Tabelas `tasks`, `task_occurrences`, `task_status_history`, `xp_events`, `app_settings` (`task_rules`) e `occurrence_transitions`, com RLS, privilégios por coluna e sem escrita do cliente em ocorrências, histórico e XP.
  - 5 chaves de permissão (`task.*`) para owner e admin.
  - Triggers: `group_id` e regras de contexto e atribuição, ocorrência única da tarefa avulsa, `overdue_at` a partir de `taskRules`, par de transição válido em qualquer caminho, `late`, histórico e XP com evento compensatório.
  - RPCs `set_occurrence_status`, `edit_task`, `delete_task` e `team_overview`; `exdates` como `date[]` de dias locais (ADR-0005, seção 8).
  - Job diário `materialize-occurrences-daily` (pg_cron + pg_net, segredos no Vault).
  - `scripts/check-permission-mirror.mjs` agora compara também `occurrenceTransitions` e `taskRules`.
  - Tipos regenerados em `packages/data/src/database.types.ts`; handoffs para `tarefas-calendario` e `backend-funcoes`.
- **Arquivos/módulos principais:** `supabase/migrations`, `supabase/tests/rls_tasks.test.sql`, `scripts/check-permission-mirror.mjs`, `packages/data/src/database.types.ts`
- **Migrations:** 20261101130000_task_permissions, 20261101130100_task_rules_and_transitions, 20261101130200_tasks_tables, 20261101130300_task_access, 20261101130400_task_triggers, 20261101130500_occurrence_triggers, 20261101130600_set_occurrence_status, 20261101130700_edit_delete_task, 20261101130800_team_overview, 20261101130900_materialize_cron. Aplicadas só no banco local.
- **Decisões/ADRs:** segue o ADR-0005. Escolhas dentro dele: "pendentes futuras" é `scheduled_start >= now()`; tarefa arquivada recusa mudança de status; `this` em tarefa avulsa só cancela a ocorrência; `p_rrule` nulo em `edit_task` significa que a tarefa deixa de repetir.
- **Como testar:** `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm check`.
- **Verificado:** `pnpm db:test` (56 + 277 asserts), `pnpm db:check-permissions` (matriz, transições e regras em sincronia) e `pnpm check` passam. A política `tasks_select` foi enfraquecida de propósito e 12 testes falharam; depois voltou. O espelho acusa divergência de regra e de transição quando o banco é alterado.
- **Não verificado:** nada rodou no projeto hospedado. O cron não foi exercitado com Vault e Edge Function reais. Neste ambiente a porta 54321 estava ocupada por outro projeto; usei portas locais temporárias, sem commitar o `config.toml`.
- **Pendências / próximos passos:** repositórios em `packages/data` (tarefas-calendario), Edge Function `materialize-occurrences` e segredos do Vault (backend-funcoes), job de vermelho (F4-6).

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:18 (BRT)

- **Branch:** feat/tasks-adr-db-review, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** Revisão das decisões de `banco-de-dados` nas migrations de tarefas: sete confirmadas, com três correções em `edit_task` enviadas por handoff, e três códigos de erro novos no contrato.
- **Alterações:**
  - ADR-0005, seção 8: decisões confirmadas, correções e critério dos códigos de erro.
  - `taskErrorCodeSchema`: `assignee_not_member`, `context_change_not_allowed` e `context_not_found`.
  - Handoffs para `banco-de-dados`, com o teste pgTAP esperado, e para `tarefas-calendario`.
- **Arquivos/módulos principais:** `packages/contracts/src/tasks.ts`, `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma. A correção é uma migration de `banco-de-dados`.
- **Decisões/ADRs:** ADR-0005. Depois de uma mudança de agenda, os dias que já têm linha entram em `exdates`, para cada dia ter uma ocorrência. Reatribuir alcança pendentes com `overdue_at > now()`. Deixar de repetir apaga ou cancela todas as pendentes.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passa. `toRRule(fromRRule(regra))` devolveu a mesma string em 140 regras e 5 fusos, por um teste temporário que não ficou no repositório. O erro `23505` ao editar uma tarefa que deixou de repetir foi reproduzido no banco local, em transação com `rollback`.
- **Não verificado:** as três correções ainda não existem no SQL.
- **Pendências / próximos passos:** `banco-de-dados` aplica o handoff de 10:18. `tarefas-calendario` mapeia os códigos novos em i18n.
