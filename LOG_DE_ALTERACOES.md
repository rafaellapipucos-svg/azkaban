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

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:17 (BRT)

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
- **Pendências / próximos passos:** `banco-de-dados` aplica o handoff de 10:17. `tarefas-calendario` mapeia os códigos novos em i18n.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:26 (BRT)

- **Branch:** feat/tasks-materialize, criada a partir de feat/phase-2-tasks (com e131f2d)
- **Agente(s):** backend-funcoes
- **Resumo:** Edge Function `materialize-occurrences` (F2-5): cria as ocorrências das tarefas recorrentes, para o cron diário e para o cliente, com a expansão de `packages/core` rodando de verdade no Deno.
- **Alterações:**
  - `supabase/functions/materialize-occurrences/index.ts`: autenticação do cron por `x-cron-secret` (comparação em tempo constante, sobre o SHA-256 dos dois lados) e do usuário por JWT; entrada validada com `materializeRequestSchema`; `until` cortado em `onDemandMaxDays`; lista de tarefas pela RLS do usuário (service role só para inserir, mover o cursor e ler a participação em grupos); tarefas arquivadas e de quem saiu do grupo ficam de fora; `on conflict (task_id, scheduled_start) do nothing`; `materialized_until` só depois do insert e só para frente; logs só com contagens.
  - `deno.json` da função: import map para `@azkaban/core`, `@azkaban/contracts` e `@azkaban/config`. O Deno não resolve imports relativos sem extensão, então o mapa aponta cada pacote para o arquivo de entrada de que a função precisa (`recurrence/expand.ts`, `contracts/src/tasks.ts`, `config/src/tasks.ts`) e acrescenta uma entrada por import sem extensão no caminho (`zone`, `common`, `recurrence`). Nenhum arquivo de `packages/` foi alterado, e a recorrência continua numa só fonte.
  - `rrule-shim.ts`: o Deno carrega o `rrule` 2.8.1 pelo `main` (UMD/CommonJS), e `import { RRule } from 'rrule'` falha com "does not provide an export named 'RRule'". O mapa aponta `rrule` para esse arquivo, que reexporta `RRule` do mesmo pacote.
  - `supabase/config.toml`: só `[functions.materialize-occurrences] verify_jwt = false`, porque o cron não manda JWT; a função autentica sozinha.
  - `supabase/functions/.env.example` (`CRON_SECRET` de demonstração local).
  - `materialize.integration.test.ts`: 9 testes contra a função real e o banco local.
  - Handoff para `tarefas-calendario` com o contrato de chamada.
- **Arquivos/módulos principais:** `supabase/functions/materialize-occurrences/`, `supabase/functions/.env.example`, `supabase/config.toml`
- **Migrations:** nenhuma
- **Decisões/ADRs:** segue o ADR-0005, seção 7. Escolhas dentro dele: (1) tarefa de ex-membro não anda o cursor, para quem for reatribuído receber a série de onde parou, sem rajada de passado nem buraco no futuro; (2) `until` acima do limite é cortado, não rejeitado, como o handoff do arquiteto diz; (3) uma tarefa cuja regra não expande é contada e pulada, sem derrubar a varredura do cron.
- **Como testar:** `pnpm db:start`; `cp supabase/functions/.env.example supabase/functions/.env`; `pnpm exec supabase functions serve`; em outro terminal `node --test supabase/functions/materialize-occurrences/materialize.integration.test.ts`. Cobre: semanal na janela e segunda rodada com zero; dia em `exdates`; tarefa excluída com `all`; ex-membro (e volta ao reentrar); tarefa que o cliente não vê; `until` cortado e `until` abaixo do limite; 401, 400 e segredo errado do cron, cada um com o par positivo; `this_and_following` seguido de materialização; 9h local em Nova York na virada do horário de verão.
- **Verificado:** os 9 testes passam. Mutações mostraram que eles falham: sem o filtro de arquivadas, sem a checagem de ex-membro e sem o corte de `until`. O job `materialize-occurrences-daily` foi exercitado de ponta a ponta no banco local (`call_materialize_occurrences()` com os segredos no Vault, resposta 200 `{"inserted":0}`; segredos removidos em seguida). O empacotador do `supabase functions deploy` (imagem `edge-runtime`, comando `bundle`) gerou o pacote com os arquivos de `packages/` (15 MB).
- **Não verificado:** deploy no projeto hospedado (não feito). O limite de tamanho de uma função hospedada é 20 MB, e o pacote tem 15 MB. Segredos de produção (`CRON_SECRET` em `supabase secrets set` e Vault `materialize_url`, `cron_secret`) continuam por conta do deploy.
- **Pendências / próximos passos:** o Deno só resolve a função enquanto os imports sem extensão de `core/src/recurrence` e `contracts/src/tasks.ts` estiverem no mapa; se o `arquiteto` preferir, trocar para imports com `.ts` em `packages/` elimina o mapa extra, mas muda arquivos de outros donos. Um script `pnpm functions:test` na raiz dependeria do orquestrador.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:33 (BRT)

