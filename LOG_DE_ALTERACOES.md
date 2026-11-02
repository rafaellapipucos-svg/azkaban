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

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 13:00 (BRT)

- **Branch:** feat/tasks-adr-closeout, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** Itens abertos da Fase 2 fechados nos ADRs: dia perfeito, taxa da Equipe, fuso das telas, lugar do `useCurrentUser` e navegação.
- **Alterações:**
  - ADR-0006: dia de uma ocorrência na tela, dia perfeito, taxa da Equipe com faixas provisórias, `useCurrentUser` e navegação.
  - ADR-0004: aponta para o ADR-0006 no paliativo de navegação. ADR-0005: `exclude_kept_days` confirmado no fuso novo.
  - `docs/arquitetura.md`: adapters de plataforma e navegação.
  - Handoffs para `banco-de-dados` e `tarefas-calendario`.
- **Arquivos/módulos principais:** `docs/adr/`, `docs/arquitetura.md`, `docs/agentes/handoffs/`, comentário em `packages/contracts/src/tasks.ts`
- **Migrations:** nenhuma. A mudança em `team_overview` é uma migration de `banco-de-dados`.
- **Decisões/ADRs:** ADR-0006. Telas contam dias no fuso do perfil de quem vê, com `deadline` no dia do limite. Isso corrige também a taxa, em que um prazo em andamento contava como vencido.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passa. O desencontro do prazo foi visto na leitura do SQL e de `teamOverview`, não em execução.
- **Não verificado:** nada do handoff foi implementado ainda.
- **Pendências / próximos passos:** `banco-de-dados` e `tarefas-calendario` aplicam os handoffs de 13:00, juntos. O humano valida as faixas de 80% e 50%.

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

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 13:53 (BRT)

- **Branch:** feat/groups-permissions, criada a partir de feat/phase-2-tasks
- **Agente(s):** auth-grupos
- **Resumo:** `GroupDetailScreen` deixou de comparar papéis na tela. O que o espectador pode fazer continua em `can(user, permission, group)`; as regras que dependem do papel do alvo (dono não sai nem é removido, admin só sai com `member.change_role`) viraram funções puras em `packages/core/src/permissions`, espelho da política `group_members_delete`. Comportamento igual.
- **Alterações:**
  - `packages/core/src/permissions/members.ts`: `canRemoveMember` (espelha `group_members_delete`, vale também para sair do grupo) e `memberActions` (botões de trocar papel, transferir e remover no cartão de outro membro). 10 testes em `members.test.ts`: dono nunca sai nem é removido, admin remove membro mas não admin, dono remove admin, membro comum não remove, quem não está no grupo.
  - `packages/features/groups/src/GroupDetailScreen.tsx`: sem nenhum `role ===`; "Sair do grupo" usa `canRemoveMember` com o próprio papel. Os `children` do grupo foram revisados e mantidos.
  - `ProfileScreen` (`children` acima de "Sair"): revisado e mantido, sem mudança.
- **Arquivos/módulos principais:** `packages/core/src/permissions/members.ts`, `packages/core/src/index.ts`, `packages/features/groups/src/GroupDetailScreen.tsx`
- **Migrations:** nenhuma
- **Decisões/ADRs:** a regra do alvo não entrou na matriz porque a matriz espelha `role_permissions` do banco (`db:check-permissions`); fica numa função à parte que usa `can()`.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passa (420 testes em `core`, 204 módulos sem violação de fronteira). `grep "role ===" GroupDetailScreen.tsx` não acha mais nada.
- **Não verificado:** a tela não foi aberta no navegador nem o E2E rodou (o banco local está com outro agente); a equivalência com a versão anterior vem da leitura e dos testes de unidade.
- **Pendências / próximos passos:** o nome do grupo ainda aparece só dentro do campo de texto para quem pode renomear (apontado pelo qa-testes), sem título.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 14:09 (BRT)

- **Branch:** feat/ui-phase-2-a11y, criada a partir de feat/phase-2-tasks
- **Agente(s):** design-system
- **Resumo:** Os achados de acessibilidade do QA e os pedidos de `tarefas-calendario` em `packages/ui`: nome longo em `Chip`, tecla Espaço, contraste do exemplo de texto, folha de criação rápida com nome e foco, níveis de título, `StatusMark` e `SegmentedControl` com rótulo longo.
- **Alterações:**
  - `Chip`: `max-w-full`, texto que encolhe e quebra linha, `min-height` pelo token `sizes.touch`. Um nome de 80 caracteres vira 3 linhas, 343px numa coluna de 343px (antes 643px). O nome inteiro continua no `aria-label`.
  - Teclado: `activateOnSpace` em `packages/platform` (`keyboard.web.ts` trata Espaço, sem rolar a página, sem repetição, só quando o alvo é o próprio controle; `keyboard.ts` não faz nada no nativo). Usado em `TaskCheck`, `SwitchRow`, `Chip` e `SegmentedControl`; desativado quando `disabled`. Enter e clique seguem como antes (react-native-web). Teste de unidade do adapter.
  - `Input` (novo) e `FormTextField` por cima dele: o exemplo de texto usa a cor do tema ativo e a cor do próprio campo vai inline, porque o preflight do Tailwind pinta de `#9ca3af` (2,53:1) o campo vazio e vencia a classe. `StatusActions` troca `TextInput` por `Input` (mínimo, fora do escopo, antes usava `tokens.colors.muted`, que é o claro, também no escuro).
  - `Sheet` (novo): `Modal` com `aria-label` (o `aria-modal` do react-native-web nascia sem nome), fundo escuro fora da ordem de foco e foco devolvido a quem abriu (`useRestoreFocus`, lido na renderização, porque o `autoFocus` do filho roubava o foco antes de qualquer efeito). `QuickCreate` usa `Sheet`.
  - `Title` é nível 1 e `Subtitle` nível 2, com `level={3}`. `ProgressRing` deixa de usar `Subtitle` para o valor (virava `role=none` com `aria-level`).
  - `StatusMark` promovido a `@azkaban/ui`, com `statusSymbol` compartilhado com `StatusBadge` e `TaskCheck`. `SegmentedControl`: o `✓` entra no texto do rótulo, então um rótulo de duas linhas continua centrado.
  - Tokens: `sizes.{stepperValue, lateBadge, statusDot, statusRow, border, mascot, mascotSmall}`, `opacity.scrim`; `min-h-11`, `min-h-12`, `min-w-16`, `h-5 w-5`, `borderWidth: 2` e o tamanho do mascote saíram das classes e dos números soltos.
  - `/design-system`: exemplos de nomes longos (chips de uma e de várias escolhas), `SegmentedControl` com rótulos longos, `StatusMark`, folha com campo em foco automático, campo com exemplo de texto, nível 3 e dica de teclado. Textos em `ui.json`.
- **Arquivos/módulos principais:** `packages/ui/src`, `packages/platform/src/keyboard*.ts`, `packages/i18n/src/pt-BR/ui.json`, `packages/features/tasks/src/{QuickCreate,StatusActions}.tsx`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma. A troca do `StatusMark` do calendário ficou para `tarefas-calendario` (handoff), por estar fora do escopo.
- **Como testar:** `pnpm check`, `pnpm build:web`; `pnpm dev`, abrir `/design-system` a 375px, claro e escuro, apertar Tab e Espaço.
- **Verificado:** `pnpm check` e `pnpm build:web` passam. No Chromium (Playwright) a 375px, nos dois temas: três chips longos com 343px de largura, sem rolagem lateral; Espaço alterna `switch`, `TaskCheck`, `Chip` de várias escolhas, `Chip` de escolha única e `SegmentedControl`, sem rolar a página; Enter e clique seguem alternando; títulos saem `h1`, `h2` e `h3`; o diálogo tem nome e, depois de Esc, o foco volta para "Abrir folha" mesmo com o campo da folha em foco automático. axe-core 4.10.2 (de fora do repositório) em `/design-system`: zero violações de contraste, `aria-allowed-attr`, `aria-dialog-name` e `aria-prohibited-attr`; sobram `region` (a página não tem landmarks) e uma barra de progresso sem nome que é a do indicador de carregamento do Expo, não do app.
- **Não verificado:** nada rodou em iOS, Android nem leitor de tela real; o nativo só passou no typecheck (o `Sheet` não foi visto no nativo). `QuickCreate` e `StatusActions` com dados não foram abertos (sem Supabase), só o equivalente em `/design-system`. `pnpm e2e` não rodou. A barra de abas apertada (item 6 do QA) não foi tocada.
- **Pendências / próximos passos:** `tarefas-calendario` troca o `StatusMark` do calendário (handoff de 14:09) e pode usar `Subtitle level={3}` em nomes de item. O Metro da web não pegou edições feitas depois da primeira compilação neste worktree; foi preciso reiniciar o servidor a cada rodada.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 14:09 (BRT)

- **Branch:** feat/tasks-db-security, criada a partir de feat/phase-2-tasks
- **Agente(s):** banco-de-dados
- **Resumo:** Achados da revisão de segurança da Fase 2 no banco, mais `team_overview` no fuso de quem vê. Os testes foram escritos antes e falharam.
- **Alterações:**
  - `tasks.rrule` só aceita a gramática de `toRRule` e `splitRecurrence` (`is_valid_rrule` e CHECK `tasks_rrule_grammar_check`); `edit_task` e `delete_task` validam `p_rrule` e `p_head_rrule` com `invalid_rrule`. Conferido com 178 regras geradas por `packages/core`.
  - A tarefa nova de `this` e `this_and_following` fica no mesmo grupo e dono do contexto da original (trigger, `context_change_not_allowed`).
  - `can_view_task`: tarefa privada não aparece mais por causa de uma ocorrência antiga; isso fecha também `set_occurrence_status`, `edit_task` e as políticas de ocorrência e histórico.
  - `delete_task` com `all` só arquiva descendentes que quem exclui pode excluir.
  - CHECKs de datas (2000 a 2100) em `tasks` e `task_occurrences`; fuso só de `pg_timezone_names` (`invalid_timezone`).
  - Compensação de XP por usuário e grupo do evento original, não pelo grupo atual da tarefa.
  - Contexto arquivado não recebe tarefa nova (`context_archived`).
  - `team_overview(p_group_id, p_from, p_to, p_timezone)`: dia no fuso do visualizador, `deadline` por `scheduled_due`.
  - `packages/data`: `teamOverview` envia `p_timezone` (padrão: fuso do aparelho). Tipos regenerados. Handoffs para `backend-funcoes` e `tarefas-calendario`.
- **Arquivos/módulos principais:** `supabase/migrations/20261101140000` a `20261101140800`, `supabase/tests/rls_tasks.test.sql`, `packages/data/src/tasks/index.ts`, `packages/data/src/database.types.ts`
- **Migrations:** 20261101140000_task_rrule_grammar, 140100_rrule_validation_in_rpcs, 140200_task_parent_context_guard, 140300_can_view_private_task, 140400_task_archived_context, 140500_delete_task_tree_and_rrule, 140600_task_dates_and_zones, 140700_xp_compensation_by_group, 140800_team_overview_viewer_zone. Só no banco local.
- **Decisões/ADRs:** pg_net não foi tocado: as concessões são de `supabase_admin`, e o `postgres` não consegue revogá-las ("no privileges could be revoked"). O PostgREST não expõe o schema `net` (`PGRST106`), então `anon` e `authenticated` não o alcançam pela API. O teto de XP e a conclusão antecipada ficam para a Fase 6.
- **Como testar:** `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm check`.
- **Verificado:** `pnpm db:test` (56 + 356 asserts), `pnpm db:check-permissions` e `pnpm check` passam. O teste de integração de `materialize-occurrences` passa nos 9 casos com o padrão de regra trocado para `FREQ=WEEKLY;BYDAY=...` (cópia fora da pasta da função); sem a troca, 7 falham no CHECK novo, porque `FREQ=WEEKLY` sem `BYDAY` não é uma regra que o app escreve.
- **Não verificado:** nada foi aplicado no projeto hospedado; as concessões do `net` não foram vistas lá.
- **Pendências / próximos passos:** `backend-funcoes` troca o padrão da linha 104 do teste de integração; `tarefas-calendario` passa o fuso do perfil a `teamOverview`; decidir o que fazer com o `net` no projeto hospedado.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 14:17 (BRT)

