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

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 00:28 (BRT)

- **Branch:** fix/proof-functions, criada a partir de feat/phase-3-proof (86af33c)
- **Agente(s):** backend-funcoes
- **Resumo:** `proof-retention` apaga o registro vencido, a retenção deixa de falhar em silêncio (SEG-4), `proof-url` lê o corpo com limite (SEG-6) e `appVersion` inválida é recusada antes de gastar o nonce (SEG-10). A primeira implantação ganhou uma lista versionada, e o CI usa as funções servidas por `pnpm db:start`.
- **Alterações:**
  - `proof-retention`: chama `delete_expired_proof_records` depois da limpeza de desafios, com `recordsDeleted` na resposta e no log, e `moreDue` olhando esse limite.
  - Migration nova: `call_proof_retention` levanta `proof_retention_not_configured` sem os segredos do Vault, o que marca a execução como `failed` em `cron.job_run_details`, e dá `WARNING proof_retention_overdue` quando há foto com mais de um dia além do prazo, sem desfazer a chamada.
  - `docs/implantacao.md`: banco, segredos, deploy, painel, conferências e como ler os dois sinais.
  - `proof-url`: `readLimited` no lugar de `req.text()`, com limite de 1 KiB em bytes.
  - `proofUploadMetaSchema`: `appVersion` só com ASCII imprimível, autorizado pelo orquestrador. Cobre NUL, metade de par substituto e caracteres de controle, numa regra só.
  - `proof-validate`: `upload_timeout: 408` em `STATUS`, passando por `refuse`.
  - `wait-for-functions.mjs`, `proof-kit.ts` e `.env.example`: instruções sem `functions serve`. `proof-kit` ganhou `sqlMessages`, e a versão 2 do aviso.
  - `ci.yml`: `.env` copiado antes de `pnpm db:start`, sem os passos de `functions serve`.
  - `e2e/proof-fixtures.ts`: `CONSENT_VERSION = 2`, autorizado.
- **Arquivos/módulos principais:** `supabase/functions/proof-retention`, `supabase/functions/proof-url`, `supabase/functions/proof-validate`, `supabase/migrations/20261102003000_proof_retention_signal.sql`, `packages/contracts/src/proof.ts`, `docs/implantacao.md`, `.github/workflows/ci.yml`
- **Migrations:** `20261102003000_proof_retention_signal`.
- **Decisões/ADRs:** `raise exception` para falta de segredo, porque um `warning` deixaria a execução como `succeeded`. `warning` para foto atrasada, porque `raise` desfaria a chamada na fila e a retenção nunca se recuperaria. A linha com foto vencida há mais de um ano sai na mesma execução que apaga a foto, porque a etapa de registros vem depois.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm db:test`, `pnpm functions:test`, `pnpm e2e`.
- **Verificado:** `pnpm check` passou. `pnpm db:test` 1004 de 1004. `pnpm db:check-permissions` em dia. `pnpm functions:test` 85 de 85, sem `functions serve`. `pnpm e2e` 55 de 55, sendo 2 com `test.fail` de bugs já conhecidos. Com um job de 1 segundo, `cron.job_run_details` mostrou `failed` e `proof_retention_not_configured`. Seis mutações falharam nos testes: ler o corpo todo em `proof-url` (546, com `memory limit reached` no log), limite do corpo deslocado em um byte, sem a regra de `appVersion` (500, depois de gastar o nonce), retorno silencioso sem segredo, exceção no lugar do aviso de atraso e sem esse aviso. Depois de restaurar, os testes voltaram a passar.
- **Não verificado:** nada rodou no projeto hospedado nem no CI, inclusive a lista de `docs/implantacao.md` e o `ci.yml` novo. Os comandos de deploy e de `pg_graphql` da lista não foram executados. Se `proof_retention_overdue` aparece nos logs do painel hospedado não foi visto. Metade de par substituto foi testada só como recusa, sem reproduzir o erro no Postgres. O aviso não cobre segredo errado nos primeiros 91 dias, e por isso a lista manda conferir a resposta da função.
- **Pendências / próximos passos:** não há alerta automático: alguém precisa olhar os dois sinais. `materialize-occurrences/index.ts:290` tem o mesmo `req.text()` sem limite que SEG-6 achou, alcançável por qualquer usuário autenticado, e `call_materialize_occurrences` continua silenciosa sem Vault. `CLAUDE.md` ainda diz que `pnpm functions:test` exige `functions serve`, troca que cabe ao orquestrador.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 11:57 (BRT)

- **Branch:** feat/phase-3-proof
- **Agente(s):** orquestrador
- **Resumo:** handoff para uma nova sessão do Claude Code assumir a orquestração, com o estado da Fase 3, o que falta, as pendências humanas e as armadilhas conhecidas.
- **Alterações:** `docs/agentes/handoffs/20261102-1157-orquestrador-para-nova-sessao.md` criado; F3-8 no QUADRO volta a "em andamento" na branch `fix/proof-task-rules`.
- **Verificado:** estado lido do git às 11:57: árvore limpa, HEAD `2935b7a`, `fix/proof-task-rules` em `18ca79f` (WIP, não integrado).
- **Não verificado:** nenhuma suíte rodou nesta entrada. A Fase 3 não foi verificada no estado integrado e não tem push.
- **Pendências / próximos passos:** as da seção 3 do handoff.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:16 (BRT)

- **Branch:** fix/proof-consent-v2, criada a partir de feat/phase-3-proof (86811ca)
- **Agente(s):** prova-foto
- **Resumo:** aviso da prova na versão 2, com tudo da seção 14 do ADR-0007, link da fila na Equipe, e os itens 4, 5 e 6 do QA. Parte do item 7 também, pelo lado do revisor.
- **Alterações:**
  - `proof.json`: `consent.stamp`, `consent.thirdParties`, `consent.deletion` e `consent.retention` com `{{recordDays}}`. `ProofCaptureScreen` lê `retentionDays` e `recordRetentionDays` de `proofRules`.
  - Item 2 do QA: `ProofQueueBar`, o `ProofQueueLink` com a mesma moldura de `ProofLink`, composto acima de `TeamScreen` na rota da Equipe. Rota fina, como pede o handoff do `arquiteto`.
  - Item 4: o quadrado da câmera ocupa no máximo metade da altura da janela. Em 375x812 não muda nada; em 1280x800 fica com 400 px.
  - Item 5: sem `borderRadius` nas fotos carimbadas, em "Confira a foto" e na revisão. A câmera ao vivo continua arredondada.
  - Item 6: `stampColors` em `packages/platform/src/stamp.ts`, usado pelos dois adapters. `@azkaban/ui` depende de `@azkaban/platform`, então os tokens não podem ser importados ali. Na revisão, a plataforma sai por i18n ("pelo navegador") e a versão ausente tem frase própria, sem `'?'`.
  - Item 7, só a revisão: `review.webLimit` em provas enviadas pela web. O formulário ficou com `tarefas-calendario`, por handoff.
  - E2E escrita, não executada: as frases do aviso com os números da config, o aviso de volta para quem aceitou a versão 1, o quadrado e o botão inteiros em 375x812 e 1280x800, a linha do aparelho e o aviso da web na revisão, e a prova de tarefa excluída aprovada pela fila da Equipe, com XP.
- **Arquivos/módulos principais:** `packages/features/proof/src/{ProofCaptureScreen,ProofEntry,ProofReviewScreen,index}.tsx`, `packages/platform/src/{stamp.ts,ProofCamera.web.tsx,ProofCamera.native.tsx}`, `packages/i18n/src/pt-BR/proof.json`, `apps/app/app/(app)/team/[groupId].tsx`, `e2e/proof-capture.spec.ts`, `e2e/proof-paths.spec.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma nova. Item 1 do QA, conforme o `arquiteto`: nada a mudar na fila. A frase de `deletion` é a provisória da seção 20.
- **Como testar:** `pnpm check`; com a pilha, `pnpm e2e`.
- **Verificado:** `pnpm check` passou (feature-proof 6 de 6, platform 38 de 38).
- **Não verificado:** **E2E pendente**, nem executada, porque a pilha local estava em uso por outro agente. Telas não conferidas em 375px e 1280px, claro e escuro. Nada em iOS ou Android, inclusive as cores do carimbo nativo.
- **Pendências / próximos passos:** rodar `pnpm e2e` e conferir as telas quando a pilha liberar. Item 3 do QA (`proof-current` em `useStatusChange`) e a parte do formulário do item 7 com `tarefas-calendario`, no handoff `20261102-1215-prova-foto-para-tarefas-calendario-achados-do-qa`. A versão 2 do banco já está na base, então até esta branch entrar o app mostra o aviso velho a quem aceita a versão 2.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:21 (BRT)

- **Branch:** feat/notifications-contracts, criada a partir de feat/phase-3-proof (b88ab87)
- **Agente(s):** arquiteto
- **Resumo:** abre a Fase 4. ADR-0008 decide notificações (sino, outbox, preferências, horário de silêncio, Web Push com VAPID, PWA e service worker, iPhone), o job de vermelho automático, o encaixe do WhatsApp da Fase 5, a resposta da materialização (F4-8) e a casca web (F4-9). Contratos e regras publicados; nenhuma migration, função ou tela.
- **Alterações:**
  - `docs/adr/0008-notificacoes-push-pwa-vermelho-automatico.md`: novo.
  - `packages/contracts/src/notifications.ts` e `notifications.test.ts`: tipos, canais, preferências, horário de silêncio, item do sino por tipo, inscrição e aparelho de push, payload do push com teto de bytes e caminho interno, código `push_endpoint_not_allowed`.
  - `packages/contracts/src/tasks.ts`: `materializeResponseSchema` ganha `failed` e `deferred`, com padrão 0 só para ler uma função antiga.
  - `packages/config/src/notifications.ts`: `notificationRules` (espelho previsto em `app_settings.notification_rules`) e `notificationDefaults`.
  - `packages/config/src/tasks.ts`: `taskRules.autoMissJob`, `taskDefaults.materializationPastDays` e `materializeMaxFollowUps`.
  - `packages/config/src/env.ts`: `EXPO_PUBLIC_VAPID_PUBLIC_KEY` opcional, vazio conta como ausente; as chaves obrigatórias continuam exigidas pelo tipo.
  - ADR-0005, seção 13, aponta para o ADR-0008; ADR-0006 registra `anchor` e `BackHeader`; `docs/arquitetura.md` ganha a seção Notificações.
  - Cinco handoffs `20261102-1220-arquiteto-para-*`.
- **Arquivos/módulos principais:** `docs/adr/0008-*`, `packages/contracts/src/notifications.ts`, `packages/config/src/notifications.ts`
- **Migrations:** nenhuma. Especificadas para `banco-de-dados`.
- **Decisões/ADRs:** ADR-0008. O sino é a linha de `notifications`, sem título, lido pela RLS; canais externos por outbox única por notificação e canal. Lembretes por varredura SQL a cada minuto, não gravados com antecedência. Silêncio no despacho, no fuso do perfil, com exceção para lembrete de tarefa marcada dentro da janela. Endpoint de push só em hosts da lista. 403 do push não apaga a inscrição. Vermelho automático em SQL, por `auto_miss_at`, com carência de 60 minutos depois de mudar o status; F4-6 passa a `banco-de-dados`. `failed` e `deferred` com status 200. Manifest e `index.html` próprios em `apps/app/public`, `theme-color` por `media`, título por `Screen.title` e `role="main"`.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passou. Testes de `packages/contracts` (44, 17 novos) e `packages/config` (7, 4 novos).
- **Não verificado:** nada rodou na pilha. Que o Expo 58 use `apps/app/public/index.html` como modelo em `output: 'single'` foi lido no código do CLI, sem build. Que o Chrome não exija `fetch` no service worker para instalar não foi conferido. Hosts de push da lista vêm de conhecimento, não de teste com cada navegador. `pnpm db:check-permissions` vai acusar `task_rules` até a migration de F4-1.
- **Pendências / próximos passos:** `banco-de-dados` (F4-1 e F4-6) primeiro; `backend-funcoes` F4-8 já, F4-2 depois de F4-1; `notificacoes-whatsapp` core, i18n e F4-9 já, o resto depois de F4-1; `tarefas-calendario` e `design-system` nos encaixes. Orquestrador: F4-6 muda de dono no QUADRO; pedir a `auth-grupos` o `PushSetupCard` no onboarding. Humano: os sete padrões da seção 16 do ADR-0008.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:28 (BRT)

- **Branch:** fix/proof-task-rules-final, a partir do WIP `18ca79f` de fix/proof-task-rules, sobre feat/phase-3-proof (2935b7a)
- **Agente(s):** tarefas-calendario
- **Resumo:** Trava das regras de foto, rastro, `proof_visibility_locked`, detalhe defasado (B4), link de revisão na Equipe (B2), aviso da limitação da web (B9) e link da foto depois de reabrir (B5, item 3 do QA). Começou às 00:43 como WIP, interrompido pelo reinício, e foi fechado aqui com as duas falhas da E2E diagnosticadas.
- **Alterações:**
  - `packages/contracts/src/tasks.ts`: `proofFlagsLocked` sem `default(false)` e em `OccurrenceListItem.task`.
  - `packages/core/src/tasks/actors.ts`: `ActorSubject.proofFlagsLocked`, `deleter` e `proofFlagsLocked(...)` conforme o handoff, com testes.
  - `packages/data/src/tasks/index.ts`: coluna nas duas leituras e `listRuleChanges`.
  - `TaskFormScreen`: interruptor de privada travado com a tarefa travada, textos de trava e aviso `form.proofLimit`.
  - `TaskDetailScreen`: bloco "Mudanças nas regras".
  - `hooks.ts`: `useStatusChange` cancela antes de invalidar, e agora também `proof-current`, a chave de `ProofLink`, sem importar o módulo de prova. `useRefreshTasks` invalida `rule-changes`.
  - `TeamScreen` aceita `children`, e `team/[groupId].tsx` compõe `ProofQueueLink`.
  - `tasks.json`: `errors.proof_flags_locked` reescrito, `errors.proof_visibility_locked`, `form.proofLimit` e bloco `rules`.
  - E2E: teste novo da trava, com "Cancelar esta tarefa" além de "Excluir", e recusa nova em `tasks-proof.spec.ts`. `test.fail()` removido de `tasks-ui-fixes.spec.ts` (B4) e de `proof-paths.spec.ts` (B5).
- **Arquivos/módulos principais:** `packages/core/src/tasks/actors.ts`, `packages/features/tasks/src`, `packages/data/src/tasks/index.ts`, `packages/i18n/src/pt-BR/tasks.json`, `e2e/`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova. O texto de `form.proofLocked` também mudou, porque "quem criou" deixava de ser verdade. "B9" vem da lista do relatório de QA ao orquestrador, em que B5 a B9 são os itens 3 a 7 do handoff `20261101-2240-qa-testes-para-prova-foto-achados-do-qa.md`: B9 é o item 7, o aviso da limitação da web, e B5 é o item 3.
- **Causa das duas falhas da E2E do WIP, ambas do teste:**
  - `tasks-proof.spec.ts:159`: o formulário aberto pelo endereço não tem para onde voltar e vai para Hoje (`goBack` em `TaskFormScreen`), como no resto do app. O trace mostrou `edit_task` com 200 e a tela Hoje. O teste agora espera Hoje.
  - `tasks-ui-fixes.spec.ts:90`: a asserção final passou em 270 ms. O que falhou foi o callback da rota segurada, ainda em `waitForTimeout(300)` quando o teste acabou. Com `times: 1` a rota sai da lista, então `unrouteAll({ behavior: 'wait' })` não a espera: o teste guarda a promessa do callback, espera por ela e confere de novo que a leitura velha não volta a tela.
- **Como testar:** `pnpm check`; `pnpm db:start` e `pnpm exec playwright test e2e/tasks-proof.spec.ts e2e/tasks-ui-fixes.spec.ts e2e/proof-paths.spec.ts`.
- **Verificado:** `pnpm check` passou, com 505 testes em core. `pnpm db:test` 1004 de 1004. `pnpm functions:test` 85 de 85, sem `functions serve`. `pnpm e2e` 56 de 56, sem `test.fail` nem `retries`. Mutações, todas pegas e revertidas: em core, `proofFlagsLocked` ignorando a trava, `deleter` ignorando a trava, revisor sem `proof.review` e revisor igual ao autor; na E2E da trava, interruptor da foto destravado, de privada destravado e `deleter` ignorando a trava; tirar o `cancelQueries` (B4) e tirar `proof-current` (B5) fizeram os testes deles falharem.
- **Não verificado:** nada rodou no projeto hospedado nem no CI. A barreira do servidor (`edit_task`, `can_delete_task`) não foi mutada aqui: é do `banco-de-dados` e coberta por `db:test`. A segunda asserção do teste de B4 roda logo depois de a resposta velha chegar, e pode passar antes de um render atrasado.
- **Pendências / próximos passos:** B2 é só o link, sem contagem de provas aguardando. `prova-foto` segue com B6 a B8 e o aviso `consentVersion` 2.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:34 (BRT)

- **Branch:** feat/ui-page-landmarks, criada a partir de feat/phase-4-notifications (336f35d)
- **Agente(s):** design-system
- **Resumo:** marcos de página e título por tela do lado de `packages/ui` (ADR-0008, seção 13): `Screen` é o `main` e aceita `title`, `TabBar` nova com `navigation` e rótulos inteiros a 320 px, e `IconButton` com selo de contagem para o sino.
- **Alterações:**
  - `Screen`: `role="main"` no `ScrollView`; `title?: string` aceito e ainda ignorado, com a chamada de `useDocumentTitle` marcada como pendente de F4-9.
  - `TabBar` nova: `navigation` com nome, `tablist` e `tab`; cada aba com a largura do rótulo, mínimo de 44 px, rótulo em até duas linhas.
  - `IconButton`: `badge?: number`, `aria-hidden`, "99+" acima de 99; `danger` no claro e `danger-light` com texto `text` no escuro.
  - Token `sizes.lateBadge` vira `sizes.cornerBadge`, usado por `TaskCheck` e pelo selo.
  - `/design-system`: título na `Screen`, seção "Barra de abas" de largura inteira e sino com selo em "Botões de ícone". Chaves novas em `ui.json`.
  - Cinco handoffs `20261102-1233-design-system-para-*`.
- **Arquivos/módulos principais:** `packages/ui/src/Layout.tsx`, `packages/ui/src/TabBar.tsx`, `packages/ui/src/IconButton.tsx`, `packages/ui/src/DesignSystemScreen.tsx`, `packages/i18n/src/pt-BR/ui.json`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** largura pelo conteúdo em vez de quintos iguais: a 320 px, quintos dão 64 px, e "Calendário" mede 72 px em Nunito 800 de 14 px; pelo conteúdo, as cinco abas somam 319 px. O nome da navegação mora em `ui.json`, dentro de `TabBar`, para a casca não precisar de chave nova. Não criei `useDocumentTitle`: é de `notificacoes-whatsapp` em F4-9.
- **Como testar:** `pnpm check`; `pnpm dev` e `/design-system` a 320, 375 e 1280 px.
- **Verificado:** `pnpm check` passou (ui 11 testes, 4 novos de contraste do selo; contracts 44, platform 38, core 500, config 7, data 7, proof 6). `pnpm build:web` exportou. Com Playwright em `/design-system`, claro e escuro, a 320, 375 e 1280 px: um só `main`, um `navigation` chamado "Navegação principal", nenhum rótulo cortado e uma linha por rótulo; a 320 px as abas medem 44, 68, 80, 81 e 46 px, sem rolagem horizontal. Selo visto nos dois temas.
- **Não verificado:** `document.title` não muda, porque o adapter não existe. A barra real do app não usa `TabBar` até a casca trocar, e as telas logadas não foram abertas. O selo com "99+" e o comportamento no nativo não foram vistos. Que o stack esconde as telas de baixo com `display: none` foi lido no código do `expo-router`, não conferido no leitor de tela.
- **Pendências / próximos passos:** orquestrador: `AppTabBar` usar `TabBar`. `notificacoes-whatsapp`: `useDocumentTitle` e a linha em `Screen`. `auth-grupos`, `tarefas-calendario` e `prova-foto`: `title` nas próprias telas.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:35 (BRT)