- **Branch:** feat/tasks-db-edit, criada a partir de feat/phase-2-tasks
- **Agente(s):** banco-de-dados
- **Resumo:** Três correções em `edit_task` pedidas na revisão do arquiteto, numa migration nova.
- **Alterações:**
  - Deixar de repetir em `all` agora apaga ou cancela todas as pendentes, passadas inclusive. Antes sobravam pendentes passadas ao lado da ocorrência nova, e a edição seguinte falhava com `23505`. O teste que reproduz o bug foi escrito antes e falhou (3 pendentes em vez de 1).
  - Mudança de agenda em `all` e em `this_and_following`: os dias locais, de hoje em diante, das linhas não canceladas que ficaram entram em `exdates` da tarefa que as mantém, pela função interna `exclude_kept_days`. A hora nova vale a partir de amanhã.
  - Reatribuir sem mudar a agenda alcança as pendentes com `overdue_at > now()`.
  - 19 asserts novos em `supabase/tests/rls_tasks.test.sql` (296 no arquivo) e tipos regenerados.
- **Arquivos/módulos principais:** `supabase/migrations/20261101131000_edit_task_review_fixes.sql`, `supabase/tests/rls_tasks.test.sql`, `packages/data/src/database.types.ts`
- **Migrations:** 20261101131000_edit_task_review_fixes (`create or replace function public.edit_task` e `exclude_kept_days`). Só no banco local.
- **Decisões/ADRs:** segue o ADR-0005, seção 8. Os dias de `exclude_kept_days` são lidos no fuso novo da tarefa (o da expansão), não no antigo.
- **Como testar:** `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`; para a Edge Function, `supabase functions serve` e `node --test supabase/functions/materialize-occurrences/materialize.integration.test.ts`.
- **Verificado:** `pnpm db:test` (56 + 296 asserts) e `pnpm db:check-permissions` passam; os 9 testes de integração de `materialize-occurrences` passam contra o `edit_task` novo.
- **Não verificado:** o script `pnpm functions:test` não existe nesta branch, então rodei o teste de integração direto com `node --test`. Nada foi aplicado no projeto hospedado.
- **Pendências / próximos passos:** nenhuma de banco.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 10:51 (BRT)

- **Branch:** feat/ui-phase-2, criada a partir de feat/phase-2-tasks
- **Agente(s):** design-system
- **Resumo:** Componentes de UI que a Fase 2 precisa: anel de progresso, campos de data e hora, interruptor, controle segmentado, contador, botão de ícone, marcador de tarefa e botão de ação flutuante, todos na `/design-system`.
- **Alterações:**
  - `packages/ui`: `ProgressRing`, `DateField` e `TimeField` (react-hook-form, valores `yyyy-MM-dd` e `HH:mm`), `SwitchRow`, `SegmentedControl`, `Stepper`, `IconButton`, `TaskCheck` (com `late`), `Fab`; ganchos `useReducedMotion` e `useThemeColors`. Tokens novos: `sizes`, `motion` e as bordas `doneEdge`, `partialEdge`, `cancelledEdge`. Textos em `packages/i18n/src/pt-BR/ui.json`.
  - `packages/platform`: adapter `DateTimeInput` com `.web.tsx` (`<input type="date|time">`) e `.native.tsx` (`@react-native-community/datetimepicker` 9.2.1, a versão que `expo install` escolheu para o SDK 58). `DateTimeInput.tsx` só declara os tipos e lança erro: o Metro nunca o carrega. Teste de unidade para a conversão de texto da versão nativa.
  - `apps/app/package.json` e `pnpm-lock.yaml`: a dependência nativa.
  - Animações: anel e check usam `Animated` do React Native (nenhuma biblioteca nova) e pulam tudo com "reduzir movimento".