- **Branch:** feat/tasks-materialize-hardening, criada a partir de feat/phase-2-tasks
- **Agente(s):** backend-funcoes
- **Resumo:** `materialize-occurrences` agora isola a falha de uma tarefa (insert ou cursor recusado pelo banco) sem derrubar a varredura, e o teste de integração segue a gramática nova de `tasks.rrule`.
- **Alterações:**
  - Teste: a regra padrão passou de `FREQ=WEEKLY` para `FREQ=WEEKLY;BYDAY=<dia da âncora>`, a única forma que o CHECK `tasks_rrule_grammar_check` aceita. Os 9 testes antigos voltaram a passar.
  - Teste novo, escrito antes da correção e visto falhar com 500: duas tarefas legadas (o CHECK é removido e recolocado `NOT VALID` numa transação, via `docker exec ... psql`; o teste restaura e valida no `finally`). Uma tem ocorrências que quebram o CHECK de `task_occurrences` (`BYMINUTE` leva o início a 09:30, depois do prazo 09:10). A outra insere bem, mas o `update` do cursor reavalia a gramática e falha. A boa, no mesmo pedido, recebe as 9 ocorrências e o cursor; as duas ruins ficam contadas em `failed`, sem cursor, e a nova chamada e a varredura do cron seguem em 200.
  - `index.ts`: o insert da página continua em um comando quando cabe em 500 linhas (tudo ou nada); se o banco recusar, ou se não couber, cada tarefa é inserida sozinha. O cursor também cai para uma tarefa por vez quando o comando em lote falha. Só recusa dos dados conta como falha da tarefa (SQLSTATE 22, 23 e P0001); qualquer outro erro (conexão, por exemplo) continua derrubando a chamada com 500, para uma queda do banco não parecer sucesso. Logs: evento, estágio e código, nunca linhas.