- **Branch:** feat/notifications-shell, criada a partir de feat/phase-4-notifications (336f35d)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** parte da Fase 4 que não depende do banco: `buildPushPayload` em `packages/core`, os textos de notificações, a casca PWA da web (F4-9) e o adapter `useDocumentTitle`. Sino, inscrição de push, preferências e avisos ao admin (F4-3, F4-4, F4-5, F4-7) esperam F4-1.
- **Alterações:**
  - `packages/core/src/notifications/pushPayload.ts`: `buildPushPayload(source, requiresPhoto, t)` devolve `PushPayload` validado pelo contrato. Título da tarefa nulo ou em branco vira a linha genérica; título cortado em 80 unidades por ponto de código, sem partir emoji; título e corpo cortados em 120 e 300. Endereço do toque da seção 8 do ADR-0008, e `/notifications` quando a ocorrência sumiu. `tag` é o id da notificação. Antecedência dita na maior unidade inteira.
  - `packages/i18n/src/pt-BR/notifications.json`: push por tipo, sino, tipos, canais, preferências com silêncio e aparelhos, e `PushSetupCard` com o caso do iPhone. `common.json` ganha `documentTitle` (`{{screen}} · {{app}}`).
  - `packages/platform`: `useDocumentTitle(title?)`; na web escreve `document.title` só enquanto a tela está em foco (`useIsFocused` do expo-router), porque abas e telas sob uma pilha continuam montadas. Nativo sem efeito. `platform` passa a depender de `@azkaban/i18n` e `expo-router`.
  - `apps/app/public/`: `index.html` próprio (modelo do Expo em `output: 'single'`) com `theme-color` claro e escuro por `media`, `color-scheme`, fundo do `html` e do `body` nas duas cores, manifest e `apple-touch-icon`; `manifest.webmanifest`; ícones 192, 512 e 180 gerados de `assets/icon.png` (o 512 também é a entrada `maskable`, porque a marca já está na zona segura); `_headers` com `no-cache` para `sw.js` e manifest; `_redirects` com `/* /index.html 200`; `sw.js` com `push` (sempre mostra, com título de reserva se o payload não for lido), `notificationclick` (só caminho interno; foca e navega, ou abre janela) e sem `fetch`. Além do ADR, `install` com `skipWaiting` e `activate` com `clients.claim`, para uma correção do service worker valer sem fechar todas as abas e para `navigate` funcionar.
  - `apps/app/public.test.ts` e script `test` no app, com `vitest` em devDependencies: cores do `index.html` e do manifest contra os tokens (lidos pelo `tailwind.config.ts`, único caminho do app até `packages/ui/src/tokens.ts` que a fronteira aceita) e o `sw.js` rodado num `vm` com globais falsos.
  - `apps/app/src/env.ts` e `.env.example`: `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, sem valor.
- **Arquivos/módulos principais:** `packages/core/src/notifications`, `packages/i18n/src/pt-BR/notifications.json`, `packages/platform/src/documentTitle*.ts`, `apps/app/public`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova. `useDocumentTitle` usa o foco do expo-router; sem isso a última aba montada ficaria com o título. O teste lê os tokens pela configuração do Tailwind para não mexer em `.dependency-cruiser.cjs`.
- **Como testar:** `pnpm check`; `pnpm build:web` e conferir em `apps/app/dist` o `index.html`, o manifest, o `sw.js`, `_headers` e `_redirects`.
- **Verificado:** `pnpm check` passou: core 511 (11 novos de `buildPushPayload`), app 6 (novos), contracts 44, platform 38, config 7, ui 7, data 7, proof 6. `pnpm build:web`: `dist/index.html` saiu do modelo próprio, com `lang="pt-BR"`, título `Azkaban`, as duas `theme-color`, manifest e `apple-touch-icon`, e o Expo acrescentou favicon, CSS e scripts; `sw.js`, manifest, ícones, `_headers` e `_redirects` saíram iguais na raiz de `dist`. Uma mutação (não mostrar nada sem payload legível) foi pega pelo teste do `sw.js`.
- **Não verificado:** nada no navegador: manifest sem erro e instalável no DevTools, `theme-color` na barra, `sw.js` registrado (o registro é de F4-4), `document.title` mudando por tela (nenhuma tela passa `title` ainda; depende de `Screen.title` de `design-system`), e se o Chrome aceita instalar sem `fetch`. Netlify não foi exercitado. A pilha Supabase e a E2E não rodaram, por ordem do orquestrador.
- **Pendências / próximos passos:** F4-3, F4-4, F4-5 e F4-7 depois de F4-1. `design-system`: `Screen` chama `useDocumentTitle(title)` de `@azkaban/platform`, que exige estar dentro de um navegador do expo-router. `backend-funcoes`: o `t` passado a `buildPushPayload` precisa seguir o plural do i18next (`count` com `_one`/`_other`) no namespace `notifications`. O nome do app se repete no manifest e no `sw.js`, além do `app.config.ts`.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:41 (BRT)

- **Branch:** fix/proof-consent-v2-check, criada a partir de feat/phase-3-proof (1e9add4)
- **Agente(s):** prova-foto
- **Resumo:** segunda etapa da entrada de 12:16: E2E e telas conferidas no estado integrado, e `ProofQueueBar` removido.
- **Alterações:**
  - `ProofQueueBar` saiu de `ProofEntry.tsx` e do index. Na integração, a Equipe ficou com `ProofQueueLink` dentro de `TeamScreen` (ADR-0006), e o link fica bem alinhado à coluna sem moldura extra.
- **Arquivos/módulos principais:** `packages/features/proof/src/ProofEntry.tsx`, `packages/features/proof/src/index.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm e2e`, `pnpm db:test`.
- **Verificado:** `pnpm check` passou. `pnpm e2e` 58 de 58 numa só execução, já sem nenhum `test.fail()`, incluindo os testes novos do aviso, da dobra e da prova de tarefa excluída aprovada pela Equipe. `pnpm db:test` 1004 de 1004. Telas por capturas do Chrome com câmera falsa, em 375x812 e 1280x800, claro e escuro: aviso com as sete frases e 90 e 365 dias; quadrado da câmera e "Tirar foto" inteiros na janela nas duas larguras (400 px de quadrado em 1280x800); "Confira a foto" e revisão com o carimbo inteiro, "Duda" sem corte; revisão com o aviso da web; Equipe com "Revisar fotos" para o dono.
- **Não verificado:** a linha "Enviada pelo navegador" foi conferida pela E2E, não por captura, porque fica abaixo da dobra. Nada em iOS ou Android. Nada no projeto hospedado nem no CI. `pnpm functions:test` não rodou.
- **Pendências / próximos passos:** nenhuma minha na prova. Base legal e contato de privacidade seguem com o humano.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:43 (BRT)

- **Branch:** feat/ui-shell-wiring (a partir de `feat/phase-4-notifications`, `cfd192c`)
- **Agente(s):** design-system, também como delegado do orquestrador para a casca (`apps/app/src`)
- **Resumo:** `Screen` passa a chamar `useDocumentTitle(title)` (F4-9); a barra de abas da casca usa o `TabBar` de `@azkaban/ui`, com o marco `navigation`; a tela de página não encontrada ganha título.
- **Alterações:**
  - `packages/ui/src/Layout.tsx`: o comentário `pending F4-9` virou `useDocumentTitle(title)`.
  - `apps/app/src/AppTabBar.tsx`: o `View role="tablist"` e o `map` deram lugar a `<TabBar items={...} />`; `useSafeAreaInsets` e `tokens` saíram dali. `MaterializeStatus` continua acima, fora da navegação.
  - `apps/app/app/+not-found.tsx`: `Screen` com `title={t('notFound.title')}`.
- **Arquivos/módulos principais:** `packages/ui/src/Layout.tsx`, `apps/app/src/AppTabBar.tsx`, `apps/app/app/+not-found.tsx`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seção 13. `packages/platform/src/documentTitle.web.ts` não foi alterado: todo `Screen` do app é uma rota dentro de um `Stack` do expo-router, nenhum teste renderiza `Screen` e os testes de `packages/ui` resolvem a versão sem `.web`. O nome do app vem de `app.config.ts`, então o `document.title` do módulo nunca é lido.
- **Como testar:** `pnpm check`; `pnpm build:web`; `pnpm dev` e abrir `/design-system`, um endereço inexistente e `/welcome`.
- **Verificado:** `pnpm check` passou: core 511, contracts 44, platform 38, ui 11, config 7, data 7, app 6, proof 6. `pnpm build:web` exportou `dist`. Com Playwright contra `pnpm dev`: `/design-system` dá "Design system · Azkaban"; `/nao-existe`, "Página não encontrada · Azkaban"; "Ir para Hoje" leva a `/welcome` e o título volta a "Azkaban"; `/welcome` -> `/design-system` -> voltar -> avançar alterna os dois títulos. Um `main` visível em todas; ao empilhar `/sign-up` sobre `/welcome` há dois `main` no DOM, o de baixo com `display: none`, fora da árvore de acessibilidade. Sem erros de página.
- **Não verificado:** as telas autenticadas: troca de título entre abas, a `TabBar` real com o marco `navigation` a 320 px e telas empilhadas sobre as abas. A pilha Supabase não foi usada, por ordem do orquestrador; a E2E da fase cobre. Hora derivada de UTC menos 3 (PowerShell bloqueado), igual ao relógio local do vitest.
- **Pendências / próximos passos:** o título de cada tela de feature fica com os donos (handoffs já abertos); hoje `welcome`, `sign-in`, `sign-up` e as abas mostram só "Azkaban".

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 12:54 (BRT)

- **Branch:** feat/phase-3-proof
- **Agente(s):** orquestrador
- **Resumo:** fechamento da Fase 3. Integradas `fix/proof-task-rules-final` (tarefas-calendario), `fix/proof-consent-v2` e `fix/proof-consent-v2-check` (prova-foto), com a verificação final em banco limpo toda verde.
- **Alterações:**
  - Integrações `52ae23d`, `1e9add4` e `b6587cc`. Na rota da Equipe, os dois agentes tinham feito o mesmo link de revisão (B2): ficou o de `TeamScreen` com `children` (ADR-0006), e o `ProofQueueBar` sem uso foi apagado pelo próprio prova-foto.
  - `CLAUDE.md`: `pnpm functions:test` exige `pnpm db:start`, não `supabase functions serve` (autorizado pelo humano, `b88ab87`).
  - `docs/agentes/QUADRO.md`: Fase 3 feita.
- **Migrations:** nenhuma nesta entrada.
- **Decisões/ADRs:** nenhuma nova. Pendências humanas do ADR-0007, seção 20, seguem abertas (base legal, 365 dias, contato de privacidade, riscos aceitos).
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`; `pnpm install`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`, `pnpm exec turbo run typecheck test --force`, `pnpm lint`, `pnpm boundaries`, `pnpm build:web`, `pnpm functions:test`, `pnpm e2e`.
- **Verificado:** no checkout principal, em `b6587cc`, depois de `db reset`: `db:test` 1004 de 1004; `db:check-permissions` em dia; `turbo run typecheck test --force` 24 de 24 tarefas (core 505, platform 38, contracts 27, ui 7, data 7, feature-proof 6, config 3); `lint` e `boundaries` limpos; `build:web` ok; `functions:test` 85 de 85, sem `functions serve`; `pnpm e2e` 58 de 58 duas vezes seguidas (2,6 e 2,5 min), sem `test.fail()` nem `retries`; `db:test` 1004 de 1004 de novo depois da E2E, sem reset. Varredura de segredos no diff `feat/phase-2-tasks..b6587cc` (229 arquivos): só as chaves públicas de demonstração da pilha local (`iss: supabase-demo`) e o `CRON_SECRET` de demonstração do `.env.example`.
- **Não verificado:** CI (a E2E com Chrome e câmera falsa nunca rodou no `ubuntu-latest`), projeto hospedado, iOS e Android. Tamanho de foto real.
- **Pendências / próximos passos:** push de `feat/phase-3-proof` e PR para `feat/phase-2-tasks`. Humano: base legal para funcionários (bloqueia uso real), 365 dias do registro, contato de privacidade, custo de storage, rotação da senha do banco hospedado, riscos aceitos da seção 20. Os worktrees integrados seguem no disco: a remoção foi negada pelas permissões desta sessão.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 13:28 (BRT)

- **Branch:** feat/notifications-db, criada a partir de feat/phase-4-notifications (7737487)
- **Agente(s):** banco-de-dados
- **Resumo:** F4-1 e F4-6 no banco (ADR-0008): espelhos, enums, silêncio no perfil, sino, preferências, inscrições de push com a lista de hosts, outbox idempotente, avisos por trigger em qualquer caminho, varredura de lembretes, claim e report do despacho, limpeza de 30 dias, cron do despacho e o vermelho automático.
- **Alterações:**
  - 14 migrations `20261102130000` a `20261102131300`, uma por item do handoff `20261102-1220-arquiteto-para-banco-de-dados-notificacoes`.
  - `supabase/tests/rls_notifications.test.sql`: 199 asserções novas. `rls_proof.test.sql`: `register_push_subscription` na lista de funções abertas a `authenticated`.
  - `scripts/check-permission-mirror.mjs`: seção `notification_rules`, pedida no mesmo handoff.
  - `packages/data/src/database.types.ts`: gerado.
  - Handoffs `20261102-1325-banco-de-dados-para-{backend-funcoes-despacho,notificacoes-whatsapp-sino-e-push}`.
- **Arquivos/módulos principais:** `supabase/migrations/2026110213*`, `supabase/tests/rls_notifications.test.sql`
- **Migrations:** `notification_rules`, `notification_enums`, `profile_quiet_hours`, `notifications`, `notification_preferences`, `push_subscriptions`, `notification_outbox`, `enqueue_notification`, `status_notifications`, `due_reminders`, `notification_dispatch`, `notification_retention`, `dispatch_notifications_cron`, `auto_miss_occurrences`.
- **Decisões/ADRs:** padrões reversíveis onde o ADR não decide:
  - o trigger dos avisos fica em `task_status_history` (after insert), não em `task_occurrences`: toda mudança de status grava uma linha ali, e o id dela é a chave; de `task_occurrences` não se distingue `done → pending → done` na mesma transação;
  - contestação para `missed` avisa só `proof_disputed`, sem `occurrence_missed`; desfazer a contestação é aprovação e não avisa ninguém;
  - `occurrence_resolved` para `missed` não sai quando o criador é o responsável, que já recebeu o vermelho;
  - o acesso por usuário (`can_view_task_for`) espelha `can_view_task`, então o criador membro atual recebe mesmo sem `task.view_group`;
  - a exceção do silêncio vale quando a âncora do lembrete cai antes do fim da janela atual (dentro dela ou já passada);
  - o claim também cancela um `proof_in_review` cuja foto já não espera revisão (`resolved`), e usa o fuso padrão quando o do perfil é inválido, para uma linha não travar a fila;
  - uma linha em `sending` guarda o fim da concessão também em `next_attempt_at`, e um índice serve fila e concessões vencidas;
  - a varredura de lembretes lê o índice de pendentes por `auto_miss_at` (a âncora nunca passa dele) e limita o início a 30 dias à frente; o teto e a saída estão no comentário da migration. Não medi com volume.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`.
- **Verificado:** `pnpm check` passou (core 516, contracts 44, platform 38, ui 11, config 7, data 7, app 6, proof 6). `pnpm db:test` 1203 de 1203. `pnpm db:check-permissions` com `Notification rules in sync` e `Task rules in sync`. `pnpm e2e` 58 de 58. `pnpm functions:test` 74 de 85: as 11 falhas são de `materialize-occurrences`, que agora responde `failed: 0, deferred: 0` pelo padrão do contrato de F4-8, e os testes esperam só `inserted`; nada do banco. Mutações pegas: host como sufixo sem ponto, sem checagem de host, parser de host frouxo, sem exceção de silêncio, sem carência, sem filtro de arquivada, sem filtro de ex-membro, `overdue_at` no lugar de `auto_miss_at`, sem exclusão do ator no vermelho e na resolução, sem exclusão de autor e ator no "em análise", sem checagem de membro por usuário, preferência ignorada, replay que reaproveita a linha do sino, sem `unique` da outbox, sem acesso no claim, sem janela da varredura, e as políticas de `select` do sino e das inscrições e de `update` do sino e das preferências trocadas por `true`. Sobreviventes, equivalentes na matriz atual: só a exclusão do autor (o ator do commit é sempre o autor) e `proof.review` trocado por outra chave que só owner e admin têm.
- **Não verificado:** nada no projeto hospedado. O Realtime entregando a linha a um cliente não foi exercitado, só a publicação. A varredura de lembretes e o vermelho automático rodaram por chamada direta, não pelo pg_cron; localmente, o cron `dispatch-notifications` falha a cada minuto sem Vault, de propósito. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** `backend-funcoes`: `dispatch-notifications` e os testes de F4-8. `notificacoes-whatsapp`: sino, preferências, silêncio e push no cliente. Orquestrador: F4-6 muda de dono no QUADRO. Humano: os padrões acima e os da seção 16 do ADR-0008.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 13:39 (BRT)

- **Branch:** feat/tasks-phase-4, criada a partir de feat/phase-4-notifications (f767a20)
- **Agente(s):** tarefas-calendario
- **Resumo:** F4-8 no cliente (resposta `{ inserted, failed, deferred }`, novas chamadas enquanto há `deferred`, aviso com "tentar de novo" quando há `failed`), encaixe do sino em Hoje e título de todas as telas de tarefas, calendário e contextos.
- **Alterações:**
  - `packages/core`: `materializeWithFollowUps(call, maxFollowUps)`, o laço puro: chama de novo enquanto `deferred > 0`, até o limite; soma `inserted`, guarda o maior `failed` e o último `deferred`. 4 testes.
  - `packages/data`: `materializeUntil` e `materializeTasks` devolvem a resposta inteira, validada por `materializeResponseSchema`.
  - `useMaterializeTasks` (criar e editar) e `useMaterializeAhead` (calendário além da janela) usam o laço com `taskDefaults.materializeMaxFollowUps`. Com `failed > 0`, os ids ficam pendentes e `MaterializeStatus` mostra o alerta com "tentar de novo", sem a nova tentativa automática da falha de rede. No calendário, um alerta com "tentar de novo" (`calendar.errors.materialize`).
  - `TodayScreen` ganha `headerRight?: ReactNode`, ao lado do título, para a rota passar o `NotificationBell`. Nada de `feature-notifications` foi importado.
  - `title` em todo `Screen` de Today, Area (o nome da área, inclusive enquanto carrega), TaskDetail ("Tarefa", nunca o título da tarefa, que apareceria na aba e no histórico), TaskForm, Team, Calendar, Areas ("Contextos") e ContextForm, inclusive nos retornos de carregando e de erro.
  - E2E `tasks-materialize.spec.ts`: dois testes novos, com respostas falsas da função (e CORS): `deferred` chama exatamente 3 vezes sem aviso; `failed` mostra o alerta e "tentar de novo" cria os dias.