- **Arquivos/módulos principais:** `packages/ui/src/`, `packages/platform/src/DateTimeInput*.tsx`, `packages/platform/src/dateTimeText.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** o arquivo-base do adapter é `.tsx` de propósito. Com `.d.ts` o `pnpm boundaries` não resolve o import; com `.ts` o Metro escolhe o `.ts` antes do `.web.tsx` (verificado: a página quebrou com o erro do fallback). O `.tsx` perde para `.web.tsx` e `.native.tsx`, e o TypeScript e o dependency-cruiser o resolvem. Vale para os próximos adapters.
- **Como testar:** `pnpm install`, `pnpm check`, `pnpm build:web`; `pnpm dev` e abrir `/design-system` em 375px, claro e escuro.
- **Verificado:** `pnpm check` e `pnpm build:web` passam. No Chromium (Playwright, 375px, claro e escuro): `fill` e digitação em `input[type=date]` e `input[type=time]` chegam ao formulário como `2026-11-15`, `2026-12-01` e `09:30`; interruptor, segmentado, contador (mínimo 1 desabilita o menos), marcador de tarefa, botão flutuante e anel funcionam; sem erro no console e sem rolagem horizontal; alvos medidos com 44px ou mais. Com `reducedMotion: reduce` o anel salta direto; sem a preferência ele anima. `expo export --platform android` compila e o pacote traz o seletor nativo, sem o fallback.
- **Não verificado:** nada rodou em aparelho ou emulador. O seletor nativo de data e hora (Android e iOS), o `Fab` com safe area real e as animações no nativo não foram vistos. O plugin de configuração do `@react-native-community/datetimepicker` não foi adicionado ao `app.config.ts` (fora do escopo; é opcional e só estiliza o Android).
- **Pendências / próximos passos:** `tarefas-calendario` usa os componentes (handoff em `docs/agentes/handoffs/`). Testar em aparelho antes de a Fase 2 fechar.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 11:28 (BRT)

- **Branch:** feat/tasks-screens, criada a partir de feat/phase-2-tasks
- **Agente(s):** tarefas-calendario
- **Resumo:** Telas de tarefas (F2-6, F2-7, F2-8) e exibição de XP (F2-12): Hoje como tela inicial, abas por área vindas do banco, criação rápida, formulário completo com recorrência amigável, detalhe com histórico e escopos "só esta", "esta e as próximas" e "todas". Calendário e Equipe ficam para o passo seguinte.
- **Alterações:**
  - `packages/core`: `planToday`, `planArea`, `groupByContext`, `earnedXp` e `localDayRange` (o que a tela Hoje mostra, com atrasadas e prazos chegando); `buildTaskInput`, `taskFormValues`, `toBatchInput`, `withFrequency` e ajudantes de hora (formulário para contrato e de volta); `alignToRule` (alinha `startAt` à regra ao salvar, ADR-0005 seção 7); `planEdit`, `planDelete` e `rruleOf` (as strings `p_rrule` e `p_head_rrule` por escopo, com `count_before_pivot` e `recurrence_ends_before_anchor` como erros do formulário). Testes: 365 no pacote.
  - `packages/data/src/tasks`: `tasksRepository` (listas por janela e atrasadas, detalhe, histórico, criar, criar em lote, `set_occurrence_status`, `edit_task`, `delete_task`) e a chamada a `materialize-occurrences` depois de criar ou editar, sem derrubar a operação se ela falhar. `TaskError` e `taskErrorCode` mapeiam a mensagem do banco para `taskErrorCodeSchema`; o que não está no schema vira `null` e a tela mostra o texto genérico.
  - `packages/features/tasks`: `TodayScreen`, `AreaScreen`, `QuickCreate` (pelo `Fab`, título e horário, contexto padrão o último usado), `TaskFormScreen` (criar, editar, duplicar; administrador atribui a vários membros e cria em lote; opção "só eu vejo" só quando faz sentido; flags de prova guardadas e não mostradas), `RecurrenceEditor` (todo dia, dias da semana, todo mês, a cada N, termina em data, após N vezes ou nunca; o usuário nunca vê RRULE), `TaskDetailScreen` (editar, reagendar, duplicar, excluir, histórico), prompt de escopo com confirmação dupla para "excluir todas", `OccurrenceRow` com `TaskCheck` (um toque é verde, `⋯` abre tentei, não fiz e voltar), atualizações otimistas com rollback e mensagens para `status_conflict` e `late_window_expired`. Os botões vêm de `deriveActors` com os dois responsáveis e `availableTransitions`; o banco continua decidindo. Textos em `packages/i18n/src/pt-BR/tasks.json`.
  - `apps/app`: abas Hoje, uma por área (rota `area/[areaKey]` com `tabBar` próprio, `AppTabBar`) e Perfil, que supera a solução provisória do ADR-0004. Grupos saiu da barra e é alcançado pelo Perfil; contextos são gerenciados em `/contexts` (o `AreasScreen` de antes), a partir de cada aba de área. Rotas finas em `tasks/new`, `tasks/[id]` e `tasks/[id]/edit`.
  - `packages/features/auth`: `ProfileScreen` aceita `children`, para a rota compor o botão Grupos (fora do meu escopo, mudança mínima; handoff para `auth-grupos`).
  - `e2e/accounts.spec.ts`: só navegação (Grupos pelo Perfil, contextos vistos pela aba Trabalho). `e2e/tasks.spec.ts` e `e2e/tasks-series.spec.ts`: criação rápida, verde, amarelo com motivo, série (só esta, esta e as próximas, excluir todas com confirmação), atribuição a membro e lote, membro sem controles de edição, tarefa pessoal que não chega ao administrador, tela desatualizada com `status_conflict`, reagendar.
- **Arquivos/módulos principais:** `packages/core/src/tasks`, `packages/core/src/recurrence/align.ts`, `packages/data/src/tasks`, `packages/features/tasks`, `apps/app/app/(app)`, `apps/app/src/AppTabBar.tsx`, `e2e/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** o contexto de uma tarefa só muda dentro do mesmo dono, então o formulário de edição só oferece esses contextos. "Hoje" mostra só as tarefas atribuídas ao usuário, e a aba de área tem "Minhas" e "Do grupo" para quem tem `task.view_group`. Um prazo entra em "Hoje" no dia em que vence e em "Prazos chegando" nos 7 dias antes (janela em `features/tasks/src/config.ts`). Reagendar edita com escopo `this`; duplicar copia a ocorrência como tarefa avulsa.
- **Como testar:** `pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm check`, `pnpm build:web`, `pnpm db:test`, `pnpm e2e`. Na mão: `pnpm dev`, 375px, claro e escuro.
- **Verificado:** `pnpm check`, `pnpm build:web`, `pnpm db:test` (352 asserts) e `pnpm e2e` (10 testes) passam. Telas vistas em 375px, claro e escuro, com dados reais (Hoje, aba de área, criação rápida, formulário com repetição, detalhe, prompt de escopo).
- **Não verificado:** nada rodou em aparelho ou emulador (seletor nativo, `Modal` e safe area no nativo); `late_window_expired` só tem a lógica coberta em `core`, sem E2E, porque exige uma ocorrência com mais de 72 horas de atraso; o fluxo "esta e as próximas" com contagem (`COUNT`) só tem teste de unidade.
- **Pendências / próximos passos:** calendário e Equipe (F2-9, F2-10); ver os três handoffs de 11:28 (tipos das RPCs, chips de escolha múltipla e contraste do vermelho no escuro, `ProfileScreen`); fila offline é F8-5.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 11:38 (BRT)