- **Arquivos/módulos principais:** `supabase/functions/materialize-occurrences/index.ts`, `supabase/functions/materialize-occurrences/materialize.integration.test.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma nova. Teto de iterações em `expandOccurrences`: não falta, com a gramática. Ela limita a no máximo uma ocorrência por dia (DAILY, WEEKLY com 7 dias e MONTHLY com `BYSETPOS=-1`; `INTERVAL` só aumenta o passo), sem frequências menores que dia e sem `BYHOUR`, `BYMINUTE` ou `BYSECOND`; `start_at` é no mínimo 2000-01-01 e a janela termina em no máximo hoje + 366 dias. O `rrule` itera da âncora até o fim da janela, então o pior caso é cerca de 10 mil passos hoje (36 mil em 2100). Medido no Deno local com a regra mais densa e âncora em 2000-01-01: 94 ms por chamada, inserção de 366 linhas incluída. `packages/core` não foi alterado.
- **Como testar:** `pnpm db:start`; `pnpm exec supabase functions serve` (sem editar a pasta `supabase/functions` enquanto roda: reinicia o runtime e a primeira chamada dá 502); `pnpm functions:test`.
- **Verificado:** `pnpm functions:test` 10 de 10; `pnpm check`.
- **Não verificado:** um erro de banco que não seja de dados (conexão, timeout) continua em 500 sem teste próprio. Um `rrule` legado fora da gramática (SECONDLY, por exemplo) não existe mais no banco depois da migration, então o teto não foi exercitado com ele.
- **Pendências / próximos passos:** nenhuma.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 15:09 (BRT)

- **Branch:** feat/tasks-final-fixes, criada a partir de feat/phase-2-tasks
- **Agente(s):** tarefas-calendario (também a casca do app, por pedido do orquestrador)
- **Resumo:** Última rodada de correções da Fase 2: telas de pilha sem saída, salvar tarefa que repete sem esperar a Edge Function, destino após "esta e as próximas", página 404, ordem estável, fuso da Equipe e achados de baixa prioridade do QA.
- **Alterações:**
  - Casca: `unstable_settings = { anchor: '(tabs)' }` na pilha `(app)`, para uma tela aberta por endereço sempre ter as abas por baixo; cabeçalho próprio (`BackHeader`) com um só controle "Voltar" de 44px, sem faixa vazia nem `<h1>` vazio; `+not-found` em pt-BR, com tema e botão "Ir para Hoje"; `web.lang: 'pt-BR'` em `app.config.ts`. O `+html.tsx` é ignorado com `web.output: 'single'` (verificado no `expo export`), por isso o idioma vai pelo config.
  - Salvar tarefa que repete não espera mais a função: `tasksRepository.create/createBatch/edit` só gravam; `materializeTasks` (nova, lança erro) roda em segundo plano numa mutação compartilhada (`useMaterializeTasks`), com 2 novas tentativas. `MaterializeStatus`, acima da barra de abas, mostra "Criando as repetições..." e, se falhar, um alerta com "Tentar de novo". Os ids pendentes ficam no armazenamento e são retomados após recarregar a página.
  - Depois de "esta e as próximas" a tela vai para Hoje (`dismissTo('/')`), porque a ocorrência aberta pode ter sido apagada.
  - Ordem estável: `scheduled_start`, depois `tasks(created_at)`, depois `id`, em `listOccurrences`, `listCalendar` e `listOverdue`.
  - `useCurrentUser` movido para `packages/data/src/session` (ADR-0006), com `react`, `@tanstack/react-query` e `@azkaban/config` no `package.json` do `data`. `teamOverview` exige o fuso do perfil e a `TeamScreen` espera o perfil. Faixas 80% e 50% marcadas como provisórias em `tasksConfig`.
  - `context_archived` em `taskErrorCodeSchema` (mudança autorizada pelo orquestrador) e mensagem em pt-BR. `invalid_rrule` e `invalid_timezone` seguem genéricos.
  - Calendário usa o `StatusMark` de `@azkaban/ui`; a cópia local foi apagada. `QuickCreate` e `StatusActions` já usavam `Sheet` e `Input` (feito pelo design-system).
  - Baixa prioridade: erro de carga esconde o vazio e oferece "Tentar de novo" (Hoje, áreas, calendário); depois das 72 h o detalhe explica o motivo e a mensagem só manda procurar administrador em tarefa de grupo; só o verde é riscado; a visão do dia começa às 6h ou na primeira tarefa; limites de texto, intervalo e dia do mês saíram para `tasksConfig`; ponto de contexto usa `tokens.spacing`.
  - Formulário de contexto: "Salvar" fica desabilitado até as áreas chegarem. Antes, apertar cedo não fazia nada e sem aviso (areaId vazio), o que derrubava de forma intermitente vários testes E2E logo no começo.
  - `expect.timeout` de `playwright.config.ts` continua em 15 s. Tentei 5 s (o padrão) e 10 s: em cada rodada completa caíram de 1 a 3 testes, porque os dias de uma tarefa que repete só aparecem quando a Edge Function termina (4 s na partida a frio e 10 s ou mais com quatro workers dividindo um só runtime local), e a criação de conta e contexto também passa de 5 s sob essa carga. Salvar deixou de esperar a função; o teste é que ainda espera pelo resultado dela.
- **Arquivos/módulos principais:** `apps/app/app/(app)/_layout.tsx`, `apps/app/app/+not-found.tsx`, `apps/app/src/{BackHeader,AppTabBar}.tsx`, `apps/app/app.config.ts`, `packages/data/src/{session,tasks}`, `packages/features/tasks/src/{hooks,MaterializeStatus,TaskFormScreen,TaskDetailScreen,TodayScreen,AreaScreen,OccurrenceRow,config}`, `packages/features/calendar/src`, `packages/contracts/src/tasks.ts`, `packages/i18n/src/pt-BR`, `e2e/*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma nova. O arquiteto pode registrar no ADR-0006 a navegação por `anchor` com cabeçalho próprio e a materialização em segundo plano.
- **Como testar:** `pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm check`, `pnpm build:web`, `pnpm db:test`, `pnpm functions:test`, `pnpm e2e`.
- **Verificado:** testes de regressão novos, vistos falhar antes da correção: `e2e/shell.spec.ts` (saída das telas de pilha e 404), `tasks-materialize.spec.ts` (3 testes), `tasks-order.spec.ts`, `team-timezone.spec.ts`, `tasks-ui-fixes.spec.ts`; o `test.fail` de "esta e as próximas" virou teste normal. `context_archived` tem teste de contrato e E2E. Telas olhadas a 375px, claro e escuro: Hoje, detalhe, Grupos, 404 e visão do dia.
- **Não verificado:** nativo (iOS/Android) só no typecheck; leitor de tela real; abas cortadas a 320px (item 8 do QA) não foi tratado; lampejo branco do documento no tema escuro antes do JS (`+html` não vale em `single`; exigiria `public/index.html`); `<meta theme-color>`, marcos de página e manifest PWA (itens 3, 5 e 6 do handoff da casca).
- **Pendências / próximos passos:** `backend-funcoes` investiga o status 546 ("request has been cancelled by supervisor") da função com vários pedidos ao mesmo tempo; o arquiteto decide o dono de `apps/app/app` e o resto da casca.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 16:04 (BRT)

- **Branch:** feat/tasks-materialize-cpu, criada a partir de feat/phase-2-tasks
- **Agente(s):** backend-funcoes
- **Resumo:** o 546 da `materialize-occurrences` era custo de CPU real, não só da máquina de teste. A função agora tem piso de passado, cursor por tarefa e orçamento por execução. A entrada anterior (14:17), que dizia que a gramática bastava e não faltava teto, estava errada: ela só olhou as linhas por dia, e não que um cursor nulo expande desde a âncora.
- **Medido (Deno local, edge-runtime 1.77.8; `process.cpuUsage` devolve 0 no sandbox, então CPU é o tempo do trecho síncrono):**
  - antes: 1.000 tarefas semanais sem cursor deram 546 em 20 s; 10 tarefas diárias com âncora em 2000 deram 546 em 5,7 s (a repetição inseriu 39 mil linhas); 1.000 tarefas com cursor atual passaram, mas em 6,7 s;
  - custo de expansão por tarefa: ~0,3 ms (semanal, 60 dias), ~2,5 ms (diária, âncora de 3 anos), ~30 ms (diária, âncora em 2000, mesmo com `from` atual, porque o `rrule` itera da âncora: ~3 µs por dia iterado); a primeira chamada em um worker frio custa ~200 ms a mais (formatadores `Intl`), e a requisição fria inteira ~1,1 s;
  - depois, no mesmo cenário: 1.000 tarefas sem cursor, 200 por execução em 1,9 s e 2,7 s, com 96 a 106 ms de expansão, 0 respostas 546; 50 tarefas diárias de 2000: 24 e 26 tarefas por execução em 1,0 s e 1,2 s, 608 ms de expansão (o orçamento); sem trabalho, a execução leva ~15 ms.
  - limites da Supabase (docs, 2026-11-01): 2 s de CPU por requisição, sem contar I/O; 150 s de duração por worker no plano gratuito e 400 s nos pagos; 256 MB; pacote de 20 MB pelo CLI e 5 MB se empacotado no servidor (o nosso tem 15 MB: só o CLI com Docker serve).
- **Alterações:**
  - `index.ts`: (1) `from` nunca antes de `agora - 30 dias` (`PAST_DAYS`, local até o arquiteto criar o padrão); (2) o cursor anda por tarefa, logo depois do insert dela, e o que está pronto sobrevive a um worker que morre; (3) orçamento por execução (600 ms de expansão ou 200 tarefas): o restante fica com os cursores mais antigos e é o primeiro da próxima execução; (4) a varredura lê só a lista de ids das tarefas com cursor atrasado (nulo primeiro, depois o mais antigo), até 1.000, e busca as linhas aos poucos; (5) o cron sem `until` ignora tarefa com cursor a menos de 12 h do limite; (6) tarefa que começa depois do limite agora tem o cursor movido, para sair da lista; (7) o log traz `deferred` e `expandMs`.
  - Teste: "a series anchored in year 2000" (piso, com o par de uma série recente), "a run stops at its budget" (80 tarefas caras, cron repetido: cada execução avança, nenhuma regride, a primeira termina parcial, a final cria 0 e cada série tem 90 ou 91 linhas) e o teste de horário de verão agora usa o próximo início de DST relativo a hoje (o de 2027 fixo passaria a falhar com o piso depois de abril de 2027).
  - Handoffs: `arquiteto` (padrão `materializationPastDays`, `failed` e `deferred` na resposta, ADR-0005 seção 7 ficou aproximado) e `banco-de-dados` (cron mais frequente quando passar de ~500 tarefas; pacote de 15 MB exige deploy pelo CLI).
- **Arquivos/módulos principais:** `supabase/functions/materialize-occurrences/index.ts`, `supabase/functions/materialize-occurrences/materialize.integration.test.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005 seção 7 fica aproximado em duas frases (expansão desde a âncora; cron cobre a janela). Não editei ADR.
- **Como testar:** `pnpm db:start`; `pnpm exec supabase functions serve`; `pnpm functions:test` (12 testes).
- **Verificado:** `pnpm functions:test` 12 de 12 e `pnpm check`. Sem o orçamento o teste de orçamento falha (o worker morre no meio e a resposta vem vazia); com o piso desligado o teste da âncora de 2000 falha.
- **Não verificado:** a CPU real no projeto hospedado (não houve deploy); o tempo de I/O dos 400 pedidos por execução em produção. `MAX_TASKS = 200` e `EXPAND_BUDGET_MS = 600` são conservadores, sem medição de CPU total (só da expansão).
- **Pendências / próximos passos:** resposta com `failed` e `deferred` e padrão `materializationPastDays` (arquiteto); cron mais frequente (banco-de-dados).

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 16:09 (BRT)

- **Branch:** feat/tasks-adr-final, criada a partir de feat/phase-2-tasks
- **Agente(s):** arquiteto
- **Resumo:** ADR-0005 alinhado ao que foi construído na materialização, com riscos para o humano, condições de deploy e pendências da Fase 4. Só documentação.
- **Alterações:**
  - Seção 7: piso de 30 dias, cursor por tarefa, orçamento de 600 ms ou 200 tarefas, cron a cada 15 minutos.
  - Seção 11: reagendar zera `late` e XP em massa, sem decisão.
  - Seção 12: schema `net` e deploy da função pelo CLI.
  - Seção 13: `failed`, `deferred` e `materializationPastDays` ficam para a Fase 4.
- **Arquivos/módulos principais:** `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005. O ADR-0006 não mudou: a frase de que não faltava teto com a gramática só existia na entrada de 14:17 deste LOG, já corrigida pela entrada do `backend-funcoes`.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passa. Os valores da seção 7 conferem com as constantes de `index.ts` da função.
- **Não verificado:** em `f4294bb` ainda não há o cron de 15 minutos nem a trava de CI do schema `net`. O ADR os indica como trabalho de `banco-de-dados`. Nada foi conferido no projeto hospedado.
- **Pendências / próximos passos:** `banco-de-dados` entrega o cron e a trava. O humano decide os riscos da seção 11.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 16:15 (BRT)

- **Branch:** feat/tasks-db-closeout, criada a partir de feat/phase-2-tasks
- **Agente(s):** banco-de-dados
- **Resumo:** Última rodada do banco da Fase 2: divisão privada, fuso lido pelo `Intl`, frequência do cron e trava de CI para o schema `net`. Os testes foram escritos antes e falharam.
- **Alterações:**
  - N2: `edit_task` recusa `private` em `this_and_following` e em `all` quando linhas de outro responsável iriam junto (`private_with_other_assignee`, 23514). Pendentes sem histórico não contam, porque a edição as troca ou reatribui. Antes, o admin que dividia a série como privada levava as linhas resolvidas de Duda, e ela, o dono do grupo e `team_overview` deixavam de vê-las, com o motivo dela.
  - N3: `public.is_valid_timezone` (nome em `pg_timezone_names` e fora de `Factory`) passou a valer no trigger de `tasks`. De 598 nomes, só `Factory` é rejeitado pelo `Intl`. `pnpm db:check-permissions` agora confere que o `Intl` lê todos os nomes que o banco aceita.
  - Cron: o job `materialize-occurrences-daily` foi trocado por `materialize-occurrences`, `*/15 * * * *`, porque a função processa 200 tarefas por execução (handoff de `backend-funcoes`).
  - `pnpm db:check-permissions` falha se `net`, `cron` ou `vault` entrarem em `api.schemas` de `supabase/config.toml`. Não há teste de banco para isso, porque as concessões de `net` são de `supabase_admin`.
- **Arquivos/módulos principais:** `supabase/migrations/20261101150000`, `150100`, `150200`, `supabase/tests/rls_tasks.test.sql`, `scripts/check-permission-mirror.mjs`
- **Migrations:** 20261101150000_private_split_other_assignee, 20261101150100_valid_timezone_list, 20261101150200_materialize_cron_frequency. Só no banco local.
- **Decisões/ADRs:** o teste "private" da Fase 2 (tarefa que vira privada com uma ocorrência antiga de outro admin) agora muda a visibilidade como `postgres`, porque `edit_task` passou a recusar esse caso; a regra de `can_view_task` fica como segunda barreira.
- **Como testar:** `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm check` e, com `pnpm exec supabase functions serve`, `pnpm functions:test`.
- **Verificado:** `pnpm db:test` (56 + 369 asserts), `pnpm db:check-permissions`, `pnpm check` e os 12 testes de `pnpm functions:test` passam. A trava do `net` falhou quando `net` foi posto em `api.schemas` de propósito.
- **Não verificado:** nada foi aplicado no projeto hospedado; a lista de fusos do Postgres hospedado pode diferir da local.
- **Pendências / próximos passos:** o código `private_with_other_assignee` não está em `taskErrorCodeSchema`; o `arquiteto` decide se a tela o traduz. `this` com `private` não recebeu a mesma checagem.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 16:26 (BRT)

- **Branch:** feat/phase-2-tasks, sobre feat/phase-1-accounts
- **Agente(s):** orquestrador, integrando arquiteto, banco-de-dados, backend-funcoes, design-system, tarefas-calendario, auth-grupos, qa-testes e revisor-seguranca
- **Resumo:** Fase 2 integrada e verificada no checkout principal: tarefas, ocorrências, recorrência, Hoje, abas por área, calendário e Equipe. Aguarda validação do humano.
- **Alterações:** ver as entradas de cada agente. O orquestrador moveu as portas locais do Supabase para 544xx, criou `pnpm functions:test`, levou o teste da função ao CI e ampliou o QUADRO com F4-8 e F4-9.
- **Arquivos/módulos principais:** `docs/agentes/QUADRO.md`, `.github/workflows/ci.yml`, `supabase/config.toml`
- **Migrations:** 23 novas nesta fase, aplicadas só no banco local.
- **Decisões/ADRs:** ADR-0005 e ADR-0006. Navegação: Hoje, uma aba por área, Calendário e Perfil. `date-fns-tz` fora da stack, com defeito de fuso reproduzido pelo orquestrador.
- **Como testar:** `pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm dev`; depois `pnpm db:test`, `pnpm db:check-permissions`, `pnpm check`, `pnpm functions:test` e `pnpm e2e`.
- **Verificado no estado final:** banco limpo com 425 asserts, espelhos em dia, tipos, 421 testes de core, lint, fronteiras, build web, 12 testes da função e 34 E2E em duas rodadas seguidas.
- **Não verificado:** CI desta fase, projeto hospedado, deploy da função, iOS, Android e leitor de tela real. A falha de `supabase start` na primeira tentativa desta verificação foi passageira, e a causa não foi investigada.
- **Pendências / próximos passos:** validação do humano, as duas decisões da seção 11 do ADR-0005, as faixas provisórias da Equipe e a saída de `date-fns-tz`. Antes do deploy, conferir "Exposed schemas" e `pg_graphql` no projeto hospedado.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 17:10 (BRT)

- **Branch:** feat/proof-contracts, criada a partir de feat/phase-3-proof
- **Agente(s):** arquiteto
- **Resumo:** Abre a Fase 3 (F3-1): ADR-0007 de prova por foto, contratos, config e handoffs. Registra as decisões do humano na aprovação da Fase 2, com a regra de reagendamento no ADR-0005.
- **Alterações:**
  - ADR-0007: a função recebe os bytes e é a única escritora do bucket, com um corpo lido por nonce; desafio por RPC; `commit_proof` atômico, só para service role; barreiras no trigger para qualquer caminho, inclusive `insert`, `edit_task` e service role; "em análise" como `done` com `proof_review_status`; XP retido até aprovar e compensado ao contestar; sem bônus nesta fase, sem bloquear a Fase 6; retenção de 90 dias, com aceite registrado; coordenadas descartadas, guardando só a distância.
  - ADR-0005, seção 11: reagendar preserva o atraso. `overdue_at` fica depois de passado, `auto_miss_at` acompanha a agenda para o job de F4-6, e só quem tem `task.manage_group` e não responde pela ocorrência concede prazo novo. `edit_task` recusa apagar e recriar uma pendente vencida.
  - Decisões registradas: XP em massa na Fase 6, faixas de 80% e 50% e janela de 72 h aceitas (ADR-0006), `date-fns-tz` fora (ADR-0001), membro não vê tarefas `group` de colegas (ADR-0005).
  - Contratos: `packages/contracts/src/proof.ts` (novo), ator `reviewer`, `proofReviewStatusSchema`, quatro pares de `reviewer` em `occurrenceTransitions`, `contextLocationSchema`, `checkApproval` e quatro códigos em `taskErrorCodeSchema`.
  - Config: `packages/config/src/proof.ts` (novo), com `proofRules` e `proofDefaults`.
  - Permissão `proof.review` em `matrix.ts`, por pedido do orquestrador. `transitions.test.ts` ajustado aos pares novos. Os dois estão em `packages/core`, fora do escopo do arquiteto.
  - Campos novos em tipos lidos por `packages/data` nasceram opcionais, para não quebrar o que existe. `tarefas-calendario` os torna obrigatórios ao mapeá-los.
- **Arquivos/módulos principais:** `docs/adr/0007-prova-por-foto.md`, `docs/adr/0005-tarefas-ocorrencias-recorrencia.md`, `docs/adr/0006-calendario-equipe-navegacao.md`, `docs/adr/0001-stack.md`, `docs/arquitetura.md`, `packages/contracts/src/{proof,tasks,contexts,occurrence-transitions}.ts`, `packages/config/src/proof.ts`, `packages/core/src/permissions/matrix.ts`, handoffs `20261101-1708-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0007 (novo) e ADR-0005, seção 11.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check`. Documentação da Supabase lida em 2026-11-01: limites de Edge Functions, códigos de status, limites de arquivo, criação de bucket, URL assinada de upload, controle de acesso do Storage e preços. SHA-256 de 2 MiB em 1,1 ms, no Node desta máquina.
- **Não verificado:** o limite de corpo de uma Edge Function hospedada, que a documentação não traz, e a CPU real de `proof-validate`. O tamanho das fotos é estimado. `pnpm db:check-permissions` não rodou e vai falhar até F3-2 entregar a matriz e as transições no banco.
- **Pendências / próximos passos:** F3-2 a F3-7 nos handoffs. O orquestrador acrescenta ao QUADRO as tarefas de `tarefas-calendario` e `proof-url`, e ajusta F8-4, porque o limite de desafios entra em F3-2.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 17:19 (BRT)

- **Branch:** feat/proof-ui, criada a partir de feat/phase-3-proof
- **Agente(s):** design-system
- **Resumo:** F3-9: visual do sub-estado "em análise" (`done` com `proofReviewStatus = 'in_review'`) em `TaskCheck`, `StatusBadge` e `StatusMark`, mostrado em `/design-system`.
- **Alterações:**
  - Tokens `review`, `onReview` e `reviewEdge`, cada um em par claro e escuro. Verde-claro, com borda mais escura porque o preenchimento sozinho tem 1,3:1 contra o cartão claro.
  - Propriedade opcional `reviewing` nos três componentes, só vale com `status="done"`. Símbolo `◔` (o `done` é `✓`) e rótulo "Em análise"; o rótulo falado de `TaskCheck` é "Feito, em análise", com variante para atraso.
  - `packages/ui/src/tokens.test.ts` mede o contraste (WCAG): texto sobre o preenchimento 10,0:1 no claro e 8,9:1 no escuro; borda contra cartão e fundo 4,3:1 no claro (3:1 exigido); borda escura e preenchimento escuro contra o cartão escuro passam 3:1. Primeiro teste de `packages/ui`: `vitest` entrou como devDependency.
  - Os novos estados aparecem em Estados, Marcadores de estado e Marcador de tarefa, em `/design-system`.
- **Arquivos/módulos principais:** `packages/ui/src` (`tokens.ts`, `statusSymbol.ts`, `TaskCheck.tsx`, `StatusBadge.tsx`, `StatusMark.tsx`, `DesignSystemScreen.tsx`, `tokens.test.ts`), `packages/i18n/src/pt-BR/ui.json`, `pnpm-lock.yaml`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0007, seção 10. Nenhuma decisão nova.
- **Como testar:** `pnpm check`, `pnpm build:web` e `/design-system` em 375px, claro e escuro.
- **Verificado:** `pnpm check` e `pnpm build:web` passam. `/design-system` conferido no Chromium (Playwright) a 375px, claro e escuro, sem erro nem aviso no console e sem rolagem horizontal; rótulos falados dos marcadores lidos do DOM.
- **Não verificado:** leitor de tela real, simulação de daltonismo e renderização do `◔` em iOS e Android (a fonte é a do sistema, como `✓` e `✗`). O contraste é calculado, não medido em captura de tela.
- **Pendências / próximos passos:** `tarefas-calendario` e `prova-foto` passam `reviewing` onde mostram o estado (handoff `20261101-1719`). Não há variante para prova contestada: ela vira `partial` ou `missed`, que já existem.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 17:30 (BRT)

- **Branch:** feat/proof-camera, criada a partir de feat/phase-3-proof
- **Agente(s):** prova-foto
- **Resumo:** F3-4: adapters de câmera, carimbo, compressão, SHA-256 e geolocalização em `packages/platform`. A tela de captura, o envio e a revisão ficam para depois das Edge Functions.
- **Alterações:**
  - `ProofCamera` (base `.tsx`, `.web.tsx`, `.native.tsx`): preview que preenche o pai e `ref.capture(stamp)`, que devolve o JPEG final com carimbo, `width`/`height` lidos do cabeçalho, `sha256` e `capturedAt`. Estados `prompt`, `granted`, `denied` e `unavailable`, com motivo, por `onStatusChange`. Escolha de câmera frontal ou traseira por `facing`. Sem `input type=file`, galeria nem seletor de imagem.
  - Web: `getUserMedia`, quadro copiado para um `canvas`, carimbo desenhado no mesmo `canvas`, `toBlob`. Cada trilha é parada ao desmontar, ao trocar de câmera e quando o desmonte chega antes da resposta do navegador.
  - Nativo: `expo-camera` e `react-native-view-shot`, que lê de volta uma view com a foto e o carimbo por cima. A view usa dp tais que dp vezes a densidade dá o tamanho final em pixels, para não criar um bitmap maior que o necessário. Quem manda no carimbo é o mesmo `stampMetrics` da web.
  - Lógica pura em `photo.ts` e `stamp.ts`: `fitLongEdge`, `readJpegSize` (marcador SOF), `compressionPlan` e `encodeWithinLimits` (qualidade cai antes do tamanho, e o resultado só sai se for um JPEG completo dentro de `proofRules`), texto e geometria do carimbo. Os limites vêm de `photoLimits`, montado de `packages/config/src/proof.ts`.
  - `sha256Hex`: `crypto.subtle` na web, `expo-crypto` no nativo.
  - `readLocation` e `getLocationPermission`: uma leitura, sem rastreio, com `timeoutMs`, estados de permissão e precisão. Nunca lança.
  - Dependências por `expo install`: `expo-camera ~58.0.14`, `expo-crypto ~58.0.7`, `expo-location ~58.0.20`, `react-native-view-shot 6.1.1`. `@azkaban/config` virou dependência de `platform`.
  - `packages/platform/tsconfig.json` ganhou a lib `dom`. Só esse pacote a vê.
- **Arquivos/módulos principais:** `packages/platform/src/{ProofCamera,photo,stamp,sha256,geolocation}*`, `packages/platform/src/index.ts`, `apps/app/package.json`, `pnpm-lock.yaml`, handoff `20261101-1730-prova-foto-para-orquestrador-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** a investigação do carimbo nativo confirmou o ADR-0007: `react-native-view-shot` é pequeno e resolve sem biblioteca de desenho. `expo-image-manipulator` não desenha texto, e `@shopify/react-native-skia` seria grande demais para uma faixa de texto. O arquivo base de `sha256` e de `geolocation` é a versão nativa, como em `keyboard`; o `.web.ts` importa só tipos do base, porque no Metro web `./geolocation` resolve para ele mesmo.
- **Como testar:** `pnpm check`, `pnpm build:web` e `pnpm --filter @azkaban/app exec expo export --platform android`.
- **Verificado:** `pnpm check` (lint, fronteiras, tipos e 37 testes em `platform`), `pnpm build:web` e `expo export --platform android` passam, e o bundle Hermes contém o código nativo da câmera. Num Chromium real (Playwright, `--use-fake-device-for-media-stream`, servidor `expo start --web` na porta 8087, rota de teste temporária e removida), 25 checagens passaram: stream sobe e vai de `prompt` a `granted`; a foto sai com 24.485 bytes, 1600x900 e JPEG completo; o tamanho lido do cabeçalho é o da imagem decodificada; o SHA-256 bate com o do Node sobre os mesmos bytes; o carimbo está nos pixels (1.737 pixels brancos na faixa, e a faixa mais escura que o quadro cru, conferido também a olho); trocar para a câmera frontal para a trilha antiga e espelha só o preview; desmontar, inclusive durante o `getUserMedia`, deixa todas as trilhas em `ended`; recusa real (`--use-fake-ui-for-media-stream=deny`) vira `denied`; ausência de câmera vira `unavailable:no_device`; `capture` antes de a trilha estar viva rejeita com `not_ready`; geolocalização concedida, recusada e leitura com precisão. Captura em 129 ms no Chromium desta máquina.
- **Não verificado:** nada rodou em aparelho real, iOS ou Android. O nativo só foi compilado e empacotado. Em especial: se `view-shot` desenha a view que fica sob a pré-visualização, se `Image` carrega o arquivo de cache a tempo de o `onLoad` disparar e se o tamanho em pixels sai como pedido. Safari, Firefox e câmera virtual não foram testados. O tamanho de 24 KB vem de um vídeo sintético, não serve de medida das fotos reais, que o handoff pede para registrar na primeira foto real.
- **Pendências / próximos passos:** o orquestrador ou o arquiteto edita `plugins` em `apps/app/app.config.ts` (textos de permissão e `recordAudioAndroid: false`), ver handoff. Foto crua do `expo-camera` fica no cache do app até o sistema limpá-lo, o que diverge de "nada em disco" do ADR. F3-5 monta a tela de conferir, que precisa de uma URI de pré-visualização.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 18:06 (BRT)