- **Arquivos/módulos principais:** `packages/core/src/tasks/calendarMaterialize.ts`, `packages/data/src/tasks/index.ts`, `packages/features/tasks/src/{hooks,MaterializeStatus,TodayScreen}.tsx?`, `packages/features/calendar/src/{hooks.ts,CalendarScreen.tsx}`, `packages/features/contexts/src/*Screen.tsx`, `packages/i18n/src/pt-BR/{tasks,calendar,contexts}.json`, `e2e/tasks-materialize.spec.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seções 7, 12 e 13. Padrão reversível: `failed` é o maior visto, não a soma, porque uma nova chamada repete as tarefas que falharam. `taskDefaults.materializationPastDays` não tem uso no cliente: substitui o `PAST_DAYS` da Edge Function, que é do `backend-funcoes`.
- **Como testar:** `pnpm check`, `pnpm build:web`; com a pilha, `pnpm e2e e2e/tasks-materialize.spec.ts e2e/calendar.spec.ts`.
- **Verificado:** `pnpm check` passou (core 520, contracts 44, platform 38, ui 11, config 7, data 7, app 6, proof 6). `pnpm build:web` passou. A E2E editada passou no `tsc --strict`.
- **Não verificado:** a E2E não rodou (pilha local em uso por outro agente), nem a tela no navegador: o cabeçalho de Hoje com o encaixe e o alerta do calendário não foram vistos. A função de F4-8 não estava no ar. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** rota de Hoje (`apps/app/app/(app)/(tabs)/index.tsx`) passar `headerRight={<NotificationBell />}`, com `notificacoes-whatsapp` ou o orquestrador. E2E desta entrega na verificação da fase.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 13:43 (BRT)

- **Branch:** feat/proof-screen-titles, criada a partir de feat/phase-4-notifications (59405cc)
- **Agente(s):** prova-foto
- **Resumo:** `title` em todo `Screen` de `packages/features/proof`, pelo handoff `20261102-1233-design-system-para-prova-foto-titulo-das-telas`.
- **Alterações:**
  - Captura: "Prova por foto" (`proof.screenTitle`, chave nova) nas etapas antes da foto, em expirado e em erro; "Confira a foto" (`confirm.title`) na conferência e no envio; "Foto enviada" (`done.title`) no resultado. Nunca o título da tarefa, que segue só no `Title` da tela.
  - Fila de revisão: "Fotos para revisar" (`queue.title`).
  - Revisão de uma prova: "Foto da prova" (`review.title`, que existia sem uso), inclusive nos retornos de carregando e de não encontrada. Nem o título da tarefa nem o nome do autor.
- **Arquivos/módulos principais:** `packages/features/proof/src/{ProofCaptureScreen,ProofQueueScreen,ProofReviewScreen}.tsx`, `packages/i18n/src/pt-BR/proof.json`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seção 13.
- **Como testar:** `pnpm check`, `pnpm build:web`; depois de F4-9, no `pnpm dev` web, `document.title` muda ao abrir cada tela e ao passar da câmera à conferência.
- **Verificado:** `pnpm check` passou (core 520, contracts 44, platform 38, ui 11, config 7, data 7, app 6, proof 6). `pnpm build:web` passou.
- **Não verificado:** nada no navegador: sem o adapter de F4-9 o `title` é ignorado, e a pilha local estava em uso por outro agente. E2E fica para a verificação da fase. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** nenhuma deste agente.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 13:45 (BRT)

- **Branch:** `feat/auth-screen-titles` (a partir de `feat/phase-4-notifications`)
- **Agente(s):** auth-grupos
- **Resumo:** Todas as telas de `feature-auth` e `feature-groups` passam `title` ao `Screen`, inclusive carregando e erro, atendendo ao handoff 20261102-1233 do design-system.
- **Alterações:**
  - Boas-vindas, Entrar, Criar conta, Seu perfil, Grupos, Novo grupo e Convite (os três retornos de `JoinGroupScreen`) reaproveitam a chave do título visível; Boas-vindas ganhou `welcome.screenTitle`, porque o título visível é um slogan.
  - Detalhe do grupo usa o nome do grupo; enquanto carrega, `detail.title` ("Grupo"). Nenhum e-mail ou nome de pessoa vai para o título.
  - O link mágico é um botão da tela Entrar, sem tela própria.
- **Arquivos/módulos principais:** `packages/features/auth/src/*Screen.tsx`, `packages/features/groups/src/*Screen.tsx`, `packages/i18n/src/pt-BR/{auth,groups}.json`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seção 13
- **Como testar:** `pnpm check`; no `pnpm dev` web, `/welcome`, `/sign-in`, `/sign-up` e `/join/<código>` sem login mostram "<tela> · Azkaban" (conferido com Playwright headless). Hora do título em UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** telas com login (perfil, grupos, detalhe) só conferidas por typecheck; E2E na verificação da fase. `PushSetupCard` no onboarding fica para depois.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 13:46 (BRT)

- **Branch:** feat/notifications-ui, criada a partir de feat/phase-4-notifications (f767a20)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** cliente de F4-3, F4-4, F4-5 e F4-7 (ADR-0008): repositório do sino, preferências, silêncio e aparelhos; sino com Realtime e contador; lista de avisos; aviso curto com o app aberto; adapter de push com o registro do `sw.js`; `PushSetupCard` com o caso do iPhone; tela de preferências. E2E escrita, não executada.
- **Alterações:**
  - `packages/data/src/notifications`: `notificationsRepository` com lista e item (título e `requires_photo_proof` por embed que segue a RLS; linha fora do contrato fica de fora em vez de quebrar a lista), contador por `read_at is null`, marcar uma e todas, assinatura `postgres_changes` filtrada por `user_id`, preferências por upsert, silêncio em `profiles` (corta `22:00:00`), aparelhos com colunas explícitas, `register_push_subscription` e remoção. `notificationErrorCode` reconhece `push_endpoint_not_allowed`; `invalid_push_subscription` cai no genérico.
  - `packages/core/src/notifications`: `notificationUrl` exportada (o sino abre o mesmo endereço do push) e `deviceLabel` (navegador e sistema do user agent, para a lista de aparelhos), com testes.
  - `packages/platform/src/push.ts` (nativo sem efeito até F8) e `push.web.ts`: `pushSupport` (`supported`, `needs_install` no Safari do iPhone e do iPad, `ios_too_old` antes do 16.4, `unsupported`), `pushPermission`, `subscribePush` (pede a permissão; só por toque), `currentPushSubscription` (nunca pede; reinscreve se a chave mudou) e `unsubscribePush`. Registra `/sw.js` com escopo `/` e espera `serviceWorker.ready`.
  - `packages/features/notifications`: `NotificationBell` (`IconButton icon="🔔"` com `badge` e contagem no `label`), `NotificationsScreen` (`/notifications`, título "Avisos", toque marca lida e abre o destino, "Marcar todos como lidos", texto igual ao do push por `buildPushPayload`, com a linha genérica quando a RLS esconde a tarefa), `NotificationToaster` (uma vez na casca autenticada: Realtime, aviso de 6 s em `role="status"` e reinscrição a cada abertura), `PushSetupCard`, `NotificationPreferencesScreen` (`/settings/notifications`, título "Notificações": interruptores por tipo em cada canal de `activeChannels`, com os padrões de `defaultChannels`; silêncio com "Sem horário de silêncio" e o fuso do perfil; aparelhos com "Este aparelho" e remover) e `forgetThisDevice`.
  - Marca local `notifications.thisDevice` com conta e id da linha: ao abrir com outra conta, a inscrição do navegador é cancelada em vez de adotada, para o push não passar de uma conta a outra sem opt-in. Remover "este aparelho" também cancela no navegador.
  - Rotas: `(app)/_layout.tsx` monta o toaster; `(app)/notifications.tsx`; `(app)/settings/notifications.tsx`; Perfil ganha o botão "Notificações"; Hoje recebe o sino por sobreposição no canto do título, provisória até `TodayScreen` ter o encaixe de `tarefas-calendario`.
  - `notifications.json`: textos de carga, erro, aviso, fuso, validação do silêncio, nome e data do aparelho.
  - `e2e/notifications-bell.spec.ts` e `e2e/notifications-preferences.spec.ts`.
  - Handoff `20261102-1344-notificacoes-whatsapp-para-auth-grupos-esquecer-aparelho-ao-sair`.
- **Arquivos/módulos principais:** `packages/data/src/notifications`, `packages/features/notifications/src`, `packages/platform/src/push*.ts`, `packages/core/src/notifications`, `apps/app/app/(app)`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova. Sem a chave pública, a tela de preferências esconde o cartão, os interruptores de push e os aparelhos, e mantém o silêncio. F4-7 no cliente é o texto e o destino de `occurrence_resolved` e `proof_in_review` no sino e no aviso, que já vêm de `buildPushPayload`; não há lógica de destinatário no cliente. `invalid_push_subscription` não pediu mensagem própria, então não houve handoff ao `arquiteto`.
- **Como testar:** `pnpm check`; `pnpm build:web`; com a pilha, `pnpm e2e e2e/notifications-*.spec.ts`. As duas specs de push e aparelhos só rodam com `EXPO_PUBLIC_VAPID_PUBLIC_KEY` no ambiente do `pnpm e2e`; sem ela, roda a que confere o push escondido.
- **Verificado:** `pnpm check` passou: core 522 (6 novos de `deviceLabel`), platform 46 (8 novos de `push.web`), contracts 44, ui 11, config 7, data 7, app 6, proof 6. `pnpm build:web` exportou `dist`. As specs novas passam no `tsc` estrito isolado (os únicos erros são de `proof-kit.ts`, que já existiam com essa configuração avulsa).
- **Não verificado:** a E2E não rodou, por ordem do orquestrador (pilha em uso). Nada no navegador: sino ao vivo, aviso, telas a 375 e 1280 px, claro e escuro, registro do `sw.js`, permissão e inscrição reais, push real, iPhone. O encaixe do sino em Hoje é provisório. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** rodar a E2E e conferir as telas quando a pilha estiver livre. `auth-grupos`: `forgetThisDevice` antes de sair (handoff). Integração: trocar a sobreposição de Hoje pelo encaixe de `TodayScreen`. Verificação manual do push no Android, desktop e iPhone pela Tela de Início.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 13:49 (BRT)

- **Branch:** `feat/auth-push-hooks` (a partir de `feat/phase-4-notifications`)
- **Agente(s):** auth-grupos
- **Resumo:** Ao sair da conta, o app esquece este aparelho para push antes do `signOut`, atendendo ao handoff 20261102-1344 do notificacoes-whatsapp.
- **Alterações:**
  - `ProfileScreen` aceita `onBeforeSignOut?: () => Promise<void>` e o espera dentro do `mutationFn`, antes de `authRepository.signOut`, com a sessão ainda viva (RLS). Falha é engolida e a espera tem teto de 5 s, então a saída nunca trava.
  - A rota `apps/app/app/(app)/(tabs)/profile.tsx` passa `forgetThisDevice` de `@azkaban/feature-notifications`.
  - Encaixe do `PushSetupCard` no onboarding: não feito. O onboarding de hoje só tem telas sem sessão (boas-vindas, entrar, criar conta), e o cartão precisa de usuário (`useCurrentUser` e RLS de `push_subscriptions`). Ele segue em Perfil > Notificações.
- **Arquivos/módulos principais:** `packages/features/auth/src/ProfileScreen.tsx`, `apps/app/app/(app)/(tabs)/profile.tsx`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seção 3
- **Como testar:** `pnpm check`; `e2e/accounts.spec.ts` ("sign up, sign out and sign back in") cobre a saída com o gancho sem push ativo. Com push real: ativar em Perfil > Notificações, sair e conferir que `push_subscriptions` não tem a linha. Hora do título em UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** sem E2E da linha apagada ao sair, porque o Playwright não obtém inscrição de push real. Um passo de onboarding com sessão (permitir notificações, instalar PWA) fica para quando for planejado.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:01 (BRT)

- **Branch:** feat/notifications-dispatch, criada a partir de feat/phase-4-notifications (f767a20)
- **Agente(s):** backend-funcoes
- **Resumo:** F4-2 e F4-8 (ADR-0008, seções 6, 8 e 12): Edge Function `dispatch-notifications` com Web Push próprio sobre WebCrypto, e `materialize-occurrences` com `{ inserted, failed, deferred }`, corpo limitado e cron que falha sem Vault.
- **Alterações:**
  - `supabase/functions/dispatch-notifications/`: `index.ts` (só `x-cron-secret`; sem os três segredos VAPID responde 500 `vapid_not_configured` antes de qualquer claim; valida o claim com zod e `notificationItemSchema`; payload por `buildPushPayload` com o idioma do perfil); `dispatch.ts` (`NotificationChannel`, `SendResult`, laço claim, envio, report até `dispatchBudgetMs`, backoff com `Retry-After` e teto, `failed` em `maxAttempts`); `web-push.ts` (`WebPushChannel`: aes128gcm da RFC 8291 e VAPID da RFC 8292 em WebCrypto, sem biblioteca; host conferido de novo antes do `POST`, com `https:`, porta padrão e sem credenciais; redirecionamento nunca seguido; `TTL` e `Urgency`; 404 e 410 apagam a inscrição, 403 não; corpo da resposta nunca lido); `translate.ts` (o `t` com a semântica do i18next que as chaves `push.*` usam); `test-kit.ts`, `push.test.ts` (18 testes, com o vetor do apêndice A da RFC 8291) e `dispatch.integration.test.ts` (8).
  - `readLimited` passou de `proof-validate/body.ts` para `_shared/body.ts`.
  - `materialize-occurrences`: resposta `{ inserted, failed, deferred }`, corpo por `readLimited` com teto de 8 KiB e `proofDefaults.uploadTimeoutSeconds`, `taskDefaults.materializationPastDays` no lugar de `PAST_DAYS`. Testes: os 11 que esperavam só `inserted`, `failed: 2` no caso da recusa, `deferred` no caso do orçamento, e três novos (8 KiB exatos e um byte a mais, 400 MiB, Vault vazio).
  - `config.toml`, `.env.example` (nomes `VAPID_*` sem valor), `wait-for-functions.mjs` e o script `functions:test` da raiz.
  - `docs/implantacao.md`: comando que gera o par VAPID num arquivo fora do repositório, `secrets set`, conferência de que `EXPO_PUBLIC_VAPID_PUBLIC_KEY` é a mesma do servidor (por resumo SHA-256), `dispatch_notifications_url` no Vault, deploy da função nova e os sinais `materialize_not_configured` e `dispatch_notifications_not_configured`.
  - Handoffs `20261102-1355-backend-funcoes-para-{arquiteto-despacho-entregue,banco-de-dados-teste-do-vault-da-materializacao,notificacoes-whatsapp-t-do-despacho}`.
- **Arquivos/módulos principais:** `supabase/functions/dispatch-notifications`, `supabase/functions/materialize-occurrences/index.ts`, `supabase/functions/_shared/body.ts`, `docs/implantacao.md`
- **Migrations:** `20261102133600_materialize_cron_signal` (`call_materialize_occurrences` levanta `materialize_not_configured` sem os segredos do Vault).
- **Decisões/ADRs:** nenhum ADR novo; o que difere do ADR-0008 foi para o `arquiteto` por handoff: `SendResult` com as listas de inscrições entregues e mortas; TTL do lembrete com teto `pushTtlSeconds`; 3xx é `push_redirect`; o `t` sem i18next (o handoff de `notificacoes-whatsapp` permite um equivalente). Nenhum host extra por variável de ambiente: os testes injetam um `fetch` falso.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm functions:test`.
- **Verificado:** `pnpm check` passou (core 516, contracts 44, platform 38, ui 11, config 7, data 7, app 6, proof 6). `pnpm functions:test` 114 de 114. `pnpm db:test` 1203 de 1203. `pnpm db:check-permissions` em sincronia. `pnpm e2e` 58 de 58. Uma vez, com um par VAPID gerado na hora só no `.env` local (ignorado) e apagado em seguida, a função publicada reivindicou, validou, montou o payload e barrou um host fora da lista com `push_endpoint_not_allowed`, sem requisição de saída; o log dela trouxe só contagens. Mutações, todas pegas e revertidas: checagem de host desligada, host como sufixo sem ponto, 403 apagando a inscrição, 500 apagando, `sent` virando `retry` (reenvio), `maxAttempts` ignorado, redirecionamento seguido, `Retry-After` ignorado, `x-cron-secret` desligado, claim antes da checagem do VAPID, teto do corpo em 64 KiB, `req.text()` de volta, e a migration voltando ao `return` silencioso.
- **Não verificado:** nenhum envio a um serviço de push real (FCM, Mozilla, Apple, WNS), de propósito; o vetor da RFC e a decifragem do lado do navegador, escrita à parte nos testes, são a evidência. O texto do payload no Deno não foi lido, só que ele foi montado sem erro. Nada no projeto hospedado; o CPU do despacho com lote cheio não foi medido. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** `arquiteto`: aceitar ou recusar as diferenças do handoff. `banco-de-dados`: `rls_tasks.test.sql:1052` com descrição que deixou de ser verdade. Implantação: gerar o par VAPID e conferir a chave pública.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:16 (BRT)

- **Branch:** feat/notifications-ui-check, criada a partir de feat/phase-4-notifications (55f87f0)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** segunda etapa de F4-3, F4-4, F4-5 e F4-7 sobre o estado integrado: o sino passa ao encaixe `headerRight` de Hoje, e a E2E e as telas foram conferidas.
- **Alterações:**
  - `apps/app/app/(app)/(tabs)/index.tsx`: `headerRight={<NotificationBell />}`; a sobreposição provisória saiu.
  - Handoff `20261102-1355-backend-funcoes-para-notificacoes-whatsapp-t-do-despacho` lido: nada a mudar. `notificationUrl` vive no mesmo arquivo de `buildPushPayload` sem import novo, e as chaves `push.*` seguem só com interpolação e plural por `count`.
- **Arquivos/módulos principais:** `apps/app/app/(app)/(tabs)/index.tsx`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY=<qualquer chave pública válida> pnpm e2e`.
- **Verificado:** `pnpm check` passou. `pnpm e2e` 64 passaram e 1 pulado, numa só execução, com uma chave pública VAPID de teste passada só pelo ambiente do comando: o par foi gerado em memória, a privada nunca foi escrita nem mostrada, e a pública foi apagada depois. O pulado é o teste "sem chave pública", que só roda sem ela. As quatro specs de notificações passaram na primeira vez: sino ao vivo pelo Realtime em duas abas, aviso, alvo de 44 px, título "Avisos · Azkaban", um `main`, toque em `/proofs/<id>`, contador zerado na outra aba, contestação ao autor, linha genérica depois de sair do grupo, "Marcar todos"; silêncio salvo, recusado igual, desligado e religado; interruptores por tipo; aparelho "Chrome · Android" listado e removido. Telas por capturas do Chromium em 375x812 e 1280x800, claro e escuro: sino com contador ao lado de "Hoje", sem empurrar a data; aviso ao vivo no topo, com fechar; lista com não lidos e a linha "Uma tarefa" de ocorrência apagada; preferências com o cartão "Ativar notificações", interruptores, silêncio 22:00 a 07:00 com o fuso e a lista de aparelhos vazia; título do documento por tela.
- **Não verificado:** a permissão real e a inscrição no navegador (o Chromium sem janela responde `denied` mesmo com a permissão concedida, então o estado do botão foi visto com `Notification.permission` forçado a `default`), o registro do `sw.js` e push real; iOS, Android e o projeto hospedado. A 320 px não foi conferido. O aviso ao vivo cobre o cabeçalho, inclusive o sino e o "Voltar", por até 6 s. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** verificação manual do push no Android, desktop e iPhone pela Tela de Início.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:18 (BRT)

- **Branch:** chore/security-phase-4, criada a partir de feat/phase-4-notifications (55f87f0)
- **Agente(s):** revisor-seguranca
- **Resumo:** Revisão de segurança da Fase 4 (diff `feat/phase-3-proof..feat/phase-4-notifications`), estática, sem PoC de banco: a pilha estava com outro agente e o orquestrador pediu para não usá-la. Um achado médio, oito baixos ou informativos e um risco de produto, em três handoffs.
- **Alterações:**
  - Handoffs `20261102-1420-revisor-seguranca-para-{banco-de-dados-notificacoes,notificacoes-whatsapp-service-worker-e-cabecalhos,arquiteto-caminho-interno}`.
  - SEG4-1 (média): alternar `done` e `pending` gera um `occurrence_resolved` novo por volta para o criador, sem limite (chave pelo id da linha do histórico).
  - SEG4-2 a SEG4-9 (baixa ou informativo): troca de dono do endpoint sem prova de posse; `proof_in_review` sem `can_view_task_for`; `DELETE` do Realtime para todo assinante; `push_subscriptions` sem retenção; `internalPath` do `sw.js`, do contrato e `safeInternalPath` aceitam tab, LF e CR e resolvem para outra origem; `_headers` sem CSP, `frame-ancestors`, `nosniff` e `Referrer-Policy`; sessão que acaba sem Sair mantém o push.
  - Risco de produto: título da tarefa na tela bloqueada.
- **Arquivos/módulos principais:** `docs/agentes/handoffs/`, este LOG
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma
- **Como testar:** os passos estão em cada handoff.
- **Verificado:** `pnpm install --frozen-lockfile`, `pnpm check` e `pnpm build:web` passaram; `node --test supabase/functions/dispatch-notifications/push.test.ts` 18 de 18, com o vetor do apêndice A da RFC 8291. PoC no Node: regex de caminho interno com tab, LF e CR resolvendo para `https://evil.com/`; `endpointAllowed` contra maiúsculas, ponto final, portas, userinfo, `%2e`, tab e U+3002 (todos corretos). Busca de segredos em `apps/app/dist`: nenhum. `.env` e `.env.*` ignorados pelo git. Leitura da cifra aes128gcm e do VAPID contra as RFCs 8291 e 8292: conferem.
- **Não verificado:** nenhum PoC de banco (SEG4-1, SEG4-2, regex do host no Postgres, RLS e Realtime de `notifications` com dois usuários): a pilha chegou a subir e foi parada sem rodar nada, a pedido do orquestrador. Nenhum envio a serviço de push real. Se `router.replace` do expo-router sai da origem com `?next=/%09/evil.com`. Hora derivada de UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** rodar os PoCs de banco sobre o estado integrado depois do QA. Donos: `banco-de-dados`, `notificacoes-whatsapp`, `arquiteto`.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:30 (BRT)

- **Branch:** docs/notifications-security-decisions, criada a partir de feat/phase-4-notifications (15f5424)
- **Agente(s):** arquiteto
- **Resumo:** decisões da revisão de segurança da Fase 4 (SEG4-1 a SEG4-9), do risco do título na tela bloqueada e das diferenças do despacho, no ADR-0008, seção 17. Contrato do caminho interno corrigido.
- **Alterações:**
  - `docs/adr/0008-notificacoes-push-pwa-vermelho-automatico.md`: seção 17 nova; itens 8 a 10 na seção 16; remissões nas seções 3, 6, 7, 8, 9, 13, 14 e 15.
  - `packages/contracts/src/notifications.ts`: `internalPathSchema` exportado, sem `\` e sem caractere de controle (`\p{Cc}`); `pushPayloadSchema.url` o usa. Testes recusam `"/\t/evil.com"`, `"/\n/evil.com"`, `"/\r/evil.com"`, `//evil.com`, `/\evil.com`, U+0000, U+007F e `/`, e conferem com `new URL` que cada recusado sai da origem e cada aceito fica.
  - `packages/config/src/notifications.ts`: `notificationRules.renotifyCooldown` (10 minutos; `occurrence_missed`, `occurrence_resolved`, `proof_disputed`) e `pushSubscriptionRetentionDays` (90).
  - Handoffs `20261102-1430-arquiteto-para-{banco-de-dados-seguranca-fase-4,notificacoes-whatsapp-seguranca-fase-4,auth-grupos-caminho-interno}`.
- **Arquivos/módulos principais:** `docs/adr/0008-notificacoes-push-pwa-vermelho-automatico.md`, `packages/contracts/src/notifications.ts`, `packages/config/src/notifications.ts`
- **Migrations:** nenhuma; o espelho dos dois valores novos é de `banco-de-dados`.
- **Decisões/ADRs:** ADR-0008, seção 17. SEG4-1: o mesmo aviso (usuário, tipo, ocorrência e `data`) não se repete em 10 minutos. SEG4-2: troca de dono só com as mesmas chaves, senão `forbidden`. SEG4-3: `proof_in_review` passa por `can_view_task_for` e `archived_at`. SEG4-4: risco aceito. SEG4-5: inscrição sem entrega há 90 dias sai. SEG4-6 e SEG4-9: regex sem controle no contrato, `safeInternalPath` usa o schema (`auth-grupos`), `sw.js` compara a origem (`notificacoes-whatsapp`). SEG4-7: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `nosniff` e `Referrer-Policy` agora; CSP completa como Report-Only depois. SEG4-8: sessão nula cancela o push. Título na tela bloqueada mantido, opção de esconder a confirmar pelo humano. As cinco diferenças do despacho aceitas.
- **Como testar:** `pnpm check`; `pnpm --filter @azkaban/contracts exec vitest run src/notifications.test.ts`.
- **Verificado:** `pnpm install --frozen-lockfile` e `pnpm check` passaram. Mutação no contrato: a regex antiga faz 7 testes falharem; restaurada.
- **Não verificado:** a pilha não foi usada (está com o QA), então `pnpm db:check-permissions` não rodou e vai acusar `notification_rules` até a migration do espelho. Nenhuma CSP foi testada em navegador. Se `router.replace` do expo-router sai da origem com `?next=/%09/evil.com`. Hora do título derivada de UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** `banco-de-dados` (SEG4-1, 2, 3, 5 e espelho), `notificacoes-whatsapp` (SEG4-6, 7, 8), `auth-grupos` (`safeInternalPath`). Humano: esconder o conteúdo na tela bloqueada, e os itens 8 a 10 da seção 16.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:31 (BRT)

- **Branch:** fix/auth-internal-path, criada a partir de feat/phase-4-notifications (0d23f88)
- **Agente(s):** auth-grupos
- **Resumo:** SEG4-9. `safeInternalPath` passa a usar `internalPathSchema` do contrato e recusa tab, LF, CR, qualquer caractere de controle, `\`, `//` e mais de 200 caracteres no `?next=`.
- **Alterações:**
  - `packages/core/src/navigation/safeInternalPath.ts`: `path !== undefined && internalPathSchema.safeParse(path).success ? path : undefined`. A regra fica só no contrato.
  - `packages/core/src/navigation/safeInternalPath.test.ts`: casos antigos mantidos; recusa `"/\t/evil.com"`, `"/\n/evil.com"`, `"/\r/evil.com"`, U+0000, U+007F, U+009F e 201 caracteres; aceita `/join/ABC`, query e hash, `/%09/evil.com` ainda codificado e 200 caracteres, conferindo com `new URL` que fica na origem. Formas do `?next=` (`/%09/evil.com`, `/%0a/evil.com`, `/%0d/evil.com`, `/%5c/evil.com`, `/%5cevil.com`, `%2F%2Fevil.com`): decodificadas com `URLSearchParams`, cada uma sai da origem com `new URL` e é recusada.
- **Arquivos/módulos principais:** `packages/core/src/navigation/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seção 17 (SEG4-6 e SEG4-9). Sem contrato novo.
- **Como testar:** `pnpm check`; `pnpm --filter @azkaban/core exec vitest run src/navigation`.
- **Verificado:** `pnpm install --frozen-lockfile` e `pnpm check` passaram (core 542 testes, 26 deles de `safeInternalPath`). Mutação: a regex antiga faz 10 testes falharem (tab, LF, CR, U+0000, U+007F, U+009F, 201 caracteres e as três formas `%09`, `%0a`, `%0d`); restaurada.
- **Não verificado:** `pnpm dev` na porta 8081 com `/sign-in?next=/%09/evil.com` depois de entrar, porque entrar precisa da pilha, que está com o QA. Que o expo-router entrega o `next` já decodificado, como o teste supõe (se não decodificar, `/%09/evil.com` é texto no caminho e fica na origem, o que o teste também confere). Hora do título derivada de UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** nenhuma em `auth-grupos`. `sw.js` continua com `notificacoes-whatsapp`.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:34 (BRT)

- **Branch:** fix/notifications-security (a partir de `feat/phase-4-notifications`, `0d23f88`)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** SEG4-6, SEG4-7 e SEG4-8 do ADR-0008, seção 17, como pedido no handoff do arquiteto (`20261102-1430`). Hora: PowerShell bloqueado no worktree, então UTC menos 3.
- **Alterações:**
  - SEG4-6: `internalPath` do `sw.js` usa a regex de `internalPathSchema` (sem caractere de controle) e depois resolve contra `self.location.origin`, aceitando só a mesma origem; devolve `pathname + search + hash`, senão `'/'`.
  - SEG4-7: `_headers` com `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`, `nosniff` e `strict-origin-when-cross-origin` para `/*`. Os `Cache-Control` ficam. A CSP completa, em Report-Only, é o passo seguinte.
  - SEG4-8: `stopPushWhenSignedOut()` em `feature-notifications`, chamado uma vez no layout raiz: com sessão nula por qualquer caminho e chave local presente, `unsubscribePush()` e limpa a chave. O botão Sair segue igual.
  - `feature-notifications` ganhou `vitest` e o primeiro teste.
- **Arquivos/módulos principais:** `apps/app/public/sw.js`, `apps/app/public/_headers`, `apps/app/public.test.ts`, `apps/app/app/_layout.tsx`, `packages/features/notifications/src/device.ts` e `device.test.ts`.
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0008, seção 17. Nenhuma nova.
- **Como testar:** `pnpm check`; `pnpm build:web` e conferir `apps/app/dist/_headers`. Manual do SEG4-8: ativar push, apagar a sessão do `localStorage`, recarregar; a inscrição some e a chave `notifications.thisDevice` também.
- **Pendências / próximos passos:** E2E e o teste manual do SEG4-8 no navegador não rodaram (a pilha estava com o QA). O servidor da E2E não aplica `_headers`, então os cabeçalhos só se confirmam no Netlify.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:45 (BRT)

- **Branch:** chore/qa-phase-4, criada a partir de feat/phase-4-notifications (15f5424)
- **Agente(s):** qa-testes
- **Resumo:** QA da Fase 4 no estado integrado. E2E nova dos dois jobs SQL (vermelho automático e lembretes), correção de quatro instabilidades de E2E ligadas ao pg_cron local e a uma corrida de leitura, percurso das telas a 320, 375 e 1280 px nos dois temas, e quatro achados em dois handoffs.
- **Alterações:**
  - `e2e/notifications-jobs.spec.ts` (novo): `auto_miss_occurrences` chamado direto marca o que passou do dia e deixa de fora arquivada, ex-membro, carência de reabertura e `in_review`; histórico sem autor, XP zero, aviso só ao responsável (nenhum ao criador), idempotente; sino ao vivo, texto do vermelho na lista, bloco "Não feito" no calendário; `missed → done` na janela dá `occurrence_done_late` de 5 XP. Lembrete por `enqueue_due_reminders`: uma linha só mesmo chamado duas vezes, nada para tarefa feita ou arquivada, aviso "Daqui a 10 minutos." e toque abrindo `/tasks/<id>`. Um teste com `test.fail()` só na asserção do QA4-1.
  - `e2e/proof-fixtures.ts`: `shieldFromAutoMiss(page)` dá às ocorrências passadas e pendentes do usuário a carência do job. Usado em `tasks-late-and-count.spec.ts` (dois testes) e `tasks-proof.spec.ts` (reagendar atrasada): o cron de 5 minutos roda também na pilha local e podia deixá-las vermelhas no meio do teste.
  - `e2e/notifications-bell.spec.ts`: a tarefa do teste fica sem lembretes; o formulário começa na próxima hora com antecedências de 30 e 0, e da meia hora em diante o cron de lembretes podia tocar o sino da Duda, que o teste conta.
  - `e2e/calendar.spec.ts`: espera o `set_occurrence_status` responder antes de a dona abrir a Equipe. "Feito" aparece antes de gravar, e a Equipe lia "pendente" (falhou na primeira execução).
  - Handoffs `20261102-1440-qa-testes-para-{tarefas-calendario-vermelho-some-de-hoje,notificacoes-whatsapp-aviso-ao-vivo}`.
- **Arquivos/módulos principais:** `e2e/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma. Achados: QA4-1 (média, `tarefas-calendario`) o vermelho do job some de Hoje e da aba da área, mas ainda pode ser concluído na janela; QA4-2 (média, `notificacoes-whatsapp`) o aviso ao vivo cobre o "Voltar" e o sino por 6 s nas três larguras, e o toque abre o aviso; QA4-3 (baixa) a região `role="status"` só é montada com o texto; QA4-4 (baixa) o aviso de vermelho não diz até quando, como o ADR-0008 pede.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm e2e`; com uma chave pública VAPID qualquer no ambiente, rodam os dois testes de push.
- **Verificado:** `pnpm check` passou (core 526, platform 46, contracts 44, ui 11, config 7, data 7, app 6, proof 6). `pnpm db:test` 1203 de 1203. `pnpm functions:test` 114 de 114. `pnpm e2e` duas vezes: sem chave VAPID, 65 passaram, 2 pulados (os de push) e 1 falhou (`calendar.spec.ts:229`, a corrida corrigida acima); com uma chave pública gerada em memória e passada só ao processo, 67 passaram e 1 pulado (o "sem chave"), sem `retries`. Depois da última mudança no ajudante, `tasks-late-and-count` e `tasks-proof` de novo: 12 de 12. Percurso com Playwright a 320, 375 e 1280 px, claro e escuro: sino de 44×44 com "Avisos, N não lidos"; aviso ao vivo em `role="status"`; lista; preferências e silêncio sem chave; alerta de materialização com `failed` e "Tentar de novo"; vermelho no dia do calendário; um `main` por tela; `navigation` "Navegação principal" com cinco `tab` de 64 px de altura e nenhum rótulo cortado (a 320 px: 44, 68, 80, 81 e 46 px); sem rolagem lateral; nenhum alvo abaixo de 44 px nas telas medidas; título "<tela> · Azkaban" em todas as 15 rotas abertas; Tab chega ao sino primeiro, com contorno de foco, e Enter abre `/notifications`.
- **Não verificado:** push real, registro do `sw.js`, manifest instalável e `theme-color` na barra; iPhone, Android e leitor de tela. Cartão de push com chave só pela E2E, sem captura. Sem mutação: a lógica do job é do banco e já foi mutada pelo `banco-de-dados`. A Equipe, a revisão de prova e as telas sem login não entraram no percurso de títulos. A janela entre criar a tarefa e chamar `shieldFromAutoMiss` continua existindo, mas é de milissegundos. Nada no projeto hospedado nem no CI. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** QA4-1 e QA4-2 antes de fechar a fase. Seguem abertos de antes: `PushSetupCard` no onboarding (7.7 do prompt mestre), SEG4-1 a SEG4-9, e a E2E do resumo diário, que é da Fase 5.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:48 (BRT)

- **Branch:** fix/today-auto-missed, a partir de `feat/phase-4-notifications` (`a6c1a32`)
- **Agente(s):** tarefas-calendario
- **Resumo:** QA4-1 corrigido. A ocorrência que o job deixou vermelha continua em "Atrasadas" de Hoje e da aba da área enquanto ainda pode ser concluída, e sai quando a janela fecha.
- **Alterações:**
  - `isStillResolvable` (core): `missed`, depois de `overdueAt` e dentro da janela de atraso, ou sem janela para quem tem `task.manage_group`, a mesma regra de `checkTransition`. Vale para toda `missed`, não só a do job.
  - `planToday` e `planArea` recebem `lateCompletionWindowHours` e `canManageGroup(groupId)` e põem em "Atrasadas" a pendente atrasada ou a vermelha que ainda dá para resolver. As telas passam `taskRules` e `canManageGroupTask`.
  - `listOverdue` (data) traz `pending` e `missed` passadas de `overdueAt`, as 100 mais novas; o corte pela janela fica no core, porque depende de quem olha.
  - Comentários "até o job existir" atualizados. E2E: o `test.fail()` do QA4-1 saiu de `e2e/notifications-jobs.spec.ts`.
- **Arquivos/módulos principais:** `packages/core/src/tasks/{late,today}.ts` e testes, `packages/data/src/tasks/index.ts`, `packages/features/tasks/src/{TodayScreen,AreaScreen}.tsx`, `e2e/notifications-jobs.spec.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0005 seção 1 sem mudança: a lista segue a janela que a transição já aplica.
- **Como testar:** `pnpm check`; E2E `pnpm exec playwright test e2e/notifications-jobs.spec.ts` com a pilha local.
- **Verificado:** `pnpm check` (core 554 testes) e `pnpm build:web` passam.
- **Não verificado:** a E2E não rodou (a pilha estava com o `banco-de-dados`). Hora em BRT derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Pendências / próximos passos:** quem tem `task.manage_group` vê suas vermelhas em "Atrasadas" sem prazo, até o limite de 100 da consulta.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 14:51 (BRT)

- **Branch:** fix/notifications-toast, criada a partir de feat/phase-4-notifications (a6c1a32)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** QA4-2, QA4-3 e QA4-4 do handoff `20261102-1440-qa-testes-para-notificacoes-whatsapp-aviso-ao-vivo`. O aviso ao vivo desceu para baixo e não cobre mais "Voltar", o sino, "Nova tarefa" nem a barra de abas; a região `role="status"` fica sempre montada; o vermelho automático diz até quando ainda dá para concluir, no sino e no aviso ao vivo.
- **Alterações:**
  - `NotificationToaster`: ancorado embaixo, com a área segura. Numa aba, fica acima da barra (`layout.tabBarHeight`) e da faixa do botão "Nova tarefa" (`sizes.fab`); fora das abas (`useSegments` sem `(tabs)`), a `spacing[4]` do fim. A `View role="status" aria-live="polite"` (`testID="notification-toast"`) é montada sempre, vazia, com `pointerEvents: 'box-none'`; só o cartão entra e sai. Nova dependência `react-native-safe-area-context` no pacote (a mesma versão do `ui`).
  - `packages/data/src/notifications`: o embed do sino lê também `task_occurrences(overdue_at, status)`; `BellItem` ganha `overdueAt` e `occurrenceStatus`. Tipo local do repositório, sem mudança de contrato.
  - `packages/core/src/notifications/pushPayload.ts`: `missedLateUntil(source, horas, agora)` devolve o fim da janela de atraso de um vermelho automático ainda `missed`, ou nulo (marcado por alguém, resolvido depois, janela fechada, outro tipo). Dois testes novos.
  - `hooks.ts` (`useItemText`): acrescenta "Ainda dá para concluir até {{when}}." (`notifications.lateUntil`), com dia, mês e hora no fuso do perfil.
  - E2E (não executadas): teste novo em `notifications-jobs.spec.ts` que, a 320, 375 e 1280 px, toca um lembrete em Hoje e confere com `elementFromPoint` que o sino e "Nova tarefa" seguem com o toque e que o aviso acaba acima do `tablist`; abre a tarefa pelo aviso, toca outro aviso e confere "Voltar" com `elementFromPoint` e o clique voltando a Hoje; e prova que a região existe vazia antes do primeiro aviso, esvazia depois de `toastMs` e é o mesmo nó do começo ao fim. O teste do vermelho espera o prazo no aviso e na lista. `getByRole('status')` virou `getByTestId('notification-toast')` nos dois arquivos.
- **Arquivos/módulos principais:** `packages/features/notifications/src/{NotificationToaster.tsx,hooks.ts}`, `packages/data/src/notifications/index.ts`, `packages/core/src/notifications/pushPayload.ts`, `packages/i18n/src/pt-BR/notifications.json`, `e2e/notifications-{jobs,bell}.spec.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** o prazo do vermelho sai do cliente com o que o embed já pode ler, então acompanha um reagendamento. O push não o traz: `claim_notification_batch` não devolve `overdue_at`. Handoff `20261102-1451-notificacoes-whatsapp-para-arquiteto-banco-de-dados-prazo-no-push` para decidir entre o claim devolver o campo ou corrigir o ADR-0008, seção 10.
- **Como testar:** `pnpm check`, `pnpm build:web`; com a pilha, `pnpm exec playwright test e2e/notifications-jobs.spec.ts e2e/notifications-bell.spec.ts`.
- **Verificado:** `pnpm check` passou (683 testes de unidade, core 544); `pnpm build:web` passou.
- **Não verificado:** nenhuma E2E rodou (a pilha estava com o `banco-de-dados`), nem o aviso foi visto no navegador. Leitor de tela real não foi usado. Se um rótulo de aba quebrar em duas linhas, a barra passa de 64 px e o aviso pode encostar na faixa do "Nova tarefa" (o QA mediu 64 px a 320). Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** prazo no push, conforme o handoff.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 15:02 (BRT)

- **Branch:** fix/notifications-db-security, criada a partir de feat/phase-4-notifications (a6c1a32)
- **Agente(s):** banco-de-dados
- **Resumo:** SEG4-1, SEG4-2, SEG4-3 e SEG4-5 do ADR-0008, seção 17, e o espelho de `renotifyCooldown` e `pushSubscriptionRetentionDays`, como pede o handoff `20261102-1430-arquiteto-para-banco-de-dados-seguranca-fase-4`. Cinco migrations, uma por mudança. Hora: PowerShell bloqueado no worktree, então UTC menos 3.
- **Alterações:**
  - Espelho: `app_settings.notification_rules` ganha `renotifyCooldown` (10 minutos; `occurrence_missed`, `occurrence_resolved`, `proof_disputed`) e `pushSubscriptionRetentionDays` (90).
  - SEG4-1: `enqueue_notification` não grava nada se o mesmo usuário já tem, há menos de `renotifyCooldown.minutes`, uma linha do mesmo tipo, da mesma ocorrência e com o mesmo `data`, para os tipos da lista. Ocorrência nula fica fora. A chave do evento e o `on conflict do nothing` continuam. Sem índice novo: `notifications_user_created_idx` serve a busca.
  - SEG4-2: `register_push_subscription` só troca o dono com `p256dh` e `auth` iguais aos guardados (`on conflict ... do update ... where`); sem linha devolvida, `forbidden` (42501). O dono continua atualizando chaves e agente.
  - SEG4-3: `can_receive_notification`, ramo `proof_in_review`, exige `can_view_task_for` e `archived_at is null`, além de grupo, `visibility = 'group'` e `proof.review`. Vale na gravação e no recheque do claim.
  - SEG4-5: `delete_expired_notifications` (cron diário, 04:30 UTC) apaga também as inscrições com `coalesce(last_success_at, created_at)` mais velho que 90 dias. Continua devolvendo as linhas do sino apagadas.
  - `rls_tasks.test.sql`: a chamada do cron da materialização agora apaga os dois segredos antes e usa `throws_ok(..., 'P0001', 'materialize_not_configured', ...)` (pendência do handoff `20261102-1355` do `backend-funcoes`).
  - `rls_notifications.test.sql`: 24 testes novos (plano 223). Quatro contagens antigas mudaram de propósito: `done, pending, done` na mesma transação deixou de ser dois avisos.
- **Arquivos/módulos principais:** `supabase/migrations/2026110215*.sql`, `supabase/tests/rls_notifications.test.sql`, `supabase/tests/rls_tasks.test.sql`
- **Migrations:** 20261102150000_notification_rules_security, 20261102150100_enqueue_notification_cooldown, 20261102150200_push_subscription_owner_keys, 20261102150300_proof_in_review_task_access, 20261102150400_push_subscription_retention. Só no banco local.
- **Decisões/ADRs:** ADR-0008, seção 17. Nenhuma nova.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`.
- **Verificado:** PoCs do revisor rodados antes da correção, no banco local: 50 voltas `done`/`pending` de Duda deram 50 `occurrence_resolved` a Caio; Eva com o endpoint de Duda e outras chaves tomou a linha; um admin com `proof.review` e sem `task.view_group`, e uma tarefa arquivada, recebiam `proof_in_review`; uma inscrição de 91 dias sem entrega sobrevivia ao job. Depois da correção: 1 aviso, `forbidden` com a linha ainda de Duda, `false` nos dois casos, inscrição apagada. `pnpm db:test` 1227 de 1227. `pnpm db:check-permissions` em dia ("Notification rules in sync."). `pnpm functions:test` 114 de 114. `pnpm check` passou. Mutação nas quatro barreiras, aplicada direto no banco e desfeita com `db reset`: sem a janela, 9 testes falham (o laço de 50 dá 50, não 1); sem o `where` do upsert, 2; sem `can_view_task_for` e `archived_at`, 2; sem o `delete` das inscrições, 1. `pnpm e2e` uma vez, sem chave VAPID: 66 passaram e 2 pulados (os de push), sem falha; `notifications-jobs` e `notifications-bell` passaram sem ajuste, porque nenhum dependia de reavisar dentro da janela (o `x` de `notifications-jobs.spec.ts:248` é o `test.fail()` já marcado do QA4-1). `pnpm db:test` rodou mais de uma vez por causa das mutações.
- **Não verificado:** o cliente tratando `forbidden` do `register_push_subscription` como falha genérica (é do `notificacoes-whatsapp`); corrida real de duas transações na janela (o argumento é o bloqueio da linha da ocorrência, não testado com duas sessões); nada no projeto hospedado nem no CI.
- **Pendências / próximos passos:** nenhuma no banco. O teto de seis avisos por hora para quem alterna a cada 11 minutos fica como está, como diz o ADR.

### Claude de Rafaell Bezerra Saraiva — 2026-11-02 15:05 (BRT)

- **Branch:** feat/phase-4-notifications
- **Agente(s):** orquestrador
- **Resumo:** pausa pedida pelo humano no meio da Fase 4. Integrado tudo o que os agentes entregaram, com o handoff de retomada escrito. Só a branch `fix/notifications-db-security` (SEG4-1, 2, 3 e 5) ficou de fora, ainda em trabalho.
- **Alterações:**
  - Integrações de `336f35d` a `754e02e`: ADR-0008, banco, despacho, sino, push, preferências, casca PWA, títulos, QA e revisão de segurança, com as correções de cliente.
  - `docs/agentes/handoffs/20261102-1505-orquestrador-para-nova-sessao.md`: estado, ordem do que falta e perguntas ao humano.
  - `docs/agentes/ferramentas/log-merge.cjs` (resolve conflito do LOG ordenando as entradas por data) e `verificar-fase.sh` (verificação final de fase).
  - `docs/agentes/QUADRO.md`: F4-1 em andamento, por causa das correções de banco; os demais itens da Fase 4 em revisão.
- **Migrations:** nenhuma nesta entrada.
- **Decisões/ADRs:** o prazo do vermelho no push fica para o ADR da Fase 5 (F5-1). `PushSetupCard` no onboarding vai para o backlog.
- **Como testar:** `pnpm install --frozen-lockfile` e `pnpm check` no estado integrado.
- **Verificado:** `pnpm check` em `754e02e`: 17 de 17 tarefas e 9 de 9 suítes. Em `feat/phase-3-proof` (PR #4), o CI passou com E2E 58 de 58, `db:test` 1004 e funções 85.
- **Não verificado:** a verificação final da Fase 4 não rodou. A E2E das correções QA4-1 a QA4-4 e de SEG4-6 a 8 não rodou. `db:check-permissions` falha até o espelho de `notification_rules` entrar.
- **Pendências / próximos passos:** as da seção 3 do handoff 1505.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 00:30 (BRT)

- **Branch:** fix/dispatch-import-map (base `e54968d`)
- **Agente(s):** backend-funcoes
- **Resumo:** `dispatch-notifications` não subia no Edge Runtime local (preflight 503, `Module not found .../packages/core/src/tasks/late`). A correção do QA4-4 fez `pushPayload.ts` importar `../tasks/late` sem extensão, e o import map da função não mapeava esse caminho.
- **Alterações:**
  - `supabase/functions/dispatch-notifications/deno.json`: chave relativa `../../../packages/core/src/tasks/late` para o `.ts`, como `materialize-occurrences` faz com `recurrence/zone`. `late.ts` só tem `import type` de `@azkaban/contracts`, que some em tempo de execução.
  - `supabase/functions/_shared/wait-for-functions.mjs`: a mensagem de falha aponta para o log do contêiner quando a função não sobe.
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma. A CLI monta no contêiner só os arquivos do import map, e só no `db:start`; depois de mudar um `deno.json` é preciso `supabase stop` e `db:start` (um `docker restart` não basta). Não há Deno no host, e um teste do grafo antes da pilha exigiria um script novo no `pnpm check`, fora do meu escopo; `pnpm functions:test` já pega o erro.
- **Como testar:** `pnpm db:start`, `curl -X OPTIONS http://127.0.0.1:54421/functions/v1/dispatch-notifications` deve dar 204; `pnpm functions:test`.
- **Verificado:** antes, 503 com o erro de boot no log; depois, 204 e nenhum `boot error` no log. `pnpm functions:test`: 114 de 114, 27 suítes. `pnpm check`: 17 de 17 tarefas e 9 de 9 suítes.
- **Não verificado:** E2E (fica com o orquestrador). Hora tirada de UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** nenhuma desta correção.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 00:33 (BRT)

- **Branch:** docs/whatsapp-adr, criada a partir de feat/phase-4-notifications (e54968d)
- **Agente(s):** arquiteto
- **Resumo:** F5-1. ADR-0009 decide o WhatsApp da Fase 5: provedor (`console` por padrão, Meta só por decisão do humano), canal na outbox, verificação de telefone por código no próprio WhatsApp, opt-in e opt-out, resumo diário, templates, webhook, custos, LGPD e o prazo do vermelho no push (handoff 1451). Contratos, config e handoffs publicados. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - `docs/adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md` (novo); remissão no ADR-0008, seção 11; seção "WhatsApp" em `docs/arquitetura.md`.
  - `packages/contracts/src/whatsapp.ts` e `whatsapp.test.ts` (novos): E.164, código, pedido e confirmação (a confirmação devolve o erro em vez de levantar, para não desfazer a contagem de tentativas), opt-in, estado, preferências do resumo, fonte e saída da função pura, parâmetro de template (sem controle, U+2028/2029 nem mais de quatro espaços), mensagem e resultado do provedor, status, assinatura, o mínimo do webhook e os códigos de erro.
  - `packages/config/src/whatsapp.ts` (novo): `whatsappRules` (espelho `whatsapp_rules`) e `whatsappDefaults`. `whatsapp-env.ts` (novo): `parseWhatsAppEnv`, `console` quando vazio, os quatro segredos obrigatórios com `meta`. `notifications.ts`: `activeChannels` com `whatsapp`, `whatsappTypes: ['daily_summary']`, `defaultChannels.daily_summary`.
  - `supabase/functions/.env.example`: os cinco nomes `WHATSAPP_*`, sem valor.
  - Handoffs `20261103-0030-arquiteto-para-{banco-de-dados,backend-funcoes,notificacoes-whatsapp}-whatsapp`.
- **Arquivos/módulos principais:** `docs/adr/0009-*.md`, `packages/contracts/src/whatsapp.ts`, `packages/config/src/{whatsapp,whatsapp-env,notifications}.ts`
- **Migrations:** nenhuma; espelhos e tabelas são do `banco-de-dados`.
- **Decisões/ADRs:** ADR-0009. Só o resumo diário vai por WhatsApp; job do resumo em SQL a cada minuto, idempotente por usuário e data local; fonte lida no claim; linha do sino nasce lida; claim com `p_channels`; PARAR pela mensagem inteira normalizada, também por `wa_id`; `whatsapp_messages` sem acesso do cliente; E2E lê o código e o resumo em `whatsapp_console_messages` (só service role, 1 dia). Prazo no push: o claim devolve `overdueAt`, `occurrenceStatus` e `timezone`. `daily_summary` entra em `notificationTypeSchema` pelo `notificacoes-whatsapp`, pré-aprovado, porque quebra o `switch` de core.
- **Como testar:** `pnpm check`; `pnpm --filter @azkaban/contracts exec vitest run src/whatsapp.test.ts`.
- **Verificado:** `pnpm install --frozen-lockfile` e `pnpm check` passaram (contracts 89, config 13, core 556). Mutação: a regex de E.164 sem âncoras faz 4 testes falharem; restaurada. Documentação da Meta lida por `curl` em 2026-11-03 (preços, componentes, autenticação, TTL, webhook, status, erros, limites, opt-in, categorias).
- **Não verificado:** na documentação atual da Meta, a regra de quebra de linha, tab e espaços dentro do parâmetro (só aparece o erro genérico 132018), um limite por parâmetro, a tabela em reais e o número de teste gratuito. Nada rodou contra a pilha nem contra a Meta. `pnpm db:check-permissions` vai acusar `notification_rules` e `whatsapp_rules` até a migration.
- **Pendências / próximos passos:** os três handoffs. Humano: os 12 itens da seção 16 do ADR-0009, e se e quando ligar a Meta (seção 10). Sugestão ao orquestrador: um item de banco na Fase 5 e o F5-5 dividido entre banco (job SQL) e funções (canal).

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 00:46 (BRT)

- **Branch:** feat/whatsapp-providers, criada a partir de feat/phase-5-whatsapp (ae862e3)
- **Agente(s):** backend-funcoes
- **Resumo:** item 1 e as partes puras do item 4 do handoff `20261103-0030-arquiteto-para-backend-funcoes-whatsapp`: provedores do WhatsApp e as peças do webhook que não dependem do banco, com testes em Node. Nenhuma função servida nova, nenhuma chamada à Meta. Hora derivada de UTC menos 3 (PowerShell bloqueado no worktree).
- **Alterações:**
  - `_shared/whatsapp/provider.ts`: `WhatsAppProvider` (com `name`, para a coluna `provider` de `whatsapp_messages`), `ConsoleProvider` (a escrita em `whatsapp_console_messages` entra como a função `record`, injetada; o log tem só tipo e template; `console.<uuid>`; uma escrita que falha lança) e `MetaCloudProvider` (payloads `template` com parâmetros nomeados, `code` no corpo e no botão `url` índice 0, `text` sem prévia; `redirect: 'manual'`; `AbortSignal.timeout(sendTimeoutMs)`; mapa de respostas da seção 1; resposta lida até 64 KiB com `readLimited`; o token fica num campo privado e nenhum erro é repassado). `createWhatsAppProvider(parseWhatsAppEnv(...), { fetch, record })` escolhe a implementação; vazio é `console`.
  - `_shared/whatsapp/webhook.ts`: `challengeAnswer` (GET, `sameSecret`, desafio `[A-Za-z0-9_-]{1,128}`), `validSignature` (`crypto.subtle.verify` sobre os bytes brutos), `normalizeReply`/`isStop` e `readWebhook` (filtro `field = messages` e `phone_number_id`, status para `{ providerMessageId, status, at, errorCode }`, `wa_id` das paradas sem repetição, contagem de ignorados).
  - `_shared/import-maps.test.ts`: percorre, sem Deno e sem a pilha, o grafo de imports de execução de cada função a partir do `index.ts`, pelo `deno.json`, e falha num import que o Edge Runtime não resolveria. Tirar o mapeamento de `tasks/late` do despacho faz o teste falhar com o mesmo caminho do erro de ontem.
  - `sameSecret` foi para `_shared/secret.ts` e `retryAfterSeconds` para `_shared/retry-after.ts`, para Node importá-los sem `supabase-js`; `http.ts` e `web-push.ts` reexportam, sem mudança para quem usa.
  - `functions:test` ganha os três arquivos novos.
- **Arquivos/módulos principais:** `supabase/functions/_shared/{whatsapp/*,import-maps.test.ts,secret.ts,retry-after.ts,http.ts}`, `supabase/functions/dispatch-notifications/web-push.ts`, `package.json`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova. Os módulos só têm imports relativos com extensão (os tipos do contrato são `import type`, apagados), então nenhum `deno.json` muda agora. O `deno.json` do `whatsapp-webhook` e do `phone-verification` entra com o `index.ts`, na integração; o teste do grafo cobra os mapeamentos (`whatsapp.ts` puxa `common`, `notifications`, `tasks` e `recurrence`). Não criei pasta de função sem `index.ts` para não arriscar o `db:start`, que não pude rodar.
- **Como testar:** `node --test supabase/functions/_shared/import-maps.test.ts supabase/functions/_shared/whatsapp/provider.test.ts supabase/functions/_shared/whatsapp/webhook.test.ts`; com a pilha, `pnpm functions:test`.
- **Verificado:** 38 testes novos passaram (6 do grafo, 18 do provedor, 14 do webhook); com `push.test.ts` e `checks.test.ts`, 75 de 75 em Node. `tsc` estrito à parte nos arquivos novos, sem erro. `pnpm check` passou. Mutações, desfeitas: `validSignature` aceitando HMAC diferente faz 2 testes falharem; `challengeAnswer` aceitando qualquer token não vazio, 1.
- **Não verificado:** `pnpm functions:test` completo, `db:start` e E2E (pilha ocupada pela Fase 4). O código não rodou no Deno nem no Edge Runtime. O formato real de erro e de sucesso da Meta só foi conferido contra a documentação; nada foi enviado.
- **Pendências / próximos passos:** itens 2 e 3 e a integração do item 4, depois das migrations do `banco-de-dados`. Os nomes dos campos de `record_whatsapp_statuses` (`providerMessageId`, `status`, `at`, `errorCode`) são proposta, a combinar com ele.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 00:48 (BRT)

- **Branch:** feat/whatsapp-core, criada a partir de feat/phase-5-whatsapp (ae862e3)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** Itens 1 a 3 do handoff `20261103-0030-arquiteto-para-notificacoes-whatsapp-whatsapp`, a parte sem banco: `daily_summary` no contrato, no core e no sino; `buildDailySummary`, `normalizePhone` e `isWhatsAppReady` em core; o prazo do vermelho no push (ADR-0009, seção 9); as chaves de i18n; e a coluna WhatsApp das preferências só para `whatsappTypes`. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - `packages/contracts/src/notifications.ts`: `daily_summary` em `notificationTypeSchema` e `notificationItemSchema` (pré-aprovado). `dailySummaryNotificationDataSchema` mudou de `whatsapp.ts` para cá: `whatsapp.ts` importa `notifications.ts`, e o ciclo deixaria um lado indefinido.
  - `packages/core/src/notifications/pushPayload.ts`: caso `daily_summary` (título "Resumo do dia", `notificationUrl` dá `/`); `notificationText` exportado, o texto que o sino e o push compartilham; `PushSource` com `timezone`, `overdueAt` e `occurrenceStatus` opcionais; `buildPushPayload(source, requiresPhoto, t, late?)`, que acrescenta `lateUntil` ao vermelho do job dentro da janela, no fuso do perfil. `buildPushPayload` lança para `daily_summary`, porque `internalPathSchema` recusa `/`.
  - `packages/core/src/notifications/whatsapp.ts` (novo): `buildDailySummary` (Hoje agrupado por área e contexto na ordem da fonte, atrasadas com o dia de origem, prazos com o dia da semana e "amanhã"/"em N dias", "+N" do que não cabe, limpeza de controle e de espaços, textos curtos no vazio, fecho neutro, saída por `dailySummaryRenderSchema`), `isDailySummaryEmpty`, `cleanParam`, `normalizePhone` e `isWhatsAppReady`. Testes em `whatsapp.test.ts` e no `pushPayload.test.ts`.
  - `packages/features/notifications`: o sino usa `notificationText` com o fuso e o idioma (o prazo saiu do hook e foi para o core); o aviso ao vivo ignora a linha já lida; as preferências mostram o WhatsApp só para `notificationRules.whatsappTypes` e tiram `daily_summary` do push.
  - `packages/data/src/notifications/index.ts`: cast em `setPreference` até a migration do `banco-de-dados` pôr `daily_summary` no enum e regenerar `database.types.ts`.
  - `packages/i18n/src/pt-BR/notifications.json`: `push.daily_summary`, `types.daily_summary`, `whatsapp.summary.*` (com os nomes das áreas, porque o `t` do despacho só lê este arquivo), `whatsapp.stopReply`, `whatsapp.consent.v1.*` (rascunho do aviso) e chaves das telas (`phone`, `code`, `errors`, `status`, `dailySummary`).
  - Handoff `20261103-0050-notificacoes-whatsapp-para-backend-funcoes-resumo-e-prazo-no-despacho`, com as chaves do import map.
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova. O resumo não tem caminho de push: `internalPathSchema` recusa `/`, e a tela não oferece o push para ele.
- **Como testar:** `pnpm --filter @azkaban/core exec vitest run src/notifications`; `pnpm check`.
- **Verificado:** `pnpm install --frozen-lockfile`; `pnpm check` passou (17 de 17 e 9 de 9 tarefas; core 590 testes, contracts 89).
- **Não verificado:** a pilha, o despacho no Deno e a E2E (pilha ocupada pela Fase 4); as telas no navegador. As chaves do resumo no core são testadas com uma cópia; o JSON real só é exercitado pelo despacho, quando o `backend-funcoes` ligar o canal.
- **Pendências / próximos passos:** `backend-funcoes`, pelo handoff (import map e campos novos no `render`). `banco-de-dados`: enum com `daily_summary` e tipos regenerados; aí o cast sai. Telas e repositório do WhatsApp (itens 4 e 5) depois das RPCs. Texto do aviso de consentimento para o humano revisar.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 00:53 (BRT)

- **Branch:** fix/e2e-phase-4-close, criada a partir de feat/phase-4-notifications (3b428b2)
- **Agente(s):** qa-testes
- **Resumo:** As duas falhas da verificação final da Fase 4 corrigidas na E2E. Os jobs de relógio do pg_cron ficam desligados durante a suíte, e a spec que os chama direto roda por último, o que tira da suíte a classe de falha "lembrete ou vermelho no meio de um teste, conforme a hora".
- **Alterações:**
  - `e2e/global-setup.ts` (novo): desliga `enqueue-due-reminders` e `auto-miss-occurrences` com `cron.alter_job` (via `supabase db query --local`) e religa no teardown.
  - `playwright.config.ts`: `globalSetup` e dois projetos, `app` (tudo menos `notifications-jobs`) e `jobs` (`notifications-jobs`, com `dependencies: ['app']`). Os dois jobs agem em todas as linhas do banco, então chamá-los no meio da suíte tocava as tarefas das outras specs. Rodar só `notifications-jobs` pede `--project=jobs --no-deps`.
  - `e2e/proof-fixtures.ts`: `shieldFromAutoMiss` removido, com as três chamadas em `tasks-late-and-count.spec.ts` e `tasks-proof.spec.ts`; `e2e/notifications-bell.spec.ts`: sai o `reminders: []` da tarefa. Os dois existiam só contra o cron e as chamadas diretas.
  - `e2e/notifications-bell.spec.ts` e `notifications-jobs.spec.ts`: o que é da lista é procurado dentro de `[role="main"]:visible`; o aviso ao vivo fica fora dela e repetia o texto (`notifications-bell.spec.ts:78`).
  - Handoff `20261103-0049-qa-testes-para-notificacoes-whatsapp-aviso-na-lista` (QA4-5, baixa): em `/notifications`, o aviso ao vivo repete o primeiro item da lista.
- **Arquivos/módulos principais:** `e2e/`, `playwright.config.ts`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm e2e` (com uma chave pública VAPID no ambiente, rodam os testes de push).
- **Verificado:** specs afetadas primeiro: `notifications-bell`, `tasks-ui-fixes`, `tasks-late-and-count` e `tasks-proof` no projeto `app`, 18 de 18; `notifications-jobs` com `--no-deps`, 4 de 4. `pnpm e2e` completo uma vez, banco limpo, com chave pública gerada em memória e passada só ao processo: 68 passaram, 1 pulado (o "sem chave"), nenhuma falha, sem `retries`. Depois de cada execução, os seis jobs de `cron.job` voltaram a `active = true`. `pnpm check` passou (17 de 17 e 9 de 9).
- **Não verificado:** a suíte completa rodou por volta de 00:50, quando o lembrete de 30 minutos das tarefas criadas pelo formulário (na próxima hora) já estava vencido, e passou; mas foi uma execução só. Nada no CI (o `supabase db query --local` é da CLI 2.122 do lockfile, a mesma do CI). Uma execução interrompida antes do teardown deixa os dois jobs desligados até a próxima execução ou `db reset`. Hora derivada de UTC menos 3 (PowerShell bloqueado).
- **Pendências / próximos passos:** QA4-5, conforme o handoff. Uma falha no projeto `app` pula o `jobs` naquela execução.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 01:03 (BRT)

- **Branch:** feat/phase-4-notifications
- **Agente(s):** orquestrador
- **Resumo:** Fase 4 fechada. A verificação final em banco limpo achou dois problemas que nenhum agente tinha visto: `dispatch-notifications` não subia no Edge Runtime e duas E2E dependiam do relógio. Os donos corrigiram, e tudo passou no estado integrado.
- **Alterações:**
  - Integradas `fix/dispatch-import-map` (`backend-funcoes`: `../tasks/late` no `deno.json` do despacho, vindo da correção do QA4-4) e `fix/e2e-phase-4-close` (`qa-testes`: seletores com escopo em `[role="main"]`; o pg_cron de lembretes e de vermelho fica desligado durante a E2E por `e2e/global-setup.ts`; `notifications-jobs` roda por último, num projeto próprio; `shieldFromAutoMiss` saiu).
  - `feat/phase-3-proof` (`5b80817`, fechamento da Fase 3) trazido para esta branch.
  - `docs/agentes/QUADRO.md`: F4-1 a F4-9 feitos.
- **Migrations:** nenhuma nesta entrada.
- **Decisões/ADRs:** QA4-5 (o aviso ao vivo repete o item na própria lista de avisos, baixa) vai para `notificacoes-whatsapp` na Fase 5, com as telas do WhatsApp.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`; `bash docs/agentes/ferramentas/verificar-fase.sh <checkout> <log>`, com uma `EXPO_PUBLIC_VAPID_PUBLIC_KEY` gerada em memória no ambiente para rodar os testes de push.
- **Verificado:** primeira rodada em `e54968d`: tudo passou menos `functions:test` e as duas E2E, que pararam no preflight (`dispatch-notifications` 503, `Module not found .../core/src/tasks/late` no log do contêiner). Segunda, em `3b428b2`, completa: install, `db:start`, `db reset`, `db:test` 1227 de 1227 (antes e depois da E2E), `db:check-permissions`, `turbo typecheck test --force` (core 556, contracts 52, platform 46, ui 11, app 8, config 7, data 7, proof 6, notifications 2), lint, `boundaries`, `build:web`, `functions:test` 114 de 114; E2E 67 ok e 1 falha, depois 66 ok e 2 falhas (seletor pegando o aviso ao vivo; lembrete do cron no meio do teste). Final, em `e6f9c5a`: lint, `db reset`, E2E duas vezes com 68 ok, 0 falhas e 1 pulado (o "sem chave VAPID"), `db:test` 1227 de 1227 depois, e os 6 jobs do cron ativos de novo. Varredura de segredos no diff `feat/phase-3-proof..feat/phase-4-notifications`: só a chave demo pública da pilha local (já presente na Fase 3) e o vetor de teste da RFC 8291; os `.env.example` só têm nomes.
- **Não verificado:** push real em aparelho (Android, desktop, iPhone pela Tela de Início), registro do `sw.js` no navegador, cabeçalhos do `_headers` (só a Netlify os aplica), CI do PR, projeto hospedado.
- **Pendências / próximos passos:** PR para `feat/phase-3-proof`; perguntas ao humano da seção 4 do handoff 1505; Fase 5 em `feat/phase-5-whatsapp`.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 01:35 (BRT)

- **Branch:** feat/whatsapp-db, criada a partir de feat/phase-5-whatsapp (da2fd5d)
- **Agente(s):** banco-de-dados
- **Resumo:** Itens 1 a 10 do handoff `20261103-0030-arquiteto-para-banco-de-dados-whatsapp` (ADR-0009), com as mudanças pedidas pelo orquestrador: espelhos, `daily_summary` no enum, colunas de `profiles`, verificação de telefone, opt-in e opt-out, `whatsapp_messages` e a caixa de saída do console, status e PARAR, gravação, claim e report com WhatsApp e o prazo do vermelho, job do resumo, retenção e tipos. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - Espelhos `whatsapp_rules` e `notification_rules` (`activeChannels` com `whatsapp`, `whatsappTypes`, `defaultChannels.daily_summary`). O bloco de `whatsapp_rules` entrou em `scripts/check-permission-mirror.mjs`.
  - `profiles`: telefone, verificação, opt-in e opt-out, com `check`s de par e "sem consentimento sem telefone". As cinco `daily_summary_*` têm os padrões de `whatsappRules` e são as únicas colunas novas com `grant update`. `daily_summary_last_date` é do sistema.
  - `phone_verifications` (sem `grant`), `start_phone_verification` (só `service_role`), `confirm_phone_verification` e `remove_phone` (`authenticated`).
    - O código não é gravado: só o SHA-256 de `id:código`.
    - A confirmação devolve o erro em vez de levantar exceção, então toda tentativa conta, e a sexta falha mesmo com o código certo.
    - Limites: reenvio, por usuário e por número, em 24 horas corridas. `retryAfterSeconds` é a espera do limite que pesa mais.
  - `whatsapp_opt_in`, `whatsapp_opt_out` e `is_whatsapp_ready`, a única definição de "perfil pronto", usada pela gravação, pelo job, pelo claim e pelo PARAR.
  - `whatsapp_messages` e `whatsapp_console_messages`: RLS ligada, sem política e sem privilégio para `anon` e `authenticated`. `record_whatsapp_statuses` (o status só avança, e `failed` vale sobre qualquer um) e `whatsapp_stop_by_wa_id` (pelos dígitos do telefone ou por um `wa_id` já visto).
  - `enqueue_notification`: linha `whatsapp` só com o tipo em `whatsappTypes` e o perfil pronto. O `daily_summary` não tem ocorrência nem grupo, nasce lido e nunca vai por push.
  - `claim_notification_batch(p_limit, p_lease_seconds, p_max_delay_hours, p_channels text[] default '{web_push}')`:
    - rechecagens `whatsapp_not_ready`, `whatsapp_type_not_allowed` e `summary_empty`;
    - o resumo expira por `catchUpMinutes` e não passa pelo silêncio;
    - cada item ganha `timezone`, `overdueAt`, `occurrenceStatus`, `phone` e `summary`. A fonte vem de `daily_summary_source`, com os mesmos baldes de "Hoje" e o acesso do sino.
  - `report_notification_results` grava `whatsapp_messages` a partir de `whatsapp: { providerMessageId, waId, template, provider? }`.
  - `enqueue_daily_summaries()`, com pg_cron a cada minuto, idempotente pela coluna e pela chave. A retenção diária passa a cobrir códigos (48 h), linhas de entrega (30 dias) e o console (1 dia).
  - `supabase/tests/rls_whatsapp.test.sql` (novo, 132 testes). Em `rls_notifications` e `rls_proof`, só o que mudou: a assinatura do claim, o espelho, a forma do item e a lista de funções abertas.
  - `packages/data/src/database.types.ts` regenerado.
  - Handoffs `20261103-0135-banco-de-dados-para-backend-funcoes-rpcs-whatsapp` e `20261103-0135-banco-de-dados-para-notificacoes-whatsapp-rpcs-e-colunas`.
- **Migrations:** 20261103120000_whatsapp_rules, 20261103120100_notification_type_daily_summary, 20261103120200_profile_whatsapp, 20261103120300_whatsapp_opt_in, 20261103120400_phone_verifications, 20261103120500_whatsapp_messages, 20261103120600_enqueue_notification_whatsapp, 20261103120700_claim_whatsapp, 20261103120800_daily_summaries_job, 20261103120900_whatsapp_retention. Aplicadas só no banco local.
- **Decisões/ADRs:** nenhum ADR novo. Escolhas desta entrega:
  - `whatsapp_messages.user_id` aceita nulo só no `stop_reply`, porque o número pode estar em várias contas;
  - `provider` é opcional no report, deduzido do prefixo `console.`;
  - o fuso do perfil é conferido pela exceção do Postgres, e não por `is_valid_timezone`, que custa ~18 ms por chamada (`pg_timezone_names`): caro demais para todo perfil a cada minuto;
  - `p_channels` tem padrão `{web_push}` só para o despacho atual continuar subindo;
  - o `template` usa `char_length <= 512` e não `{1,512}`, porque a regex do Postgres para em 255 repetições.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`.
- **Verificado:**
  - `pnpm db:test`: 1359 de 1359, em 5 arquivos.
  - `pnpm db:check-permissions`: passou, com `Notification rules in sync` e `WhatsApp rules in sync`.
  - `pnpm functions:test`: 152 de 152.
  - `pnpm check`: 17 de 17 e 9 de 9.
  - `pnpm e2e`, uma vez: 67 passaram e 2 foram pulados (os de push sem chave VAPID no ambiente). Os 7 jobs do cron estavam ativos no fim.
  - Mutações, uma por barreira, todas pegas e desfeitas:
    - `grant select` em `whatsapp_messages`: 2 falhas;
    - sem o limite de tentativas: 2;
    - sem o limite de envios por usuário: 1;
    - claim sem `whatsapp_not_ready`: 1;
    - gravação sem o perfil pronto: 1;
    - status que volta: 4.
  - O cron real `enqueue-daily-summaries` rodou 8 vezes sem erro.
  - Sem o cast de `setPreference`, `tsc --noEmit` em `packages/data` passa. O arquivo não é meu e foi restaurado.
- **Não verificado:**
  - nada contra a Meta nem contra as funções novas, que ainda não existem;
  - o despacho real com `p_channels` e os campos novos;
  - o resumo perto da meia-noite com o cron parado. É perda aceita pelo ADR, e os testes evitam esse horário de propósito.
- **Pendências / próximos passos:**
  - `backend-funcoes` e `notificacoes-whatsapp`: seguir os handoffs.
  - `notificacoes-whatsapp`: tirar o cast de `setPreference`.
  - `qa-testes`: desligar também `enqueue-daily-summaries` em `e2e/global-setup.ts` quando a E2E do WhatsApp criar perfis prontos.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 01:47 (BRT)

- **Branch:** feat/whatsapp-screens, criada a partir de feat/whatsapp-db (eabbf0e)
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** Itens 4 e 5 do handoff `20261103-0030-arquiteto-para-notificacoes-whatsapp-whatsapp` (repositório e telas do WhatsApp em `/settings/notifications`) e QA4-5 (o aviso ao vivo não repete a lista em `/notifications`). E2E do fluxo escrita, não rodada. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - `packages/data/src/notifications/index.ts`: `getWhatsApp` (estado e preferências do resumo numa leitura de `profiles`, horário cortado para `HH:mm`), `setDailySummary` (as cinco `daily_summary_*`), `requestPhoneCode` (`phone-verification`; 429 e 502 voltam como o corpo do contrato, o resto lança), `confirmPhoneCode`, `whatsappOptIn`, `whatsappOptOut` e `removePhone`. Saiu o cast de `setPreference`.
  - `packages/features/notifications/src/whatsappFlow.ts` (novo, com testes): o passo da tela (`phone`, `code`, `consent`, `on`; número verificado vence um código na tela, e um aceite de versão antiga pede o aviso de novo), `secondsUntil`, `waitParts` (segundos, minutos ou horas, para cima) e `whatsappErrorKey` (código do contrato, como texto ou mensagem de erro do RPC; o resto é genérico).
  - `WhatsAppSection.tsx` (novo), no fim de `NotificationPreferencesScreen`, aparece também sem chave VAPID: número (código do país 55 por padrão, `normalizePhone`), código (`codeLength` dígitos, `one-time-code`, reenvio com contagem até `resendAt` ou `retryAfterSeconds`, trocar o número), aviso `whatsapp.consent.v<consentVersion>.*` e ativação, e, ativo, o resumo (ligado, horário, atrasadas, dias de prazo de 0 a `maxDeadlineDays`, pular dia vazio, um botão Salvar), desligar e remover o número (com confirmação).
  - `NotificationPreferencesScreen.tsx`: as chaves por canal ficam só no push. O único tipo do WhatsApp é o resumo, ligado e desligado por `daily_summary_enabled` na seção nova, para a mesma escolha não morar em dois lugares.
  - `NotificationToaster.tsx` (QA4-5): em `/notifications` o aviso não aparece, e o que estava aberto some ao entrar ou sair dela. A região `role="status"` continua montada.
  - `packages/i18n/src/pt-BR/notifications.json`: `whatsapp.intro`, `phone.countryInvalid`, `code.invalid`/`change`, `retryIn`, `wait.*`, `errors.generic`, `status.removeConfirm`, `dailySummary.days`/`save`/`saved`; saiu `code.resendIn_*`.
  - `e2e/whatsapp.spec.ts` (novo, não rodado): número inválido recusado, código lido em `whatsapp_console_messages`, código errado, confirmação, aviso e opt-in, horário do resumo pela tela, `enqueue_daily_summaries` e o despacho, o resumo na mesma tabela com o título da tarefa, a linha do sino nascida lida, desligar e remover.
- **Arquivos/módulos principais:** `packages/data/src/notifications/index.ts`, `packages/features/notifications/src/{WhatsAppSection.tsx,whatsappFlow.ts,NotificationPreferencesScreen.tsx,NotificationToaster.tsx}`, `packages/i18n/src/pt-BR/notifications.json`, `e2e/whatsapp.spec.ts`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova. A preferência `(daily_summary, whatsapp)` de `notification_preferences` não tem mais chave na tela; vale o padrão (ligada) e o liga/desliga é `daily_summary_enabled`.
- **Como testar:** `pnpm --filter @azkaban/feature-notifications exec vitest run`; `pnpm check`; com a pilha e `phone-verification` servida, `pnpm exec playwright test e2e/whatsapp.spec.ts`.
- **Verificado:** `pnpm install --frozen-lockfile`; `pnpm check` passou (17 de 17 e 9 de 9; feature-notifications 10 testes, 8 novos); `pnpm build:web` exportou.
- **Não verificado:** nada rodou contra a pilha (com o `backend-funcoes`) nem contra `phone-verification`, que ainda não existe. As telas não foram vistas no navegador (a seção precisa de sessão e de banco), nem em 375 px, nem no escuro. A E2E nova não rodou.
- **Pendências / próximos passos:** `qa-testes`: rodar e ajustar `e2e/whatsapp.spec.ts` depois do `backend-funcoes`, e desligar `enqueue-daily-summaries` em `e2e/global-setup.ts`. Texto do aviso de consentimento para o humano revisar.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 01:53 (BRT)

- **Branch:** feat/whatsapp-functions, criada a partir de feat/whatsapp-db (eabbf0e)
- **Agente(s):** backend-funcoes
- **Resumo:** Itens 2 a 5 do handoff `20261103-0030-arquiteto-para-backend-funcoes-whatsapp`, com as assinaturas do handoff `20261103-0135` e o despacho do `20261103-0050`: o canal WhatsApp no despacho, o prazo do vermelho no push, e as funções `phone-verification` e `whatsapp-webhook`, com testes contra a pilha. Nada sai para a Meta: o provedor é o `console`. Hora derivada de UTC menos 3 (PowerShell barrado no worktree).
- **Alterações:**
  - `dispatch-notifications`:
    - reivindica só os canais que a execução sabe enviar (`p_channels`): `web_push` só com VAPID, `whatsapp` quando os segredos passam em `parseWhatsAppEnv` (sempre, com `console`). Sem VAPID, os push ficam `pending` sem tentativa gasta, e a resposta é 200. 500 `channels_not_configured` só sem canal nenhum;
    - `itemSchema` com `timezone`, `overdueAt`, `occurrenceStatus`, `phone` e `summary` (pelo contrato), e uma linha `whatsapp` sem telefone, ou um resumo sem fonte, é `invalid_item`;
    - `render` do push repassa os três campos e o `late` de `buildPushPayload`, com `taskRules.lateCompletionWindowHours`;
    - `WhatsAppChannel` em `dispatch.ts`: monta o resumo com `buildDailySummary` (core), o template `whatsappDefaults.templates.dailySummary` e o idioma de `templateLanguages`, e o `sent` leva `whatsapp: { providerMessageId, waId, template, provider }` ao report.
  - **Decisão: provedor que lança** (só o `ConsoleProvider`, quando o `insert` em `whatsapp_console_messages` falha) é `retry` com `wa_provider_error`, pelo backoff e `maxAttempts` de sempre: nada chegou a ninguém, e repetir não duplica. Falha de montagem continua `failed` com `send_error`. Na `phone-verification`, é 502 `whatsapp_send_failed`.
  - `phone-verification` (nova, `verify_jwt = true`): usuário pelo Auth, corpo até 1 KiB, `phoneVerificationRequestSchema`, `start_phone_verification` com service role, envio `code` (`phone_code_v1`), linha `phone_code` em `whatsapp_messages`; 200, 400, 401, 429 e 502. O log tem só evento, provedor e código de erro.
  - `whatsapp-webhook` (nova, `verify_jwt = false`): `GET` por `challengeAnswer`; `POST` com 500 sem segredo, `readLimited` até 1 MiB (413), HMAC dos bytes brutos (401), assinado e inválido é 200, filtro por `phone_number_id` só com `meta`, `record_whatsapp_statuses`, `whatsapp_stop_by_wa_id` e a confirmação `text` (`whatsapp.stopReply`) por tentativa única, só quando algum perfil mudou; linha `stop_reply` sem `user_id`. Erro do banco é 500, para a Meta repetir.
  - `_shared/contracts.ts` (o `@azkaban/contracts` das funções que carregam WhatsApp) e `_shared/whatsapp/runtime.ts` (segredos e provedor, com a escrita do console pela service role). `deno.json` do despacho com as chaves do grafo novo; das duas funções novas, com as do contrato.
  - `.env.example`: valores `local-demo-*` só para `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`, comentados, como aprovado pelo orquestrador; o comentário do VAPID diz o comportamento novo.
  - Testes: `push.test.ts` (3 do canal), `dispatch.integration.test.ts` (o caso "sem VAPID dá 500" virou "sem VAPID o push espera e o resumo sai pelo despacho servido, com o `ConsoleProvider`"), `phone-verification/verification.integration.test.ts` (4) e `whatsapp-webhook/webhook.integration.test.ts` (6), no `functions:test`; as duas funções no `wait-for-functions.mjs`.
  - Handoffs `20261103-0153-backend-funcoes-para-arquiteto-implantacao-whatsapp` e `20261103-0153-backend-funcoes-para-notificacoes-whatsapp-phone-verification`.
- **Arquivos/módulos principais:** `supabase/functions/{dispatch-notifications,phone-verification,whatsapp-webhook}/*`, `supabase/functions/_shared/{contracts.ts,whatsapp/runtime.ts,wait-for-functions.mjs}`, `supabase/functions/.env.example`, `supabase/config.toml`, `package.json`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** a do provedor que lança, acima. Idioma do código de verificação: o primeiro de `templateLanguages` (há um só). A confirmação do PARAR é em pt-BR, porque o número pode estar em contas de idiomas diferentes.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm functions:test`.
- **Verificado:**
  - `pnpm functions:test`: 167 de 167, com a pilha recém-resetada.
  - `pnpm db:test`: 1359 de 1359. `pnpm check`: passou (17 de 17 e 9 de 9 tarefas).
  - `_shared/import-maps.test.ts` verde para as sete funções; as três tocadas responderam 204 no preflight logo depois do `db:start`.
  - Mutações, desfeitas: assinatura ignorada no webhook servido derruba "a POST passes only with the HMAC" (1 falha); a checagem do JWT tirada da `phone-verification` derruba "only a signed-in user may ask" (1); o PARAR por substring derruba 2 testes de unidade e o de integração do PARAR (3).
  - O log da função tem só `whatsapp_console`, `phone_verification_*` e contagens; nenhum telefone nem código.
- **Não verificado:** a E2E (fica com o QA da fase); nada contra a Meta; o `MetaCloudProvider` dentro do Edge Runtime; o código das funções não passa por `tsc` (o `supabase/` está fora do typecheck e do ESLint, como antes).
- **Pendências / próximos passos:** os dois handoffs. `qa-testes`: o resumo pela E2E lê `whatsapp_console_messages`; perfis prontos na E2E pedem `enqueue-daily-summaries` desligado (já apontado pelo `banco-de-dados`).

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 01:58 (BRT)

- **Branch:** chore/security-phase-5, criada a partir de feat/phase-5-whatsapp (9f88a68)
- **Agente(s):** revisor-seguranca
- **Resumo:** Primeira passada da revisão de segurança da Fase 5 (WhatsApp), sem pilha: as 10 migrations, contratos e config, provedores e peças do webhook, core, repositório e telas. Oito achados, SEG5-1 a SEG5-8: um médio, o resto baixo. `WhatsAppChannel`, `phone-verification` e `whatsapp-webhook` ficam para a segunda passada. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - Handoffs `20261103-0158-revisor-seguranca-para-{banco-de-dados,backend-funcoes,notificacoes-whatsapp,arquiteto}-whatsapp`.
  - SEG5-1 (média, `banco-de-dados`): `whatsapp_stop_by_wa_id` casa qualquer `recipient_wa_id` já visto do usuário, então o PARAR de um número digitado errado (linha `phone_code`) ou antigo desliga quem já usa outro número.
  - SEG5-2 (baixa, `backend-funcoes`): `normalizeReply` não tira U+200B, U+200E, ZWJ nem largura total, e esses PARAR não param.
  - SEG5-3 (baixa, `backend-funcoes` e `arquiteto`): o schema do webhook é tudo ou nada, e um elemento fora do formato descarta o lote com os PARAR.
  - SEG5-4 (baixa, média com F8-3, `banco-de-dados`): `phone_verifications` em cascata zera o limite por número quando a conta é excluída.
  - SEG5-5 (baixa, `arquiteto`): sem teto global de envios pagos nem lista de países.
  - SEG5-6 (baixa, `notificacoes-whatsapp` e `arquiteto`): controle bidirecional e URL de títulos de outra pessoa chegam pelo número da empresa.
  - SEG5-7 (baixa, `arquiteto`): o aviso v1 não cita contextos, a remoção do número nem a política; a exportação de F8-3 não cita `phone_verifications`.
  - SEG5-8 (baixa, preventivo, `arquiteto` e `backend-funcoes`): nada recusa um segredo `local-demo-` em produção.
- **Arquivos/módulos principais:** `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma; sugerida uma seção "Revisão de segurança da Fase 5" no ADR-0009.
- **Como testar:** os PoCs de banco listados em cada handoff, com a pilha.
- **Verificado:** `pnpm install --frozen-lockfile`. PoCs em Node puro contra os módulos reais: `isStop` com 13 entradas (4 falsos negativos) e a normalização proposta (8 de 8); `validSignature` com bytes brutos, JSON reserializado, segredo errado, hex maiúsculo e sem cabeçalho; `challengeAnswer` com desafio válido, tag HTML e token não configurado; o regex de `whatsappTextParamSchema` e `cleanParam` com RLO e URL; `normalizePhone` com prefixo `00`. Varredura de segredos no diff: só valores de teste; `.env.example` só com nomes.
- **Não verificado:** nada rodou no banco (pilha com o `backend-funcoes`), nem `pnpm check` nesta branch (só documentação mudou), nem as telas no navegador. O `WhatsAppChannel`, `phone-verification`, `whatsapp-webhook` e o `verify_jwt` ainda não estavam integrados.
- **Pendências / próximos passos:** segunda passada com a pilha: PoC do SEG5-1, `confirm_phone_verification` por `GET` e com `Prefer: tx=rollback`, confirmações concorrentes, SEG5-4 apagando o usuário, acesso de `anon` e `authenticated` às três tabelas pela REST, colunas de outro perfil por embed, publicação do Realtime, e as três funções (JWT, limites de corpo, assinatura, logs do contêiner sem telefone, código, `wa_id` ou título).

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 01:59 (BRT)

- **Branch:** docs/whatsapp-deploy, criada a partir de feat/phase-5-whatsapp (e140adc)
- **Agente(s):** arquiteto
- **Resumo:** Handoff `20261103-0153-backend-funcoes-para-arquiteto-implantacao-whatsapp`: implantação do WhatsApp em `docs/implantacao.md` e as diferenças da implementação no ADR-0009. A guarda dos imports das funções passa a rodar no `pnpm check`, sem pilha. O script do espelho de permissões deriva o contêiner do `project_id`. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - `docs/implantacao.md`: sem VAPID, o despacho não reivindica push e responde 200; o 500 é `channels_not_configured`, só sem canal nenhum, e um `VAPID_SUBJECT` inválido conta como par ausente. Tabela dos segredos `WHATSAPP_*`, `supabase secrets set` dos dois aleatórios, deploy de `phone-verification` e `whatsapp-webhook`, `verify_jwt` das duas, URL do webhook com o campo `messages`, e a seção 7 "Antes de ligar a Meta", que remete ao ADR-0009, seção 10, com as consultas de conferência.
  - ADR-0009, seção 17 nova (diferenças da implementação, como a 17 do ADR-0008): provedor que lança vira `retry` com `wa_provider_error`, e montagem que falha continua `failed` com `send_error`; a tela não mostra o WhatsApp na lista de tipos, e o resumo é ligado só por `daily_summary_enabled`, com `(daily_summary, whatsapp)` no padrão (um segundo tipo traz a lista de volta); o resumo nunca vai por push, porque `internalPathSchema` recusa `/` sozinho. As seções 2, 5, 13 e as Consequências remetem para ela.
  - `package.json`: script `functions:imports` (`node --test` de `_shared/import-maps.test.ts`), no fim de `check`. Roda sem Docker; o CI já roda `pnpm check`.
  - `scripts/check-permission-mirror.mjs`: o contêiner é `supabase_db_<project_id>` de `supabase/config.toml` do próprio checkout, com `DB_CONTAINER` valendo sobre isso, e o nome sai na primeira linha. Motivo: a pilha B (`docs/agentes/ferramentas/pilha-b.sh`) troca o `project_id` na cópia de trabalho, e nada rodado nela pode tocar a pilha A.
- **Arquivos/módulos principais:** `docs/implantacao.md`, `docs/adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md`, `package.json`, `scripts/check-permission-mirror.mjs`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** ADR-0009, seção 17.
- **Como testar:** `pnpm check`; `pnpm functions:imports` sozinho; `node scripts/check-permission-mirror.mjs` mostra `Container: supabase_db_azkaban` com o config normal.
- **Verificado:** `pnpm check` passou (17 de 17 e 9 de 9 tarefas; `functions:imports` 8 de 8). Mutação: sem a chave de `tasks/late` no `deno.json` do despacho, `pnpm check` falha em "dispatch-notifications: every runtime import resolves through deno.json" (7 de 8), desfeita. O script do espelho imprimiu `Container: supabase_db_azkaban`, e `Container: x` com `DB_CONTAINER=x`. A primeira execução achou a pilha A de pé e fez os `select` de leitura (matriz em dia, 23 linhas); nada foi escrito.
- **Não verificado:** o hook de pre-commit não roda o `check` (só `lint-staged`), então a guarda pega no CI e no `pnpm check`, não no commit. O texto da implantação não foi executado contra o projeto hospedado.
- **Pendências / próximos passos:** nenhuma minha.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:07 (BRT)

- **Branch:** docs/whatsapp-deploy, com `feat/phase-5-whatsapp` mesclada (5ed013c)
- **Agente(s):** arquiteto
- **Resumo:** Decisões sobre a primeira passada da revisão de segurança da Fase 5 (handoff `20261103-0158-revisor-seguranca-para-arquiteto-whatsapp`), no ADR-0009, seção 18, com a parte de contrato e config feita e um handoff para cada dono. Hora derivada de UTC menos 3.
- **Alterações:**
  - `packages/contracts/src/whatsapp.ts`: `whatsappWebhookStatusSchema` e `whatsappWebhookMessageSchema` exportados, e `whatsappWebhookSchema` com `statuses` e `messages` como `unknown[]` (SEG5-3). `whatsappTextParamSchema` recusa U+202A a U+202E e U+2066 a U+2069 (SEG5-6). `phone_country_not_allowed` em `whatsappErrorCodeSchema` (SEG5-5).
  - `packages/config/src/whatsapp.ts`: `verification.maxSendsPerDay = 200` e `verification.allowedCountryCodes = ['55']` (SEG5-5), padrões a confirmar pelo humano.
  - `packages/config/src/whatsapp-env.ts`: com `meta`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` que começam com `local-demo-` são recusados (SEG5-8).
  - ADR-0009: seção 18 nova com SEG5-1 a SEG5-8. O PARAR busca só pelo número atual, com a regra do nono dígito. O PARAR com caractere invisível passa a parar. O limite por número sobrevive à exclusão. O teto global e a lista de países ficaram como padrão. A URL no resumo é aceita e registrada, sem controle bidirecional. O aviso v1 muda sem `v2`. As seções 3, 4, 7, 11, 13 e 16 (itens 13 e 14) remetem para ela.
  - Handoffs `20261103-0206-arquiteto-para-{backend-funcoes,banco-de-dados,notificacoes-whatsapp}-seguranca-whatsapp`.
  - Merge de `feat/phase-5-whatsapp`, com o conflito do LOG resolvido mantendo as duas entradas em ordem de data.
- **Arquivos/módulos principais:** `packages/contracts/src/whatsapp.ts` e o teste, `packages/config/src/{whatsapp.ts,whatsapp-env.ts,env.test.ts}`, `docs/adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma; a do espelho é do `banco-de-dados`.
- **Decisões/ADRs:** ADR-0009, seção 18.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passou (17 de 17 e 9 de 9 tarefas; `functions:imports` 8 de 8). Contratos: 92 testes, com 3 novos (lote com um elemento inválido, dois controles bidirecionais). Config: o teste novo de `local-demo-` com `meta`, e a aceitação com `console`.
- **Não verificado:** nada com a pilha. `pnpm db:check-permissions` vai acusar `whatsapp_rules` até a migration. O `whatsapp-webhook` ainda lê os elementos sem validá-los, até o `backend-funcoes` seguir o handoff. Até o `notificacoes-whatsapp` mudar `cleanParam`, um título com RLO faz o resumo falhar com `send_error`.
- **Pendências / próximos passos:** os três handoffs. Para o humano: SEG5-5 (países e teto), a URL do SEG5-6 e o texto do aviso.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:11 (BRT)

- **Branch:** chore/qa-phase-5, criada a partir de feat/phase-5-whatsapp (e140adc)
- **Agente(s):** qa-testes
- **Resumo:** QA da Fase 5 no estado integrado. `e2e/whatsapp.spec.ts` rodou pela primeira vez e passou a cobrir o fluxo crítico inteiro do resumo diário com o `ConsoleProvider`, inclusive o PARAR pelo webhook assinado; um segundo teste percorre as telas do WhatsApp a 320, 375 e 1280 px, claro e escuro, com os erros do contrato. Três achados de uso para o `notificacoes-whatsapp`, nenhum bloqueio. Hora derivada de UTC menos 3 (PowerShell barrado no worktree).
- **Alterações:**
  - `e2e/global-setup.ts`: desliga também `enqueue-daily-summaries` durante a suíte; e recusa rodar, com erro em português, se o `project_id` de `supabase/config.toml` não for `azkaban` (com a pilha B de `docs/agentes/ferramentas/pilha-b.sh` ligada no checkout, a suíte falaria com a A pela porta 8091 e pelo `.env.development.local`).
  - `e2e/whatsapp.spec.ts`: o perfil vai para um fuso longe da meia-noite (São Paulo ou Tóquio, 12 h de diferença), para o resumo no minuto atual e a tarefa de daqui a um minuto ficarem no mesmo dia local; o resumo não aparece no aviso ao vivo e aparece no sino como "Resumo do dia"; PARAR pelo `whatsapp-webhook` assinado com o segredo local de demonstração grava o opt-out `webhook` e a confirmação na caixa de saída; religar só pelo app; desligar pelo app grava `app`. Teste novo: número inválido, contagem regressiva que anda, código incompleto, código expirado (validade recuada pela service role), 429 do reenvio depois de recarregar, aviso e opt-in; em cada passo, sem rolagem lateral, controles da tela com 44 px ou mais, texto sem corte e foco visível por teclado; nenhum telefone em URL pedida pela página; `title` da tela.
  - `e2e/notifications-jobs.spec.ts`: QA4-5 conferido na E2E (em `/notifications`, um lembrete novo entra na lista e o aviso ao vivo fica vazio).
  - Handoff `20261103-0210-qa-testes-para-notificacoes-whatsapp-achados-da-fase-5` (QA5-1 média: a tela do código some ao recarregar e o reenvio fica travado por 60 s; QA5-2 baixa: o 429 do reenvio diz "Muitos códigos pedidos"; QA5-3 baixa: o número aparece cru em E.164).
- **Arquivos/módulos principais:** `e2e/global-setup.ts`, `e2e/whatsapp.spec.ts`, `e2e/notifications-jobs.spec.ts`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma.
- **Como testar:** copiar `supabase/functions/.env.example` para `supabase/functions/.env`, `pnpm db:start`, `pnpm exec supabase db reset`, `pnpm e2e` (com uma chave pública VAPID no ambiente, rodam os testes de push).
- **Verificado:** `whatsapp.spec.ts` 2 de 2; `notifications-jobs` com `--no-deps` 4 de 4. `pnpm e2e` completo uma vez, banco limpo, com a chave VAPID gerada em memória e passada só ao processo: 70 passaram, 1 pulado (o "sem chave"), nenhuma falha. Os 7 jobs de `cron.job` ativos depois. `pnpm check` passou (17 de 17 e 9 de 9).
- **Não verificado:** contraste medido (só visto em captura); leitor de tela; Safari e iPhone de verdade (o QA5-1 foi reproduzido com `page.reload()`); o 429 do limite de 24 h e o 502 do provedor pela tela; a Meta. O erro da pilha B no `global-setup` só foi conferido na expressão, não com o `config.toml` trocado.
- **Pendências / próximos passos:** QA5-1 a QA5-3, pelo handoff. `QUADRO.md`: F5-1 a F5-6 ainda "a fazer", e o F5-5 diz `backend-funcoes`, mas o job do resumo é SQL do `banco-de-dados` (ADR-0009, seção 5); é do orquestrador.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:15 (BRT)

- **Branch:** fix/whatsapp-db-security, criada a partir de feat/phase-5-whatsapp (5ed013c), com o merge de feat/phase-5-whatsapp (d66b135)
- **Agente(s):** banco-de-dados
- **Resumo:** SEG5-1 e SEG5-4 do handoff `20261103-0158-revisor-seguranca-para-banco-de-dados-whatsapp` (opção do nono dígito, confirmada no ADR-0009, seção 18) e SEG5-5 do handoff `20261103-0206-arquiteto-para-banco-de-dados-seguranca-whatsapp`. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - SEG5-1: `whatsapp_stop_by_wa_id` casa o `wa_id` só com o telefone atual do perfil pronto: os mesmos dígitos ou a variante do nono dígito do Brasil (`55` + DDD + 8 ↔ `55` + DDD + `9` + 8), com os dois lados dobrados para 8 dígitos. Outros países, só igualdade. Saiu a busca pelo histórico de `recipient_wa_id`, e o índice `whatsapp_messages_wa_id_idx`, que só ela lia. Contas com o mesmo número continuam parando juntas.
  - SEG5-4: `phone_verifications.user_id` anulável, `on delete set null`. Excluir a conta não zera mais o limite por número; as linhas somem pela retenção de 48 h.
  - SEG5-5: espelho `whatsapp_rules.verification` com `maxSendsPerDay = 200` e `allowedCountryCodes = ["55"]`. `start_phone_verification` devolve `phone_country_not_allowed` para outro país, sem gravar linha, e `phone_rate_limited` no teto global, contando as linhas sem `user_id`. Um só lock consultivo para toda verificação substitui o lock por número, para duas chamadas não passarem juntas pelo teto.
  - `rls_whatsapp.test.sql`: 15 testes novos (132 para 147). O teste antigo do nono dígito passa sem a linha em `whatsapp_messages`.
  - `packages/data/src/database.types.ts` regenerado (`phone_verifications.user_id: string | null`).
- **Arquivos/módulos principais:** `supabase/migrations/`, `supabase/tests/rls_whatsapp.test.sql`, `packages/data/src/database.types.ts`
- **Migrations:** 20261103150000_whatsapp_stop_current_phone, 20261103150100_phone_verifications_survive_account, 20261103150200_phone_verification_country_and_cap. Aplicadas só na pilha B local.
- **Decisões/ADRs:** nenhuma nova; segue o ADR-0009, seção 18. A variante do nono dígito vale para qualquer número de 9 dígitos que comece com 9, como pedido, inclusive um fixo de 8 dígitos com um 9 na frente.
- **Como testar:** `bash docs/agentes/ferramentas/pilha-b.sh db`, `pnpm exec supabase db reset`, `pnpm db:test`, `pnpm db:check-permissions`, `bash docs/agentes/ferramentas/pilha-b.sh parar`.
- **Verificado:**
  - `pnpm db:test`: 1374 de 1374, em 5 arquivos (`rls_whatsapp` 147 de 147).
  - `pnpm db:check-permissions` na pilha B (`Container: supabase_db_azkaban-b`): tudo em dia, com `WhatsApp rules in sync`.
  - `pnpm check`: 17 de 17 e 9 de 9, depois do merge.
  - Mutações, desfeitas: a busca pelo histórico de volta derruba 4 testes; o `on delete cascade` de volta, 2; sem o teto global, 1.
  - Tudo na pilha B só com o Postgres; a pilha A não foi tocada, e a B foi parada no fim com o `config.toml` devolvido.
- **Não verificado:** `pnpm functions:test` (a B `db` não tem Edge Runtime; o teste do webhook usa `wa_id` igual aos dígitos do telefone) e a E2E. Até o `backend-funcoes` seguir o handoff 0206, a `phone-verification` não conhece `phone_country_not_allowed`.
- **Pendências / próximos passos:** `backend-funcoes`: 400 para `phone_country_not_allowed`. Comentário de `whatsapp_messages` ainda diz que `recipient_wa_id` serve ao PARAR; fica como registro da entrega (migration integrada, não editada).

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:17 (BRT)

- **Branch:** fix/whatsapp-client-security, criada a partir de feat/phase-5-whatsapp (d66b135), com `feat/phase-5-whatsapp` mesclada depois para trazer o handoff do QA
- **Agente(s):** notificacoes-whatsapp
- **Resumo:** A parte do cliente das decisões da revisão de segurança da Fase 5 (ADR-0009, seção 18: SEG5-5, SEG5-6, SEG5-7 e o `00` do revisor) e os achados QA5-1 a QA5-3 do handoff `20261103-0210-qa-testes-para-notificacoes-whatsapp-achados-da-fase-5`. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - `cleanParam` tira `\p{Cf}` (controles bidirecionais, largura zero, BOM, marcas LRM e RLM), exceto U+200D, que une os emojis compostos. Testes com U+202A a U+202E, U+2066 a U+2069, U+200B, U+200E, U+200F, U+FEFF, U+2060, e um emoji com ZWJ inteiro; a saída passa no `whatsappTextParamSchema`.
  - `normalizePhone` lê o `00` do começo como `+`: `0055 11 98765-4321` dá `+5511987654321`.
  - `formatPhone` em core (QA5-3): `+55 11 91705-8802`, fixo `+55 11 3333-4444`, outro país como está. Usado na dica do código, no aviso e em "Ativo para".
  - Aviso v1 (SEG5-7): `what` cita as áreas e os contextos; chave nova `phone`, mostrada na tela do aviso. Continua v1.
  - `whatsapp.errors.phone_country_not_allowed` ("Por enquanto, só números do Brasil (+55)."). O formulário recusa, antes de pedir, um país fora de `allowedCountryCodes`, no campo ou como `+`/`00` no número, e o campo do país mostra esse texto; `whatsapp.phone.countryInvalid` saiu. Teste: todo código de `whatsappErrorCodeSchema` tem texto próprio.
  - QA5-2: `phone_rate_limited` com `retryAfterSeconds` até `resendSeconds` diz "Espere um pouco para pedir outro código." (`whatsapp.errors.phone_resend_wait`), com a contagem embaixo; o limite de 24 horas continua "Muitos códigos pedidos".
  - QA5-1: o passo do código fica na sessão da aba: `{ userId, phone, expiresAt, resendAt }` em `azkaban.whatsapp.pendingCode`, nunca o código. Restaurado só para o mesmo usuário e com o código vivo; apagado ao confirmar e ao trocar o número. Adapter novo em `packages/platform`: `readSessionValue` e `writeSessionValue` (`sessionStorage` na web, memória no nativo).
  - `e2e/whatsapp.spec.ts`: número formatado nos três textos; recarga na tela do código esperando o campo, a dica e o reenvio travado; o 429 do reenvio a partir de uma aba limpa, com o texto novo.
- **Arquivos/módulos principais:** `packages/core/src/notifications/whatsapp.ts` e o teste, `packages/core/src/index.ts`, `packages/features/notifications/src/{WhatsAppSection.tsx,whatsappFlow.ts,whatsappFlow.test.ts}`, `packages/platform/src/{sessionValue.ts,sessionValue.web.ts,index.ts}`, `packages/i18n/src/pt-BR/notifications.json`, `e2e/whatsapp.spec.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma nova. Um só texto de erro no campo do país enquanto só o Brasil é permitido; com outro país na lista, o texto e o campo precisam mudar.
- **Como testar:** `pnpm check`; com a pilha, `pnpm exec playwright test e2e/whatsapp.spec.ts --project app`.
- **Verificado:** `pnpm check` passou (17 de 17 e 9 de 9 tarefas; core 605 testes, feature-notifications 17, platform 46; `functions:imports` 8 de 8).
- **Não verificado:** a E2E não rodou (sem pilha); as mudanças da spec foram escritas sem execução. O `cleanParam` novo dentro do Deno do despacho (o regex com `\p{Cf}` e lookahead é padrão). A tela não foi vista no navegador. iOS e Android.
- **Pendências / próximos passos:** o texto do aviso continua a confirmar pelo humano. A bandeira da Inglaterra e as outras de subdivisão usam caracteres de tag (`\p{Cf}`) e viram a bandeira preta no resumo.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:18 (BRT)

- **Branch:** chore/functions-stack-from-config, criada a partir de feat/phase-5-whatsapp (88c3749), com merge de feat/phase-5-whatsapp (d66b135)
- **Agente(s):** backend-funcoes
- **Resumo:** Os testes das funções acham a pilha pelo `supabase/config.toml` do checkout, e não mais por padrões fixos da pilha A. Também SEG5-2, SEG5-3 e SEG5-5 do handoff `20261103-0206-arquiteto-para-backend-funcoes-seguranca-whatsapp`, e o `phone_number_id` sempre passado ao webhook (handoff `20261103-0158-revisor-seguranca-para-backend-funcoes-whatsapp`). Hora derivada de UTC menos 3 (PowerShell barrado no worktree).
- **Alterações:**
  - `_shared/local-stack.mjs` (novo): lê o `project_id` e o `port` de `[api]` e exporta `apiUrl`, `project` e `dbContainer` (`supabase_db_<project>`). `SUPABASE_URL`, `COMPOSE_PROJECT` e `DB_CONTAINER` continuam valendo; sem `DB_CONTAINER`, o contêiner segue o `COMPOSE_PROJECT`. Um config sem as duas chaves lança erro, sem adivinhar.
  - `proof-kit.ts`, `wait-for-functions.mjs` (inclusive a mensagem de erro) e os testes de `dispatch`, `materialize`, `proof-url` e `proof-validate` usam o módulo. Os comentários que citavam `supabase_edge_runtime_azkaban` dizem `<project_id>`.
  - `_shared/local-stack.test.ts` (novo, no `functions:test`): o config commitado dá `http://127.0.0.1:54421`, `azkaban` e `supabase_db_azkaban`; com as mesmas trocas de `pilha-b.sh` dá `54521`, `azkaban-b` e `supabase_db_azkaban-b`; só o `port` de `[api]` conta; CRLF; o ambiente vence. Passa também num checkout com a B ligada.
  - SEG5-2: `normalizeReply` com `NFKD` e `\p{Cf}`.
  - SEG5-3: `readWebhook` recebe os schemas de elemento do contrato e valida cada status e mensagem com `safeParse`; o inválido soma em `ignored`. `webhook.test.ts` carrega os schemas reais do contrato com `registerHooks`, porque os arquivos dele se importam sem extensão.
  - SEG5-5: `phone-verification` responde 400 `{ error: 'phone_country_not_allowed' }` sem enviar nada.
  - `whatsapp-webhook`: `WHATSAPP_PHONE_NUMBER_ID` filtra sempre que existe, com qualquer provedor. É lido do ambiente, porque a variante `console` de `parseWhatsAppEnv` descarta a chave.
- **Arquivos/módulos principais:** `supabase/functions/_shared/{local-stack.mjs,local-stack.test.ts,proof-kit.ts,wait-for-functions.mjs,whatsapp/webhook.ts,whatsapp/webhook.test.ts}`, `supabase/functions/{whatsapp-webhook,phone-verification}/*`, testes de integração de `dispatch`, `materialize`, `proof-url` e `proof-validate`, `package.json`, um comentário em `supabase/config.toml`
- **Migrations:** nenhuma.
- **Decisões/ADRs:** nenhuma nova.
- **Como testar:** `node --test supabase/functions/_shared/local-stack.test.ts supabase/functions/_shared/whatsapp/webhook.test.ts`; `pnpm db:start`, `pnpm exec supabase db reset` e `pnpm functions:test` sem exportar nada; `pnpm check`.
- **Verificado:**
  - `pnpm functions:test` na pilha A, sem variáveis, depois de `db reset`: 175 de 176. A única falha é o teste novo do país (200 em vez de 400), porque a migration do `banco-de-dados` ainda não foi integrada. Depois, o teste novo de SEG5-3 do webhook rodou contra a função servida: 7 de 7 no arquivo.
  - `node --test` de `local-stack`, `import-maps` e `webhook`: 30 de 30. `pnpm check` passou (17 de 17 e 9 de 9).
  - Mutações, desfeitas: a validação do lote inteiro de volta em `readWebhook` derruba o teste de SEG5-3 (1 falha); `NFD` no lugar de `NFKD` derruba o de SEG5-2 (1 falha).
- **Não verificado:** a prova na pilha B, que o orquestrador trocou pela A (a B estava com o `banco-de-dados`); o lado B só está no teste de unidade, com o config de exemplo. `phone_country_not_allowed` contra a migration real. A suíte completa não rodou de novo depois do teste de SEG5-3.
- **Pendências / próximos passos:** a verificação final com a migration do `banco-de-dados` (teste "a number of another country is 400 phone_country_not_allowed"). Para o `arquiteto`, se quiser: a variante `console` de `whatsappEnvSchema` poderia aceitar `WHATSAPP_PHONE_NUMBER_ID` opcional, e a função deixaria de ler o ambiente direto.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:28 (BRT)

- **Branch:** chore/security-phase-5, com feat/phase-5-whatsapp (b2f3e50) integrada
- **Agente(s):** revisor-seguranca
- **Resumo:** Segunda passada da revisão de segurança da Fase 5, na pilha B. SEG5-1, SEG5-4 e SEG5-5 fecharam no banco. Dois achados novos, ambos baixos: SEG5-9 (a dobra do nono dígito junta um celular e um fixo vizinhos) e SEG5-10 (o país recusado vira 500 em `phone-verification`). Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - Handoffs `20261103-0226-revisor-seguranca-para-banco-de-dados-nono-digito` (SEG5-9) e `20261103-0226-revisor-seguranca-para-backend-funcoes-pais-e-webhook` (SEG5-10 e o estado intermediário do SEG5-3).
- **Arquivos/módulos principais:** `docs/agentes/handoffs/`
- **Migrations:** nenhuma
- **Decisões/ADRs:** nenhuma.
- **Como testar:** `bash docs/agentes/ferramentas/pilha-b.sh funcoes`, `pnpm exec supabase db reset`, e os PoCs descritos nos handoffs.
- **Verificado (pilha B, banco limpo):**
  - SEG5-1: o `wa_id` de uma linha `phone_code` de outro número muda 0; o `wa_id` sem o nono dígito do número atual muda 1.
  - SEG5-4: a linha sobrevive à exclusão da conta com `user_id` nulo; cinco contas criadas e apagadas mandando para o mesmo número, e a sexta recebe `phone_rate_limited` (86400 s).
  - SEG5-5: `+1` dá `phone_country_not_allowed` no banco; com 200 linhas no dia, a próxima recebe `phone_rate_limited`.
  - Confirmação: por `GET` falha na transação somente leitura antes de comparar (tentativas continuam 0); com `Prefer: tx=rollback`, a preferência é ignorada e a tentativa conta; 10 tentativas em paralelo contam exatamente 5 (4 `invalid` e 6 `expired`), e o código certo depois disso dá `expired`.
  - Acesso: `anon` e `authenticated` recebem 42501 nas três tabelas; `profiles` de outro membro sai nulo no embed por `group_members`; `group_member_profiles` só com nome, papel e data; `PATCH` em telefone, opt-in, opt-out e `daily_summary_last_date`, 42501; seis RPCs internas, 42501; só `notifications` na publicação do Realtime.
  - `phone-verification`, `whatsapp-webhook` e o despacho: os resultados estão no handoff do `backend-funcoes`. O log do Edge Runtime não tem telefone, código, `wa_id` nem texto.
- **Não verificado:** E2E (proibida na pilha B), `db:test` e `functions:test` completos, navegador, Meta real e projeto hospedado. SEG5-2, SEG5-3 e SEG5-6 não foram reabertos (em andamento), mas o estado integrado do webhook responde 500 a elemento inválido, registrado no handoff.
- **Pendências / próximos passos:** SEG5-9 com o `banco-de-dados`, SEG5-10 com o `backend-funcoes`. Pilha B parada, `config.toml` restaurado.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:32 (BRT)

- **Branch:** fix/whatsapp-ninth-digit, criada a partir de feat/phase-5-whatsapp (7b5cceb)
- **Agente(s):** banco-de-dados
- **Resumo:** SEG5-9 do handoff `20261103-0226-revisor-seguranca-para-banco-de-dados-nono-digito`. A dobra do nono dígito de `whatsapp_stop_by_wa_id` juntava um celular e um fixo com os mesmos oito dígitos finais. Hora derivada de UTC menos 3 (PowerShell barrado no worktree).
- **Alterações:**
  - `whatsapp_stop_by_wa_id` só tira o `9` depois do DDD quando o dígito seguinte é de 6 a 9, nos dois lados (`'^(55[0-9]{2})9([6-9][0-9]{7})$'`). Fixos começam com 2 a 5 e o `wa_id` sem o nono dígito só existe para celulares antigos, que começavam com 6 a 9. Grants preservados pelo `create or replace`.
  - `rls_whatsapp.test.sql` (147 para 151): Bia com o fixo `+551133334444` não é parada por `5511933334444`; Caio com o celular `+5511922223333` não é parado por `551122223333`; os dois continuam prontos; cada um para com os próprios dígitos.
- **Arquivos/módulos principais:** `supabase/migrations/20261103160000_whatsapp_stop_ninth_digit_mobile_only.sql`, `supabase/tests/rls_whatsapp.test.sql`
- **Migrations:** `20261103160000_whatsapp_stop_ninth_digit_mobile_only.sql`
- **Decisões/ADRs:** nenhuma nova. A seção 18 do ADR-0009 cita o padrão antigo; o `arquiteto` ajusta o texto (já dito no handoff do revisor).
- **Como testar:** `pnpm exec supabase db reset` e `pnpm db:test`.
- **Verificado:** na pilha B (só Postgres, `supabase_db_azkaban-b`): `db reset`, `pnpm db:test` com 5 arquivos e 1378 testes, todos passando; os de SEG5-1 seguem iguais. `pnpm db:check-permissions` em sincronia. `pnpm check` passou (17 de 17 e 9 de 9). Mutação, desfeita: a regex antiga aplicada no banco derruba os 4 testes novos (102 a 105); restaurada, 151 de 151.
- **Não verificado:** o webhook servido contra a função nova (sem E2E nem `functions:test`, por pedido do orquestrador).
- **Pendências / próximos passos:** o texto do ADR-0009, seção 18, com o `arquiteto`.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:33 (BRT)

- **Branch:** docs/shopping-adr, criada a partir de feat/phase-5-whatsapp (cd98617)
- **Agente(s):** arquiteto
- **Resumo:** F7-1, parte de arquitetura: ADR-0011 da lista de compras, contratos, regras, seed do catálogo, espelho no `check-permission-mirror` e handoffs para `banco-de-dados`, `compras` e `auth-grupos`. Hora derivada de UTC menos 3, porque o PowerShell foi barrado no worktree.
- **Alterações:**
  - ADR-0011: dois escopos (grupo e pessoal) para lista e catálogo; catálogo pessoal copiado do mesmo seed; item como cópia do catálogo; status `open`/`completed`, sem reabrir; quatro chaves novas na matriz (`shopping.create_list` e `shopping.complete_list` para todos, `shopping.manage_catalog` e `shopping.manage_lists` para owner e admin); RLS por coluna, cinco RPCs e triggers; stepper por delta atômico no banco; `postgres_changes` em `shopping_lists` e `shopping_list_items` com a revisão de `select`; modos só no cliente; vínculo com tarefa só de navegação; XP de compra por trigger ao finalizar, com mínimo de itens marcados, teto diário e uma vez por lista, depois da Fase 6; porta aberta para F8-5; dez itens a confirmar pelo humano.
  - `packages/contracts/src/shopping-vocabulary.ts` (categorias e unidades, sem import) e `shopping.ts` (linhas, entradas, stepper, marcar, finalizar, `shoppingErrorCodeSchema`), com 16 testes.
  - `packages/config/src/shopping.ts` (`shoppingRules`, espelho `shopping_rules`; `shoppingDefaults`) e `shopping-catalog-seed.ts` (44 itens), com 4 testes. `@azkaban/config` passa a depender de `@azkaban/contracts`, só por `import type`; `pnpm-lock.yaml` atualizado.
  - `scripts/check-permission-mirror.mjs`: compara `shopping_rules`, os enums `shopping_category` e `shopping_unit` na ordem, e `shopping_catalog_seed`.
  - `docs/arquitetura.md`: seção "Compras".
  - Handoffs `20261103-0230-arquiteto-para-{banco-de-dados-compras,compras-compras,auth-grupos-permissoes-de-compras}`.
- **Arquivos/módulos principais:** `docs/adr/0011-lista-de-compras.md`, `packages/contracts/src/shopping*.ts`, `packages/config/src/shopping*.ts`, `scripts/check-permission-mirror.mjs`, `docs/arquitetura.md`, `docs/agentes/handoffs/`
- **Migrations:** nenhuma; são do `banco-de-dados`.
- **Decisões/ADRs:** ADR-0011.
- **Como testar:** `pnpm check`.
- **Verificado:** `pnpm check` passou (17 de 17 e 9 de 9 tarefas; contratos 108 testes, config 19; `functions:imports` 8 de 8; dependency-cruiser sem violações). Mutação no contrato, desfeita: sem o piso da quantidade e com o stepper não estrito, 4 de 16 testes falham. Os três arquivos de espelho carregam direto no Node.
- **Não verificado:** nada com a pilha; `pnpm db:check-permissions` vai acusar as quatro comparações de compras e a matriz até as migrations e o espelho de `auth-grupos`. A leitura do seed com acentos e emojis pelo `docker exec` no Windows não foi exercitada. O nome do evento de XP depende do ADR-0010, escrito em paralelo.
- **Pendências / próximos passos:** os três handoffs. Para o orquestrador: dividir F7-5 no QUADRO e dar dono a `packages/core/src/shopping` e à aba "Compras". Para o humano: a seção 15 do ADR-0011.

### Claude de Rafaell Bezerra Saraiva — 2026-11-03 02:37 (BRT)

- **Branch:** feat/shopping-permissions, a partir de feat/phase-7-shopping (`b30a4b0`)
- **Agente(s):** auth-grupos
- **Resumo:** As quatro chaves de compras do ADR-0011, seção 3, no espelho da matriz do cliente. São as primeiras chaves de `member`.
- **Alterações:**
  - `shopping.create_list`, `shopping.complete_list`, `shopping.manage_catalog` e `shopping.manage_lists` para `owner` e `admin`; `member` recebe só as duas primeiras.
  - O teste da matriz cobre as quatro nos três papéis.
- **Arquivos/módulos principais:** `packages/core/src/permissions/matrix.ts`, `packages/core/src/permissions/matrix.test.ts`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0011, seção 3, e ADR-0003. Nada no cliente tratava `member: []` como sinal de membro comum: `rolePermissions` só é lido por `can()` e pelo teste. Nenhuma tela lista chaves de permissão, então não há rótulo i18n a criar. O formato do arquivo segue o que `scripts/check-permission-mirror.mjs` lê.
- **Como testar:** `pnpm check`; com a pilha e a migration de `banco-de-dados`, `pnpm db:check-permissions`.
- **Verificado:** `pnpm check` passa (core com 617 testes). Mutação: tirar `shopping.complete_list` de `member` fez 1 teste falhar; restaurado.
- **Não verificado:** `pnpm db:check-permissions`, sem pilha e com a migration ainda em andamento. Hora derivada de UTC menos 3, porque o PowerShell foi bloqueado.
- **Pendências / próximos passos:** entrar no mesmo merge da migration de permissões de `banco-de-dados`.