- **Branch:** feat/ui-phase-2-fixes, criada a partir de feat/phase-2-tasks
- **Agente(s):** design-system
- **Resumo:** Resposta ao handoff das telas de tarefas: contraste do vermelho no escuro, chip de escolha múltipla e o vazio no topo das telas de pilha.
- **Alterações:**
  - Token `danger-light` (`#F2677A`, 5,35:1 sobre `surface-dark` e 6,14:1 sobre `background-dark`) aplicado em `ErrorText`, na borda inválida de `FormTextField` e `DateField`/`TimeField`, na linha "Atrasada" (`OccurrenceRow`) e no título "Atrasadas" (`Section`). Medi todos os pares texto e fundo de `packages/ui` e `packages/features/tasks` nos dois temas, e o único outro abaixo de AA era o placeholder (`muted` sobre `surface-dark`, 2,34:1); agora ele usa `muted-dark` (7,75:1).
  - `Subtitle` ganhou `tone="danger"`. O título "Atrasadas" nunca ficava vermelho, nem no tema claro, porque `text-text` vencia `text-danger`; `Section` passou a usar a prop.
  - `Chip` e `ChipRow` ganharam `multiple`: papel `checkbox` e `group` em vez de `radio` e `radiogroup`. Aplicado em `RecurrenceEditor` (dias da semana), `TaskFormScreen` (avisos) e `AssigneePicker` (pessoas, só quando `multiple`). Escolhas únicas seguem como estavam.
  - `Screen` usa `SafeAreaView` (bordas topo e base) em vez de somar `useSafeAreaInsets` ao padding: o nativo só acolchoa a parte da área segura que a tela de fato cobre, então sob o cabeçalho da pilha sobra 0 e nas abas e na boas-vindas o inset inteiro. O respiro de 24px continua.