- **Branch:** feat/proof-db, criada a partir de feat/phase-3-proof
- **Agente(s):** banco-de-dados
- **Resumo:** F3-2: o banco da prova por foto (ADR-0007) e o atraso preservado ao reagendar (ADR-0005, seção 11). Os testes foram escritos antes e falharam; depois, enfraquecimentos de propósito foram pegos por eles.
- **Alterações:**
  - Matriz e regras: ator `reviewer`, `proof.review` (owner e admin), quatro transições do revisor, `proof_rules` em `app_settings` com o acessor `proof_rules()`.
  - Dados: `contexts` com local (tudo ou nada, raio de 20 a 5000); `profiles.proof_consent_*` sem escrita do cliente; `tasks_admin_approval_check` com as linhas antigas limpas antes; `task_occurrences.auto_miss_at` preenchida com `overdue_at`; `current_proof_id` (FK composta com a ocorrência), `proof_review_status`; histórico com `proof_review_status`.
  - Tabelas: `proof_challenges` (nonce = `id`, sem política e sem grant) e `task_proofs` (grant de leitura por coluna, sem `storage_path` nem `challenge_id`; escrita nenhuma; FK composta para o desafio; hash único; trigger de imutabilidade que vale para service role). Bucket `task-proofs` privado, 2 MiB, `image/jpeg`, sem política em `storage.objects`.
  - Barreira para qualquer escritor: `insert` de ocorrência resolvida em tarefa com foto dá `proof_required`; `done` exige prova corrente, da própria ocorrência, não superada e não contestada; `done → partial/missed` e `partial → done` só com a marca de contestação ou aprovação; reabrir zera prova e marca `superseded_at`. O XP virou `occurrence_award_xp`, pulado em `in_review`.
  - RPCs do cliente: `issue_proof_challenge` (limites sob `pg_advisory_xact_lock`), `record_proof_consent`, `review_proof`; `set_occurrence_status` e `edit_task` ganham `proof_required`, `proof_disputed`, `proof_flags_locked` e `overdue_occurrence_blocks_edit`. Só service role: `claim_proof_challenge`, `commit_proof` (identidade do autor por `set_config` local, restaurada no fim), retenção (`proofs_due_for_retention`, `mark_proof_photo_deleted`, `orphan_proof_objects`, `delete_stale_proof_challenges`) e o cron horário `proof-retention`.
  - Atraso preservado: `occurrences_before_schedule` mantém `overdue_at` depois de vencido, salvo perdão de quem tem `task.manage_group` e não é responsável antigo nem novo (`occurrence_forgives_overdue`, a mesma função no trigger e no `edit_task`).
  - `set_updated_at` perdeu o `execute` de PUBLIC e anon, para o teste dizer que nenhuma função de `public` está aberta a anon.
  - `scripts/check-permission-mirror.mjs` compara `proof_rules` com `proofRules` e o bucket com `maxBytes` e `contentType`.
  - `rls_tasks.test.sql`: 19 para 23 transições; `done → partial` pelo responsável deixou de ser `invalid_transition` e passou a `forbidden`; a fixture "Q6" grava `auto_miss_at`, que agora decide a reatribuição.