- **Arquivos/módulos principais:** `packages/ui/src/{tokens,Text,Layout,FormTextField,DateTimeFields,useThemeColors,DesignSystemScreen}`, `packages/features/tasks/src/{OccurrenceRow,Sections,RecurrenceEditor,TaskFormScreen,AssigneePicker}.tsx` (só cor e a prop `multiple`)
- **Migrations:** nenhuma
- **Decisões/ADRs:** `Screen` não detecta o cabeçalho pelo contexto do React Navigation porque o expo-router não exporta esse contexto; o `SafeAreaView` nativo resolve sem depender de rota.
- **Como testar:** `pnpm check`, `pnpm build:web`; `/design-system` em 375px nos dois temas (linhas "ErrorText" e "Subtitle danger", chips de escolha múltipla).
- **Verificado:** `pnpm check` e `pnpm build:web` passam. No Chromium, a 375px: cores computadas de `ErrorText` e do título perigo são `rgb(200,40,61)` no claro e `rgb(242,103,122)` no escuro; os chips múltiplos têm `role=checkbox` dentro de `group` e os de escolha única continuam `radio`; sem erro no console.
- **Não verificado:** o `Screen` em pilha com cabeçalho nativo, em iOS e Android, não foi visto (a web tem inset 0 e não mostra a diferença). As telas de tarefas com dados não foram abertas, porque a pilha está em uso por outro agente.
- **Pendências / próximos passos:** conferir em aparelho o topo das telas de detalhe e formulário.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 12:02 (BRT)

- **Branch:** feat/tasks-calendar, criada a partir de feat/phase-2-tasks (com a8ab3ac)
- **Agente(s):** tarefas-calendario
- **Resumo:** Calendário (F2-9) e visão Equipe (F2-10): mês, semana e dia com filtros, dia perfeito, calendário de outro membro e do time inteiro para quem tem `task.view_group`, materialização sob demanda ao navegar para longe, e a tela Equipe com a taxa de conclusão de cada membro.
- **Alterações:**
  - `packages/core/src/tasks`: `calendarGrid` (mês começando em qualquer dia da semana, semana, dia, `dayRange` que transforma dias locais em instantes pelo fuso do perfil, com `Intl`, sem `date-fns-tz`), `calendarDay` (agrupa por dia local, resumo, `isPerfectDay`, filtros, linha do tempo por hora), `calendarMaterialize` (`materializationNeed`: quando pedir e até onde, cortado em `onDemandMaxDays`), `team` (`teamOverview`, taxa e faixas), `resolvePrefill` (dia e horário que uma rota pede ao formulário). 45 testes novos: mês que começa no domingo, semana começando em domingo ou segunda, fevereiro bissexto, dias de 23 e 25 horas em Nova York, o dia de 23 horas de São Paulo em 2018, fronteiras do dia (02:59Z e 03:00Z em São Paulo), dia perfeito (vazio, cancelada, atrasada, filtro de estado).
  - `packages/data/src/tasks`: `listCalendar` (leitura paginada de 500 em 500, com `groupId` e `groupOnly`, que também filtra `visibility = 'group'`), `materializeUntil` e `teamOverview`.
  - `packages/features/calendar`: `CalendarScreen` com `SegmentedControl` de visão, navegação, filtros de área, contexto e estado, escolha de "meu calendário", "de um membro" e "time inteiro" (só grupos com `task.view_group`), célula de mês com marcadores de símbolo, contador e rótulo falado por dia, destaque de dia perfeito, semana em lista de dias, dia com bloco de prazos e horas (toque numa hora cria a tarefa naquele horário), aviso quando a visão passa do limite de materialização. Textos em `calendar.json`. Aba Calendário entre as áreas e Perfil.
  - `packages/features/tasks`: `TeamScreen` e `TeamLink` (Equipe, por grupo, com `can(user, 'task.view_group', group)`), o formulário aceita `day` como `yyyy-MM-dd` e `time`; `useRefreshTasks` também refaz a materialização do calendário.
  - `apps/app`: rotas `calendar` (aberta com `view`, `date`, `scope`, `group`, `member`), `team/[groupId]`, e o botão "Ver equipe" na página do grupo, composto na rota.
  - `packages/features/groups`: `GroupDetailScreen` aceita `children` (fora do meu escopo, mudança mínima; handoff).
  - `e2e/calendar.spec.ts`: 6 testes (tarefa no dia certo, dia perfeito, filtro de estado, criar a partir de um dia e de uma hora com data e horário preenchidos, recorrente aparecendo a 90 dias e aviso a 500, admin vê o calendário de um membro e a Equipe e o membro não, admin da Casa A não vê nada da Casa B nem a tarefa pessoal, grade do mês em 375px com alvos de 44px e sem rolagem lateral).