- **Arquivos/módulos principais:** `supabase/migrations/20261101170000` a `172000`, `supabase/tests/rls_proof.test.sql`, `supabase/tests/rls_tasks.test.sql`, `scripts/check-permission-mirror.mjs`, `packages/data/src/database.types.ts`, handoffs `20261101-1803-banco-de-dados-para-*`
- **Migrations:** 20261101170000_occurrence_actor_reviewer, 170100_proof_review_permission, 170200_proof_rules, 170300_reviewer_transitions, 170400_revoke_set_updated_at, 170500_context_location, 170600_profile_proof_consent, 170700_task_admin_approval_check, 170800_occurrence_auto_miss_at, 170900_proof_challenges, 171000_task_proofs, 171100_occurrence_proof_columns, 171200_proof_access, 171300_task_proofs_bucket, 171400_occurrence_proof_barriers, 171500_set_occurrence_status_proof, 171600_issue_proof_challenge, 171700_claim_and_commit_proof, 171800_review_proof, 171900_proof_retention, 172000_edit_task_proof_rules. Só no banco local.
- **Decisões/ADRs:** onde o ADR não dizia, escolhi o mais próximo e registrei no handoff. (1) Códigos: `P0001` para regras de negócio, `42501` para `forbidden`, `proof_flags_locked` e `proof_immutable`, `23505` para `proof_duplicate`. (2) `record_proof_consent` com versão errada: `22023 invalid_consent_version`, fora de `proofErrorCodeSchema`. (3) Se a reconferência do `claim` falha, a transação inteira volta e o nonce não é consumido; nenhum corpo foi lido, então o limite "um corpo por nonce" se mantém. (4) Uma ocorrência reaberta ou cancelada e reaberta depois da emissão invalida o desafio (`challenge_invalid`), para a foto antiga não valer para o verde novo. (5) `commit_proof` repete a conferência de tamanho, arestas e caminho (`<occurrence_id>/<nonce>.jpg`); `clock_mismatch` continua com a função, e o banco só calcula `clock_delta_seconds` (limitado ao intervalo de `int`). (6) `proof_review_status` nulo ou `disputed` não vira `done` em tarefa com foto, além de "diferente de disputed" do handoff. (7) Em `this_and_following`, `overdue_occurrence_blocks_edit` compara a agenda com a ocorrência do pivô (o formulário de uma divisão traz o início do pivô), ignorando `COUNT`. (8) Contas excluídas levam as ocorrências do responsável, e com elas as provas; a linha só sobrevive com `user_id` nulo se a ocorrência mudou de mãos. Os objetos órfãos saem pelo job. (9) O cron lê `proof_retention_url` e `cron_secret` do Vault.
- **Como testar:** `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm db:types`, `pnpm check`.
- **Verificado:** `pnpm db:test` (56 + 481 + 369 asserts), `pnpm db:check-permissions` (matriz, transições, regras de tarefa e de prova, bucket, fusos e `api.schemas`), `pnpm check`. Enfraquecimentos que os testes pegaram: política de `INSERT` em `storage.objects` para `authenticated`; `execute` de `commit_proof` para `authenticated`; política de `task_proofs` com `using (true)`; a exigência de prova no trigger; o trigger de `insert`; `proof_flags_locked`; a restauração das claims; o perdão do atraso; a reabertura invalidando o desafio. Em transações separadas (psql): as claims de `commit_proof` não vazam para a transação seguinte, `status_changed_by` e `changed_by` são o autor, e excluir a conta de um autor não falha. Contra a API real: `authenticated` e `anon` recebem 403 ao enviar, assinar e listar no bucket, `commit_proof` e `claim_proof_challenge` dão `permission denied`, `service_role` sobe JPEG, recebe 409 sem `upsert`, 415 para PNG e 413 acima de 2 MiB. 45 chamadas simultâneas de `issue_proof_challenge` de um usuário: 30 passam e 15 dão `challenge_rate_limited`; sem o `pg_advisory_xact_lock`, 35 passam. Subida de versão: um banco em `150200` com dados e `migration up` limpa `requires_admin_approval` e preenche `auto_miss_at = overdue_at` nas três linhas.
- **Não verificado:** nada foi aplicado no projeto hospedado. O cron só chama a função com os dois segredos no Vault, que não existem localmente. Nada exercita `proof-validate`, `proof-url` e `proof-retention`, que ainda não existem. A corrida do limite não virou teste automatizado.
- **Pendências / próximos passos:** `backend-funcoes`, `prova-foto` e `tarefas-calendario` partem dos três handoffs `20261101-1803-banco-de-dados-para-*`. Criar `proof_retention_url` no Vault ao implantar. A exclusão de conta (F8-3) precisa remover os objetos das provas, que ficam órfãos até o job passar.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 19:22 (BRT)

- **Branch:** feat/proof-functions, criada a partir de feat/phase-3-proof
- **Agente(s):** backend-funcoes
- **Resumo:** F3-3 e F3-7. As três Edge Functions do ADR-0007 existem e rodam contra a pilha local: `proof-validate` (único que grava no bucket), `proof-url` (URL assinada de 60 s sob `can_view_proof`) e `proof-retention` (retenção, órfãos e desafios velhos). 80 testes passam, e 13 enfraquecimentos de propósito foram pegos.
- **Limites da Supabase (documentação, 2026-11-01):** 2 s de CPU por requisição, sem contar I/O; 256 MB; 150 s de ociosidade; 150 s de duração no plano gratuito e 400 s nos pagos; pacote de 20 MB pelo CLI. A página de limites continua sem número para o corpo da requisição.
- **Medido (edge-runtime 1.77.8, Deno 2.1.4; `process.cpuUsage()` e `rss` devolvem 0 no sandbox, então a CPU é o tempo dos trechos síncronos):** corpo de 2 MiB (JPEG válido de 2048x2048), 10 envios completos: leitura do corpo em fluxo 34 a 106 ms (é espera de rede); SHA-256 1,4 a 5,7 ms com o worker quente e 38 ms na primeira chamada; cópia dos pedaços 3 ms; resposta inteira, com Auth, Storage e `commit_proof`, 181 a 784 ms; memória (heap mais buffers) 18 a 31 MiB de 256. Pior caso do leitor de JPEG, 2 MiB de 524 mil segmentos vazios ou só `FF`: 2 a 8 ms. A primeira chamada de um worker frio leva cerca de 2,3 s de relógio no cliente. Nenhuma requisição se aproximou dos 2 s de CPU.
- **Alterações:**
  - `proof-validate/index.ts`: na ordem do ADR. JWT e usuário (anon dá 401); `Content-Type`, `Content-Length` e `x-proof-meta` (Zod) sem gastar o nonce; `claim_proof_challenge`; corpo em fluxo (`body.ts`: um buffer de `maxBytes + 1`, para no byte que passa do limite, cancela o fluxo, e desiste em 30 s); forma do JPEG e arestas (`checks.ts`: `FF D8 FF`, `FF D9`, segmentos até o SOF e o SOS, sem decodificar); SHA-256 dos bytes recebidos contra o declarado; duplicata; haversine com a imprecisão a favor do usuário (sem local no contexto, ignora o que veio; coordenadas nunca gravadas nem logadas); `clock_mismatch`; upload com `upsert: false` em `<ocorrência>/<nonce>.jpg`; `commit_proof`. Falha com SQLSTATE do banco: remove o objeto. Falha ambígua (conexão perdida, que pode ter gravado): o objeto fica, porque linha sem foto é pior que foto sem linha, e a retenção remove o que nenhuma linha aponta.
  - `proof-url/index.ts`: lê `id` e `photo_deleted_at` com o JWT do usuário (a RLS decide), depois `storage_path` e a URL com service role. Colega, ex-membro, admin em tarefa privada e prova inexistente recebem a mesma resposta 403.
  - `proof-retention/index.ts`: só `x-cron-secret`, comparação de tempo constante. `proofs_due_for_retention`, remove os objetos, marca (10 por vez, até 90 s), órfãos, desafios velhos. Repetir é seguro e uma execução interrompida continua na seguinte.
  - `_shared/http.ts` (CORS, cliente de serviço, comparação do segredo, usuário do JWT); `deno.json` de cada função; `config.toml` com os três blocos (`verify_jwt` true, true, false).
  - Testes: `validate.integration.test.ts` (35), `url.integration.test.ts` (8), `retention.integration.test.ts` (6) e `checks.test.ts` (19, unidade: JPEG, local, relógio e leitor de corpo), com `_shared/proof-kit.ts` e `jpeg-fixture.ts` (gera JPEGs válidos, sem binário no repositório; o GDI+ abre os de 640x480, 333x321 e 2048x2048). `functions:test` agora espera as quatro funções responderem (`_shared/wait-for-functions.mjs`) e roda os arquivos em série.
- **Descobertas do ambiente local:**
  - O Kong guarda o corpo inteiro antes de repassar. Por ele, uma foto que para no meio nunca chega à função, e a função não é vista parando. Os testes de fluxo falam direto com o Edge Runtime (`nc` dentro do contêiner do Kong, HTTP/1.1 em pedaços).
  - O runtime segura a resposta da função até o remetente fechar o corpo, mesmo quando a função já respondeu (413, 408, 409). A função para de ler no limite e libera a memória, mas o cliente só vê a recusa quando termina de enviar. Registrado no handoff para `prova-foto`.
  - A URL assinada sai com o host `http://kong:8000` (o `SUPABASE_URL` dentro do Docker); o app local precisa trocar a origem. Em produção é o endereço público.
  - O console das funções vai para o stderr do contêiner `supabase_edge_runtime_azkaban` (`docker logs`).
  - O Auth limita 30 logins por 5 minutos por IP; os testes assinam um token com o segredo JWT demo da pilha local, e um teste por arquivo faz o login de verdade.
  - O runtime local recicla workers parados, e o primeiro pedido a um deles pode dar 502 (a segunda execução seguida de `functions:test` falhou nove testes do `materialize` assim, antes do script de espera).