- **Arquivos/módulos principais:** `packages/core/src/tasks/calendar*.ts`, `packages/core/src/tasks/team.ts`, `packages/features/calendar`, `packages/features/tasks/src/Team*.tsx`, `packages/data/src/tasks`, `e2e/calendar.spec.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** dia perfeito: tudo `done`, cancelada não conta, dia vazio não é perfeito, `done` atrasado continua verde. Taxa da equipe: `done` sobre o que venceu até hoje (pendentes de hoje e dias futuros não entram), faixas 80% e 50% em `tasksConfig.team.bands`. A semana do calendário e da Equipe começa no domingo (`weekStartsOn`). A visão semanal é uma lista de sete dias, não sete colunas, porque uma coluna tem menos de 50px em 375px. Handoff ao arquiteto para confirmar as regras.
- **Como testar:** `pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm check`, `pnpm build:web`, `pnpm db:test`, `pnpm e2e`. Na mão: `pnpm dev` e abrir `/calendar` e, como administrador, `/team/<id do grupo>`.
- **Verificado:** `pnpm check`, `pnpm build:web`, `pnpm db:test` (352 asserts) e `pnpm e2e` (16 testes) passam. Uma mutação (materialização desligada) derrubou o teste de recorrência a 90 dias. Telas vistas com dados reais (mês, semana, dia, dia perfeito, filtros, limite, escolha do time, Equipe) em 375px e 1280px, claro e escuro.
- **Não verificado:** nada rodou em aparelho ou emulador. Mês com seis linhas e células com quatro marcadores só foram vistos no desktop e em 375px do navegador. Calendário de um grupo com muitos membros (mais de 500 ocorrências por visão) só tem a paginação por leitura de código; a tela não foi vista com esse volume. Dia com mudança de horário de verão só tem teste de unidade, porque o fuso padrão não tem.
- **Pendências / próximos passos:** arrastar para reagendar, exportação `.ics` e calendários externos ficam fora do escopo. Criar a tarefa a partir do calendário de um membro ainda começa com o responsável "eu": o formulário não recebe o responsável por rota. Os três handoffs de 11:59 (regras para o arquiteto, `children` no grupo, marcador de estado para o design-system).

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 13:46 (BRT)

- **Branch:** feat/qa-phase-2, criada a partir de feat/phase-2-tasks (com 17043fc)
- **Agente(s):** qa-testes
- **Resumo:** Auditoria da Fase 2 como entregue: números reais de `pnpm check`, `build:web`, `functions:test` e `e2e`, a definição de pronto item a item, uso do app em 375px e 1280px nos dois temas, axe-core e teclado. Quatro handoffs com os bugs.
- **Alterações:**
  - `e2e/calendar.spec.ts` e `e2e/tasks.spec.ts`: o seletor da pessoa responsável passou de `radio` para `checkbox`. Depois da correção do `Chip` de escolha múltipla (`feat/ui-phase-2-fixes`), três testes (atribuir a membro, calendário do membro e isolamento entre casas) falhavam por timeout, e a integração final não rodou o E2E.
  - `e2e/tasks-late-and-count.spec.ts` (novo, 5 testes): atrasada dentro e fora da janela de 72 h (só "Não fiz" depois dela); `late_window_expired` de verdade, com o relógio do navegador recuado por `page.clock.setFixedTime` e o banco no relógio real; "Esta e as próximas" mantém o total de uma série "N vezes"; `count_before_pivot` na tela; e um `test.fail` para o bug de a tela cair em "Não encontramos esta tarefa." depois de "Esta e as próximas".
  - `playwright.config.ts`: `expect.timeout` de 5 s para 15 s. Salvar uma tarefa que repete espera a Edge Function (4,3 s medidos em partida a frio com quatro workers), e o limite de 5 s derrubava de 1 a 3 testes por rodada.
  - Handoffs: `qa-testes-para-tarefas-calendario-bugs-da-fase-2`, `qa-testes-para-arquiteto-casca-do-app`, `qa-testes-para-design-system-chips-teclado-e-contraste` e `qa-testes-para-auth-grupos-papeis-na-tela-do-grupo`.
- **Arquivos/módulos principais:** `e2e/`, `playwright.config.ts`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma. Nenhum código de feature foi alterado.
- **Como testar:** `pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm check`, `pnpm build:web`, `pnpm functions:test`, `pnpm e2e`.
- **Verificado:** `pnpm check` passa (410 testes em `core`, 6 em `contracts`, 3 em `config`, 4 em `platform`; 202 módulos sem violação de fronteira). `pnpm build:web` e `pnpm functions:test` (9 de 9) passam. `pnpm e2e` na integração como veio: 13 de 16 (as 3 falhas eram o seletor acima). Depois da correção, em 7 rodadas completas com o limite de 5 s: 2 limpas e 5 com 1 a 3 falhas de tempo, sempre depois de "Salvar"; com o limite de 15 s, 3 rodadas seguidas com 21 de 21 (um é o `test.fail` esperado). axe-core 4.10.2 em 22 telas nos dois temas: zero violações de contraste no escuro e uma no claro (texto de exemplo, 2,53:1). Alvos de toque: tudo com 44px ou mais, menos a seta de voltar do cabeçalho (30px).
- **Não verificado:** nada rodou em aparelho ou emulador (câmera, safe area, seletor nativo de data, leitor de tela real); `pnpm db:test` não foi rodado, porque o banco local estava em uso pelo `revisor-seguranca`; o `late_window_expired` com um segundo usuário administrador e o efeito do vermelho automático (F4-6) não existem ainda.
- **Pendências / próximos passos:** os quatro handoffs. Quando o bug de "Não encontramos esta tarefa." for corrigido, tirar o `test.fail` do último teste de `e2e/tasks-late-and-count.spec.ts`.