- **Arquivos/módulos principais:** `supabase/functions/proof-validate`, `proof-url`, `proof-retention`, `_shared`, `supabase/config.toml`, `package.json` (`functions:test`), handoffs `20261101-1901-backend-funcoes-para-prova-foto-*` e `-para-arquiteto-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** (1) Fora de `proofErrorCodeSchema`: `unauthorized` 401, `invalid_request` 400, `method_not_allowed` 405, `upload_timeout` 408 (corpo parado) e `internal` 500; pedido ao arquiteto. (2) Status: `challenge_invalid` e `challenge_used` 409, `challenge_expired` 410, `forbidden` 403, `proof_too_large` 413, `proof_bad_type` 415, `proof_bad_dimensions`, `proof_hash_mismatch` e `proof_out_of_radius` 422, `proof_duplicate` 409. (3) O consentimento é cobrado só em `issue_proof_challenge`; a função não o relê, e a janela é de 5 minutos. (4) Sem SOF antes do SOS, o JPEG é `proof_bad_dimensions` (0 x 0), como no handoff; fim do arquivo sem `FF D9` ou segmento que passa do fim é `proof_bad_type`. (5) `x-proof-meta` acima de 4096 caracteres é recusado antes do Zod.
- **Como testar:** `pnpm exec supabase start`; `cp supabase/functions/.env.example supabase/functions/.env`; `pnpm exec supabase functions serve` (não edite `supabase/functions` enquanto roda); `pnpm functions:test` (cerca de 2,5 minutos, 80 testes).
- **Verificado:** `pnpm check` e `pnpm functions:test` duas vezes seguidas, 80 de 80. Enfraquecimentos feitos de propósito (cada um falhou nos testes certos): Content-Length sem checar antes do nonce; fluxo sem limite (integração e unidade); corpo recusado antes de gastar o nonce; JPEG sem inspeção; hash sem comparação; objeto não removido após `commit_proof` falhar; `proof-url` lendo como service role; retenção sem remover o objeto; segredo do cron sem comparação; `clock_mismatch` nunca levantado; imprecisão não subtraída (integração e unidade); coordenada gravada; retenção sem marcar a prova. Provado também: reaberta antes e durante o envio (objeto removido), tarefa arquivada durante o envio, Storage que recusa, nonce de outro usuário, vencido, usado e três envios simultâneos do mesmo (um vence, um objeto), 2 MiB exatos passam e 2 MiB mais 1 não, 30 s de corpo parado, URL assinada que serve e deixa de servir em 60 s, o cliente sem escrita no bucket (usuário e anon: envio, sobrescrita, URL de envio, URL de leitura, download, remoção e listagem), logs sem nonce, hash, coordenadas, caminho nem identificadores.
- **Não verificado:** nada foi implantado nem testado no projeto hospedado. O limite hospedado de corpo (a documentação não traz número), a CPU real lá e a partida a frio de lá. `outOfRadius = 'block'` só tem teste de unidade, porque `proofRules` é constante. O ramo de falha ambígua do `commit_proof` (conexão perdida) não é exercitado. O cron só chama a função com `proof_retention_url` e `cron_secret` no Vault, que não existem localmente. O lote completo de 500 provas e o `moreDue` não têm teste. A foto de uma câmera real não passou por aqui: os JPEGs são gerados.
- **Pendências / próximos passos:** `arquiteto` decide sobre `upload_timeout`; `prova-foto` parte do handoff novo (a resposta só chega depois do fim do corpo; trocar a origem da URL assinada no ambiente local); primeira implantação confirma o corpo de 2 MiB no projeto hospedado e cria `proof_retention_url` no Vault.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 20:20 (BRT)

- **Branch:** feat/proof-tasks, criada a partir de feat/phase-3-proof (e3af38d)
- **Agente(s):** tarefas-calendario
- **Resumo:** F3-8. Listas, detalhe, calendário e formulários de tarefa e de contexto passam a conhecer a prova por foto (ADR-0007) e o atraso preservado ao reagendar (ADR-0005, seção 11). Não construí câmera, envio nem revisão do admin: deixei o ponto de entrada para `prova-foto`.
- **Alterações:**
  - Contratos (autorizado pelo handoff do arquiteto): `proofReviewStatus` (ocorrência e histórico), `requiresPhotoProof` e `requiresAdminApproval` (linha da lista) e `location` do contexto deixam de ser opcionais. `packages/data` seleciona e mapeia tudo; o repositório de contextos grava as quatro colunas do local juntas.
  - Core: `canTransition` e `availableTransitions` recebem `requiresPhotoProof` e `canReviewProof`; `done` em tarefa com foto responde `proof_required`, e ocorrência contestada só muda para quem revisa (`proof_disputed`), na ordem da RPC. Novos: `canSendProof`, `canReviewProof`, `forgivesOverdue`, `proofFlagsLocked`, `offersAdminApproval`. `occurrenceXp` dá 0 a `done` em análise. `DaySummary.reviewing`. `buildTaskInput` descarta aprovação sem foto ou sem grupo.
  - Telas: `reviewing={proofReviewStatus === 'in_review'}` em Hoje, áreas, Calendário (mês, semana, dia) e detalhe, com texto além do ícone ("Em análise", "Foto contestada", "Pede foto para concluir"). O detalhe mostra o motivo da contestação e esconde as ações de quem não pode revisar; o histórico mostra aprovação e contestação. O check de tarefa com foto fica desligado sem o encaixe de `prova-foto`: `onProof` em Hoje e nas áreas, `children` no detalhe.
  - Formulário de tarefa: interruptores de foto e de aprovação (aprovação só com foto, em grupo e com responsável que não é quem edita; travados quando `proofFlagsLocked`). Formulário de contexto: local opcional (endereço, "usar minha localização atual", raio, remover). Reagendar vencida avisa que continua atrasada.
  - i18n: mensagens próprias para `proof_required`, `proof_flags_locked`, `proof_disputed` e `overdue_occurrence_blocks_edit`. `PROVISIONAL` saiu de `bands` em `config.ts`.
  - `@azkaban/platform` entrou nas dependências de `feature-contexts` (lockfile: uma linha).
- **Arquivos/módulos principais:** `packages/contracts/src/{tasks,contexts}.ts`, `packages/core/src/tasks/{transitions,actors,xp,form,calendarDay,today}.ts`, `packages/data/src/{tasks,contexts}`, `packages/features/{tasks,calendar,contexts}`, `packages/i18n/src/pt-BR/{tasks,calendar,contexts}.json`, `e2e/tasks-proof.spec.ts`, `e2e/proof-fixtures.ts`, handoffs `20261101-1959-tarefas-calendario-para-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** (1) Quem pode revisar, na lista, é calculado com o responsável da ocorrência como autor da prova; o banco decide com o autor real. (2) Ocorrência reagendada que continua atrasada aparece uma vez, em "Atrasadas", e não na lista do dia nem na meta, mesmo que o novo dia seja hoje. (3) `lng` é opção reservada do `t()`: usei `latitude` e `longitude`.
- **Como testar:** `pnpm check`, `pnpm db:test`, `pnpm functions:test`, `pnpm e2e` (`e2e/tasks-proof.spec.ts` é o novo).
- **Verificado:** `pnpm check` (500 testes em core, 16 em contracts); `pnpm db:test` (906); `pnpm functions:test` (80 de 80); e2e completo (40 de 40) duas vezes seguidas, por uma configuração local na porta 8091, porque a 8081 estava ocupada pelo servidor de outro projeto. Mutações que os testes pegaram: 9 de unidade (sem `proof_required`, sem `proof_disputed`, `in_review` pagando XP, resumo do dia sem `reviewing`, câmera para quem não é o responsável, perdão ignorando o novo responsável, trava de foto sempre aberta, autor revisando, aprovação sem foto, aprovação oferecida a quem faz) e 9 de tela (linha e calendário sem `reviewing`, aviso de atraso, mensagem de `proof_required`, local sem ponto, lista sem o campo, "feito" em tarefa com foto, aprovação sempre à mostra, endereço perdido). Inspeção visual em 375 px, claro e escuro.
- **Não verificado:** nada rodou em aparelho real, iOS ou Android, nem no projeto hospedado. Os estados "em análise" e "contestada" foram criados pelas funções do banco (`e2e/proof-fixtures.ts`), não por uma foto de verdade, porque a câmera é de `prova-foto`. A trava dos interruptores (`proof_flags_locked`) só tem teste de unidade: com a matriz atual quem tem `task.edit_assigned` também tem `task.manage_group`, e nenhuma tela chega nesse estado. As mensagens de `proof_disputed`, `proof_flags_locked` e `overdue_occurrence_blocks_edit` foram provadas com a resposta do servidor simulada. A fila offline (F8-5) ainda não existe, então a recusa de `done` em tarefa com foto fica para ela.
- **Pendências / próximos passos:** `prova-foto` liga o encaixe (rota de captura, `onProof`, `children` do detalhe) e troca a asserção de check desligado no e2e; o `db:test` falha se rodar sobre um banco usado pelo e2e (o teste de desafios espera zero): rode `supabase db reset` antes.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 20:37 (BRT)

- **Branch:** chore/test-isolation, criada a partir de feat/phase-3-proof (962888a)
- **Agente(s):** qa-testes
- **Resumo:** Três correções de infraestrutura de teste: a E2E tem porta própria e não reaproveita servidor, a pilha local não sobe mais analytics e vector, e o `db:test` não depende mais do banco limpo.
- **Alterações:**
  - `playwright.config.ts`: a E2E sobe o app em `http://localhost:8091` com `pnpm dev --port 8091` e `reuseExistingServer: false`. `pnpm dev` continua na 8081.
  - `supabase/config.toml`: a porta 8091 entrou em `additional_redirect_urls`, senão os links de e-mail da E2E cairiam no `site_url` (8081), que não mudou. `[analytics] enabled = false`, o que também remove o contêiner do vector.
  - `supabase/tests/rls_proof.test.sql`: "nobody has a challenge yet" conta só os desafios dos seis usuários do teste. O número de asserts não mudou (481).
  - `.github/workflows/ci.yml`: sem mudança. No CI nada ocupa a 8091, e o Playwright sobe o servidor como antes.
- **Arquivos/módulos principais:** `playwright.config.ts`, `supabase/config.toml`, `supabase/tests/rls_proof.test.sql`
- **Migrations:** nenhuma
- **Decisões/ADRs:** Sem reaproveitar servidor, nem o deste projeto: uma porta fixa não diz de qual worktree é o servidor que responde. Custo: cada `pnpm e2e` sobe o Expo de novo, e um servidor esquecido na 8091 faz a rodada falhar com "is already used". Quem altera a config precisa reiniciar a pilha local para valer o redirect novo.
- **Como testar:** `pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm e2e`, e depois `pnpm db:test` sem `supabase db reset`.
- **Verificado:** Medido nesta máquina com a 8081 ocupada por um servidor HTTP descartável, que registrou só a minha sonda e nenhum pedido da suíte: `pnpm e2e` 40 de 40 em 122 s; `pnpm db:test` depois dela, sem reset, 906 testes em 29 s; `pnpm functions:test` 80 de 80 em 157 s; `pnpm check` em 18 s, com o turbo inteiro em cache. O teste de magic link passou na 8091. Duas rodadas seguidas de `e2e/shell.spec.ts` passaram, então o encerramento do servidor não trava a seguinte. Com um servidor estranho na 8091, a suíte recusou com "is already used" e saiu com código 1. No mesmo banco sujo (1 desafio deixado pela E2E) o assert antigo falhou com have 1, want 0, e o novo falhou com um desafio de Duda inserido de propósito. Sem contêiner de vector ou analytics, e `docker logs supabase_edge_runtime_azkaban` segue trazendo o log das funções (702 linhas após os testes).
- **Não verificado:** A rodada não foi repetida com o `expo start` do outro projeto na 8081, porque ele foi encerrado durante o trabalho: a prova usou o servidor descartável. O workflow do CI não rodou. A economia de memória não foi medida: não há leitura de antes, só a soma de agora, cerca de 1,6 GiB na pilha. O Studio não foi aberto, e as telas de log dele dependem de analytics.
- **Pendências / próximos passos:** A nota do bloco anterior sobre rodar `supabase db reset` antes do `db:test` deixou de valer. O assert agora ignora dados de outros usuários de propósito, então desafios deixados por seeds não seriam pegos por ele.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 20:44 (BRT)

- **Branch:** docs/proof-closeout, criada a partir de feat/phase-3-proof (be426b9)
- **Agente(s):** arquiteto
- **Resumo:** Fecha as pendências de contrato e documentação da prova: `upload_timeout` entra em `proofErrorCodeSchema`, os outros códigos ficam fora com critério escrito, e "nada em disco" passa a exigir apagar a foto bruta do nativo.
- **Alterações:**
  - `packages/contracts/src/proof.ts`: `upload_timeout` em `proofErrorCodeSchema`, e o comentário diz que a lista só tem o que tem mensagem própria.
  - `packages/contracts/src/proof.test.ts`: fixa quem entra e quem fica fora.
  - `docs/adr/0007-prova-por-foto.md`: seção 19 nova (códigos de erro), seção 16 reescrita na parte de disco, passo 4 da seção 3 nomeia o código, alternativa de `transportErrorCodeSchema`.
  - `docs/arquitetura.md`: lib `dom` e adapters sem tela, seção i18n com a armadilha do `{{lng}}`, e a dependência de feature em `@azkaban/platform`.
- **Arquivos/módulos principais:** `packages/contracts/src/proof.ts`, `docs/adr/0007-prova-por-foto.md`, `docs/arquitetura.md`, handoffs `20261101-2042-arquiteto-para-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0007, seções 16 e 19. (1) A lista guarda só o que a tela nomeia; o resto é falha genérica. (2) `upload_timeout` entra; `unauthorized`, `invalid_request`, `method_not_allowed` e `internal` ficam fora, sem schema à parte. (3) `invalid_consent_version`, `invalid_decision` e `invalid_storage_path` ficam fora. (4) O nativo apaga o arquivo bruto do `expo-camera` no `finally` de `capture`. (5) `feature-contexts` depender de `@azkaban/platform` está aprovado.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passou, com 24 testes em contracts. `scripts/check-permission-mirror.mjs` não lê `proofErrorCodeSchema`, então não mudou. Fontes do `expo-camera` 58 (Android e iOS): grava o arquivo sempre, mesmo com `base64`. Fontes do `react-native-view-shot`: `result: 'base64'` não cria arquivo.
- **Não verificado:** `pnpm functions:test`, `pnpm db:test` e `pnpm db:check-permissions` não rodaram, por decisão da tarefa e porque esta mudança não toca função nem banco. Nada rodou em aparelho.
- **Pendências / próximos passos:** `prova-foto`: mensagem de `upload_timeout` e apagar a foto bruta, com `expo-file-system` como dependência direta de `packages/platform`. `backend-funcoes`: `upload_timeout: 408` em `STATUS`; sem isso, o tipo fica incompleto em código que `pnpm check` não compila, e nada muda em execução. F8-7 confere no aparelho que o cache fica vazio.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 21:51 (BRT)

- **Branch:** feat/proof-capture, criada a partir de feat/phase-3-proof (be426b9), com merge de 4ba1dbf
- **Agente(s):** prova-foto
- **Resumo:** F3-5 e F3-6. A prova por foto existe de ponta a ponta na web: aviso, desafio, localização, câmera, carimbo, conferência, `proof-validate`, resultado, fila do admin, foto por `proof-url`, aprovação e contestação.
- **Alterações:**
  - `packages/features/proof`: `useProofFlow` (o fluxo, na ordem do ADR, com a foto só na memória), `ProofCaptureScreen`, `ProofQueueScreen`, `ProofReviewScreen`, `ProofButton`, `ProofLink`, `ProofQueueLink`, e `recovery.ts`, a tabela do que fazer depois de cada falha. Depois de qualquer falha, o fluxo relê a ocorrência: se já está `done`, é sucesso. Rede, 5xx, `upload_timeout` e `invalid_request` mantêm a foto, que vai com outro desafio; erro de foto ou de desafio volta à câmera; o resto volta à tarefa. Passou de `expiresInSeconds`, a foto é descartada.
  - `packages/data/src/proof`: `proofRepository`, uma função por RPC e função. `transport.ts` traz os códigos locais (`unauthorized`, `invalid_request`, `method_not_allowed`, `internal`, `network`), a leitura das respostas do gateway e `reachableUrl`, que troca só `http://kong:8000/` pelo endereço da API. Qualquer outro host passa intacto, então produção não muda. `useCurrentUser` ganhou `displayName`, para o carimbo.
  - `packages/platform`: `new File(uri).delete()` no `finally` de `capture`, em `try/catch` (ADR-0007, seção 19); `photoDataUri`, a pré-visualização em memória; `useOnline` (web lê o navegador, nativo fica verdadeiro até F8-5); `appVersion`. `expo-file-system` e `expo-constants` viraram dependências diretas.
  - `apps/app`: rotas `tasks/[id]/proof`, `proofs/[id]` e `reviews/[groupId]`; `onProof` em Hoje e nas áreas; `ProofButton` nos `children` do detalhe; `ProofLink` acima do detalhe, para quem pode ver a foto; `ProofQueueLink` na página do grupo. `app.config.ts`: plugins com textos em pt-BR, `recordAudioAndroid: false`, e também `microphonePermission`, `locationAlwaysPermission` e `locationAlwaysAndWhenInUsePermission` em `false`, sem os quais o iOS declararia microfone e localização em segundo plano com o texto padrão.
  - i18n: `proof.json`, com mensagem para os 20 códigos do contrato, os locais, `PhotoError` e os motivos da câmera.
  - `e2e/proof-capture.spec.ts`, novo; os ajudantes de tela foram de `tasks-proof.spec.ts` para `proof-fixtures.ts`. As asserções de check desligado viraram "o check leva à câmera".
- **Arquivos/módulos principais:** `packages/features/proof`, `packages/data/src/proof`, `packages/platform/src/{ProofCamera.native.tsx,network*.ts,photo.ts}`, `apps/app/app/(app)`, `apps/app/app.config.ts`, `packages/i18n/src/pt-BR/proof.json`, `e2e/proof-capture.spec.ts`, handoffs `20261101-2114-prova-foto-para-qa-testes-*` e `20261101-2150-prova-foto-para-banco-de-dados-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** (1) O admin chega a uma prova `unreviewed` ou contestada por `ProofLink`, composto pela rota acima de `TaskDetailScreen`, porque os `children` da tela só aparecem enquanto há foto a enviar. A fila mostra só `in_review`, como pedido. (2) Pré-visualização em `data:` URI nas duas plataformas, em vez de `createObjectURL`: uma função só, nada a revogar. (3) Câmera quadrada: em 3:4 o botão de disparo caía abaixo da dobra em 375x812. (4) Sem tempo limite no cliente para o envio, porque a resposta só chega depois do fim do corpo. (5) Aviso por versão: `consentPending` só evita uma ida à RPC, e quem decide é o servidor: `proof_consent_required` também abre o aviso.
- **Como testar:** `pnpm check`; `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`; `pnpm exec supabase functions serve`, `pnpm functions:test`, `pnpm e2e`. A E2E de câmera exige Chrome instalado.
- **Verificado:** `pnpm check` (500 em core, 38 em platform, 24 em contracts, 7 em ui, 7 em data, 6 em feature-proof, 3 em config); `pnpm db:test` 906 depois de reset; `pnpm functions:test` 80 de 80; `pnpm e2e` 50 de 50 em duas rodadas seguidas (157 s e 143 s); `pnpm build:web`; `expo export --platform android`; `expo config --type introspect` com câmera e `WhenInUse`, e sem microfone, `Always` nem `RECORD_AUDIO`. A E2E usa a câmera falsa do Chrome e os fluxos reais, sem fixture no envio: o hash dos bytes baixados do bucket bate com `task_proofs.sha256`, o carimbo foi conferido a olho. Falhas simuladas só na resposta do servidor: perda da resposta depois do commit, pedido que nunca chegou, `proof_hash_mismatch`, `upload_timeout`, 401 do gateway, `proof_consent_required`, `challenge_rate_limited`, encoder falhando. 24 mutações pegas, 5 de unidade e 19 de E2E; uma sobreviveu na primeira rodada (pedir localização sem local no contexto), porque o Chrome sem tela responde "denied" antes de perguntar; o teste foi corrigido e pegou na segunda. Inspeção visual em 375 px, claro e escuro: detalhe, aviso, câmera, conferência, resultado, revisão, contestação e fila, sem rolagem horizontal. Encontrado na revisão e corrigido: depois de uma falha, "Tirar outra" abria a câmera sem desafio, e a foto nova era ignorada.
- **Não verificado:** nada rodou em iOS, Android nem no projeto hospedado. `new File(uri).delete()`, o carimbo nativo e o `Image` com `data:` URI só compilam: ficam para o roteiro de F8-7. Sem foto real: as 51 provas da câmera falsa deram 24 KB em média e 27 KB no máximo (1600x900), um quadro quase sem detalhe que não serve para a conta da seção 18 do ADR, então a medição continua pendente. O 503 de uma rodada não foi explicado (abaixo). A URL vencida não foi testada aqui, porque leva 60 s: `url.integration.test.ts` cobre, e a E2E prova só que cada abertura pede outra. A suíte com `channel: 'chrome'` não rodou no CI.
- **Instabilidade observada:** antes das duas rodadas verdes, duas rodadas tiveram falhas fora do fluxo de foto: uma com 4 falhas, 503 em `proof-validate` e repetições que não apareceram, porque o Edge Runtime reiniciou às 21:44 durante a rodada, sem causa encontrada; outra com `tasks-ui-fixes.spec.ts:69`, que faz `goto` logo depois de Salvar sem esperar a gravação. Não alterei esse teste.
- **Pendências / próximos passos:** `banco-de-dados` ajusta `rls_proof.test.sql:1326`, que aborta com objetos reais no bucket: até lá, `db:test` depois da E2E exige `supabase db reset`. `qa-testes` confirma o Chrome no CI. `backend-funcoes` ajusta o `STATUS` de `proof-validate`. Medir o tamanho da foto em aparelho real.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 23:12 (BRT)

- **Branch:** chore/qa-phase-3, criada a partir de feat/phase-3-proof (28767bd)
- **Agente(s):** qa-testes
- **Resumo:** QA da Fase 3 no estado integrado. A instabilidade da E2E vinha de cinco causas, todas encontradas: duas do runtime local, duas corridas de teste e um bug do app. A suíte tem 55 testes, com 5 novos, e passou 6 rodadas seguidas. O fluxo de prova cumpre a regra central, e sobram dois achados de severidade média, em handoff.
- **Alterações:**
  - `playwright.config.ts`: 4 workers fora do CI, e a explicação de por que não usar `functions serve` durante a suíte.
  - `package.json`: `pnpm e2e` chama `wait-for-functions.mjs` antes, reaproveitando o script de `functions:test`.
  - `e2e/proof-paths.spec.ts`, novo: ex-membro (tela, câmera e `proof-url`), contestação para vermelho com XP, reabrir exige foto nova, recusa real do servidor e foto mantida sem conexão.
  - `e2e/tasks-ui-fixes.spec.ts`: espera a gravação antes do `goto`; regressão do detalhe defasado, com `test.fail()` só na última asserção.
  - `e2e/tasks-order.spec.ts` e `e2e/tasks.spec.ts`: esperam a resposta da gravação antes de recarregar ou abrir o detalhe.
  - `e2e/proof-capture.spec.ts`: 30 s para a resposta do servidor. Comentários de sete arquivos não pedem mais `functions serve`.
  - `.github/workflows/ci.yml`: `playwright install --with-deps chromium chrome` (autorizado pelo orquestrador).
  - `supabase/tests/rls_proof.test.sql`: correção do handoff `20261101-2150` (autorizado pelo orquestrador).
- **Causas da instabilidade:**
  1. **503, Edge Runtime reiniciando.** `supabase functions serve` no Windows trata como escrita a atualização do último acesso que o NTFS faz a cada hora. Provado: com o último acesso recuado, só ler `proof-kit.ts`, com `mtime` e hash iguais, gerou `File change detected ... (WRITE)` e derrubou o runtime por cerca de 6 s (19 s sob carga, no log anterior, às 21:39:55, com 21:44 e 21:50 logo depois). `supabase start` já serve as funções, sem observador, e não reiniciou nem com escrita real.
  2. **546, limite de CPU do worker local.** 2 s fixos, sem opção de configuração, e `proof-validate` não tem repetição do runtime por ter corpo. Foi sempre a primeira chamada de `proof-validate` da rodada: 3 de 6 rodadas com 8 workers, 0 de 8 com 4.
  3. **`tasks-ui-fixes.spec.ts:69`: corrida do teste, confirmada.** Foi a hipótese do relatório: `goto` logo depois de Salvar.
  4. **`tasks-order.spec.ts:18`: corrida do teste, nova.** O trace mostra `set_occurrence_status` abortado pelo `reload`, depois do check otimista.
  5. **`tasks.spec.ts:78`: bug do app, novo.** Leitura do detalhe que cruza o commit nunca é repetida. Reproduzido sem depender de tempo; handoff.
  - Também: uma espera de 16 s por um worker aposentando (`proof-capture:178`, em 8 rodadas uma vez), acima dos 15 s do `expect`.
  - **Memória não foi causa:** pico de 2,0 GiB de 7,4 GiB na pilha, nenhum `OOMKilled`, zero reinício do contêiner sem `functions serve`. O Edge Runtime chegou a 805 MiB. O host fica apertado: 0,05 GB de RAM física livre no pior momento, de 15,3 GB, com o Chrome da suíte.
- **Arquivos/módulos principais:** `e2e/`, `playwright.config.ts`, `package.json`, `.github/workflows/ci.yml`, `supabase/tests/rls_proof.test.sql`, handoffs `20261101-2240-*`, `20261101-2300-*`, `20261101-2310-*`
- **Migrations:** nenhuma
- **Decisões/ADRs:** (1) Bugs conhecidos ficam como `test.fail()` só na asserção do bug: passam hoje, falham quando corrigidos, e qualquer falha na preparação conta como falha de verdade. (2) `workers: 4` só fora do CI. (3) Não removi `functions serve` do `ci.yml`: no Linux não há esse reinício, e a mudança não foi pedida. (4) Sem `retries` no Playwright: esconderiam justamente estas causas.
- **Como testar:** `pnpm db:start`, sem `functions serve`; `pnpm e2e`, `pnpm functions:test`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm build:web`, `pnpm check`.
- **Verificado:** `pnpm e2e` 55 de 55 em 6 rodadas seguidas (177 a 197 s), a última às 23:07, para cobrir a última hora do dia. Antes das correções, a mesma suíte de 50 falhou em 3 de 4 rodadas (160 a 168 s). `pnpm functions:test` 80 de 80 em 163 s, sem `functions serve`. `pnpm db:test` 906 de 906 depois da E2E, sem reset, com 158 objetos reais no bucket, em 82 s. `pnpm db:check-permissions`: matriz, 23 transições, regras de tarefa e de prova, bucket, fusos e `api.schemas` em dia. `pnpm build:web` em 24 s. `pnpm lint`, `pnpm boundaries`, e `turbo run typecheck test --force`, sem cache: 500 em core, 38 em platform, 24 em contracts, 7 em ui, 7 em data, 6 em feature-proof, 3 em config. Mutações temporárias, todas revertidas: recuperação de `proof_hash_mismatch` e contestação sempre em amarelo foram pegas; `can_view_proof` aberta **sobreviveu** à primeira versão do teste de ex-membro, porque a tela já some pelo `!inner` da tarefa; o teste passou a chamar `proof-url`, com controle de 200 antes da remoção, e pegou (403 esperado, 200 recebido). Inspeção visual em 375 px e 1280 px, claro e escuro: formulário, detalhe, aviso, câmera quadrada, conferência, resultado, Hoje, fila, revisão e contestação, sem rolagem horizontal, com a câmera vista nas duas larguras e nos dois temas e as demais telas por amostra. Disparo acima da dobra em 375x812 com título de três linhas. Foram percorridos: membro fica verde, aprovação sem XP até aprovar, contestação, foto recusada pelo servidor, offline, tarefa com local, fila, ex-membro e autor sem botões.
- **Não verificado:** o CI não rodou, então `chrome` no `ubuntu-latest` e a câmera falsa no Linux seguem sem prova. Nada rodou em iOS, Android nem no projeto hospedado. `pnpm db:test` **falha** entre 23:00 e 23:59, por uma fixture de `rls_tasks.test.sql` que não é minha (handoff): com o ajuste temporário de uma linha, revertido, deu 906. Editar uma função com a pilha de `supabase start` no ar não foi testado. A relação entre `workers: 4` e o fim do 546 é medida em rodadas, com o aquecimento entrando nas 6 últimas: não separei o efeito de cada um. O tamanho de foto real segue sem medida: a câmera falsa dá 24 KB em média.
- **Pendências / próximos passos:** `prova-foto`: prova de tarefa excluída presa na fila e Equipe sem as provas aguardando (médias), mais cinco itens baixos. `tarefas-calendario`: detalhe defasado. `banco-de-dados`: fixture de `rls_tasks.test.sql:487`. Orquestrador: `CLAUDE.md` passa a dizer que `functions:test` exige só `db:start`. `arquiteto`: passos de `functions serve` no `ci.yml`. `backend-funcoes`: mensagem de `wait-for-functions.mjs`, `upload_timeout` em `STATUS` e conferir `WORKER_LIMIT` na primeira implantação.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 23:31 (BRT)

- **Branch:** chore/security-phase-3, criada a partir de feat/phase-3-proof (6fe9c01)
- **Agente(s):** revisor-seguranca
- **Resumo:** Revisão de segurança da Fase 3, com PoC executado na pilha local. Nenhuma tarefa criada por um admin ficou verde sem prova, e não há achado crítico ou alto. São cinco achados médios e cinco baixos, em quatro handoffs. Dois médios bloqueiam o uso com pessoas reais: retenção que pode não rodar e lacunas de LGPD.
- **Alterações:**
  - Só documentação: quatro handoffs e esta entrada. Nenhum código de produção mudou, e os scripts de PoC ficaram fora do git.
- **Achados:** SEG-1 (média): o membro desliga a foto que o admin exigiu na tarefa própria, e ela fica verde com XP, sem rastro. SEG-2 (média): `visibility = 'private'` ou `delete_task` tiram a prova do revisor, e o item 1 do QA paga XP pela retenção. SEG-3 (média): apagar o grupo zera os limites; 60 provas e 120 MiB de órfãos em duas voltas. SEG-4 (média): retenção sem Vault não faz nada, em silêncio. SEG-5 (média): sem revogação, sem base legal e sem prazo para o registro. SEG-6 (baixa): `proof-url` lê corpo sem limite e 400 MiB derrubam o worker. SEG-7 (baixa): excluir a conta apaga a prova, ao contrário do comentário do schema. SEG-8 (baixa): a retenção apaga foto contestada. SEG-9 (baixa): tarefa privada que vira de grupo mostra as fotos antigas ao admin. SEG-10 (baixa): `appVersion` com NUL dá 500 depois de gastar o nonce.
- **Arquivos/módulos principais:** `docs/agentes/handoffs/20261101-2331-revisor-seguranca-para-{arquiteto,banco-de-dados,backend-funcoes,auth-grupos}-*.md`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma. As decisões pedidas estão no handoff para `arquiteto`.
- **Como testar:** `pnpm db:start`, sem `functions serve`, e os passos de "Como testar" de cada handoff, com `supabase/functions/_shared/proof-kit.ts`.
- **Verificado:** como cliente hostil, com resultado observado: RPC e PostgREST direto, embed, `select` por coluna, Storage por todas as rotas (leitura, listagem, upload, TUS, troca, remoção e URL assinada), JWT forjado, nonce reusado, em corrida, alheio e vencido, JPEG malicioso, `x-proof-meta`, coordenadas falsas, `proof-url` por colega, ex-membro e tarefa privada, `x-cron-secret`, e XP em laço e corrida. Também `pnpm build:web` com busca no bundle e varredura do histórico. Catálogo: `security definer` com `search_path`, sem `execute` para `anon`, RLS em toda tabela, nenhuma política em `storage.objects`, publicação de realtime vazia.
- **Não verificado:** nada rodou no projeto hospedado: limite de corpo, logs de requisição com `x-proof-meta`, cabeçalhos do Storage. `proofRules.outOfRadius = 'block'` não rodou de ponta a ponta. Nada em iOS ou Android. `pnpm audit --prod` mostrou 2 moderadas, em cadeia de ferramentas do Expo, sem análise de impacto. `pnpm db:test`, `pnpm functions:test` e `pnpm e2e` não rodaram: nenhum código mudou.
- **Pendências / próximos passos:** `arquiteto`: decidir SEG-1, SEG-2, SEG-8 e SEG-9. `banco-de-dados`: SEG-3 e SEG-7. `backend-funcoes`: SEG-4, SEG-6 e SEG-10. `auth-grupos`: SEG-5 em F8-3. Humano: base legal para funcionários.

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 23:44 (BRT)

- **Branch:** docs/proof-security-decisions, criada a partir de feat/phase-3-proof (d223e4b)
- **Agente(s):** arquiteto
- **Resumo:** Decisões sobre os achados de segurança e do QA da prova, na seção 20 do ADR-0007, com contrato e um handoff por dono. Nenhuma migration ou tela mudou: a implementação está nos handoffs.
- **Alterações:**
  - `docs/adr/0007-prova-por-foto.md`: seção 20 e ajustes nas seções 2, 8, 10, 14 e 17, Alternativas e Consequências.
  - `packages/contracts/src/tasks.ts`: `taskSchema.proofFlagsLocked`, `taskRuleChangeSchema`, `taskRuleFieldSchema` e o código `proof_visibility_locked`.
  - `packages/contracts/src/tasks.test.ts`: o código novo.
  - Cinco handoffs `20261101-2339-arquiteto-para-*`.
- **Arquivos/módulos principais:** `docs/adr/0007-prova-por-foto.md`, `packages/contracts/src/tasks.ts`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma. Nove especificadas para `banco-de-dados`.
- **Decisões/ADRs:** SEG-1: `tasks.proof_flags_locked` tira a exceção de tarefa própria, e `task_rule_changes` registra as mudanças. SEG-2 e item 1 do QA: `can_review_proof` deixa de olhar `archived_at`, e a retenção segue pagando XP, porque excluir deixou de dar vantagem. SEG-2 e SEG-9: tarefa com prova não muda de visibilidade. SEG-3: `proof_challenges.occurrence_id` perde a chave estrangeira, e o limite diário conta `used_at`. SEG-7: vale a cascata, e F8-3 apaga antes a prova superada em ocorrência alheia. SEG-8: aceito. SEG-5: aviso versão 2, `proof_consents` e `recordRetentionDays = 365` agora; revogação, exclusão e exportação em F8-3. Quatro riscos aceitos mantidos.
- **Como testar:** `pnpm check`. O comportamento será testado por cada dono, conforme "Como testar" dos handoffs.
- **Verificado:** `pnpm check` passou. Leitura das migrations de `edit_task`, `delete_task`, `set_occurrence_status`, retenção, desafios e barreiras.
- **Não verificado:** sem pilha local, nada rodou no banco. A recusa de apagar o grupo com `on delete set null` em `proof_challenges` é dedução da ordem das cascatas, sem teste, e `pnpm db:check-permissions` não rodou. As decisões não mudam matriz nem transições, e `proofRules` só muda junto com a migration.
- **Pendências / próximos passos:** `banco-de-dados` primeiro, depois `backend-funcoes`, `tarefas-calendario` e `prova-foto`. `auth-grupos` só em F8-3. Humano: base legal para funcionários, bloqueante para esse uso; confirmar os 365 dias; contato de privacidade para o aviso; validar a seção 20 na aprovação da fase. SEG-4, SEG-6 e SEG-10 seguem com `backend-funcoes`; SEG-10 pede ajuste em `proofUploadMetaSchema`, ainda não feito.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 00:12 (BRT)

- **Branch:** fix/proof-rules-db, criada a partir de feat/phase-3-proof (b618c02)
- **Agente(s):** banco-de-dados
- **Resumo:** Nove migrations da seção 20 do ADR-0007: a exigência do admin trava a tarefa própria (SEG-1), o rastro de regras, tarefa com prova não muda de visibilidade (SEG-2, SEG-9), prova de tarefa arquivada segue revisável, os limites sobrevivem a apagar o grupo (SEG-3), `proof_consents` e o prazo do registro sem foto (SEG-5). Também a fixture de `rls_tasks` que falhava entre 23:00 e 23:59.
- **Alterações:**
  - `supabase/migrations/20261101173000` a `20261101173800`, uma por item do handoff `20261101-2339-arquiteto-para-banco-de-dados-regras-da-prova`.
  - `packages/config/src/proof.ts`: `consentVersion: 2` e `recordRetentionDays: 365`, autorizado no handoff.
  - `packages/data/src/database.types.ts`: gerado.
  - `supabase/tests/rls_proof.test.sql`: 98 asserções novas, versão 2 do aviso e limite diário por `used_at`.
  - `supabase/tests/rls_tasks.test.sql`: linha 487 com `now() - interval '2 days'`.
  - Handoffs `20261102-0009-banco-de-dados-para-{backend-funcoes,qa-testes}-*`.
- **Arquivos/módulos principais:** `supabase/migrations/`, `supabase/tests/rls_proof.test.sql`, `packages/config/src/proof.ts`
- **Migrations:** `task_proof_flags_locked`, `can_delete_task_proof_lock`, `edit_task_proof_lock`, `task_rule_changes`, `can_review_proof_archived`, `proof_limits_survive_cascade`, `proof_consents`, `proof_record_retention`, `task_proofs_user_comment`.
- **Decisões/ADRs:** nenhuma nova. Dois índices parciais além do handoff, `proof_challenges (user_id, used_at)` e `task_proofs (received_at) where photo_deleted_at is not null`, para o limite e o job não varrerem a tabela.
- **Como testar:** `pnpm db:start`, `pnpm db:test`, `pnpm db:check-permissions`. `pnpm functions:test` e `pnpm e2e` só depois dos dois handoffs.
- **Verificado:** `pnpm check` passou. `pnpm db:test` 1004 de 1004, depois da E2E, sem reset (579 em proof, 369 em tasks, 56 em groups). `rls_tasks` 369 de 369 às 23:52, dentro da hora que falhava. `pnpm db:check-permissions` em dia. Com os valores de versão trocados nas fixtures de `supabase/functions` e `e2e` e revertidos depois, porque não são meus: `pnpm functions:test` 80 de 80 e `pnpm e2e` 55 passaram, 2 deles os `test.fail()` já conhecidos. Apagar grupo com prova e XP em transações separadas: não falha, e o desafio seguinte responde `challenge_rate_limited`. 21 mutações nas barreiras, todas pegas pela suíte de prova: trava em `can_delete_task` e nos quatro pontos de `edit_task`, escopos da checagem de visibilidade, gatilho e política do rastro, `can_review_proof`, limite diário, guarda de ocorrência nula, chave estrangeira de volta, consentimentos e `delete_expired_proof_records`.
- **Não verificado:** a cópia para `proof_consents` só rodou como instrução solta, com dados simulados, porque os bancos locais nascem sem aceites. Nada rodou no projeto hospedado, nem no CI. Sem os dois handoffs, `pnpm functions:test` e `pnpm e2e` falham com `invalid_consent_version`. No teste de pgTAP, a prova do grupo apagado é de tarefa com aprovação, sem XP: uma linha de `xp_events` escrita na mesma transação dispara a própria chave na cascata. Fora da transação isso não acontece, e a PoC acima cobre o caso.
- **Pendências / próximos passos:** `backend-funcoes` e `qa-testes`: trocar a versão nas fixtures. `prova-foto`: aviso novo na mesma integração. `arquiteto`: o limite diário olha só o que já foi consumido, então nonces emitidos juntos chegam a 59 no dia, como antes desta entrega; e um admin dono da tarefa que desliga as flags postas por outro admin não solta a trava, porque só quem não é o dono a muda.
