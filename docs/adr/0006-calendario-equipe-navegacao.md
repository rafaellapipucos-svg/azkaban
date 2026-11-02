# ADR-0006: Calendário, visão Equipe e navegação

**Status:** aceito. O humano aprovou a Fase 2, inclusive as faixas da seção 3.

## Contexto

F2-8 a F2-10 tomaram decisões de regra que os ADRs não cobriam, listadas pelo `tarefas-calendario`. A navegação da Fase 2 também superou o paliativo do ADR-0004.

## Decisão

### 1. O dia de uma ocorrência na tela

Toda tela conta dias no **fuso do perfil de quem vê**. O dia de uma `deadline` é o de `scheduled_due`, e o de qualquer outra ocorrência é o de `scheduled_start`. Vale para Hoje, abas, calendário e Equipe.

Por isso, `team_overview` passa a receber o fuso de quem vê e a usar `scheduled_due` em `deadline`. Hoje ela agrupa no fuso da tarefa e por `scheduled_start`. Isso tem dois efeitos: uma tarefa em outro fuso cai em dias diferentes nas duas telas, e um prazo iniciado na segunda com limite na sexta conta como vencido já na terça.

A agenda não muda: expansão, `exdates` e `overdue_at` seguem no fuso da tarefa, porque "9h" é da tarefa (ADR-0005).

### 2. Dia perfeito

Um dia é perfeito quando tem ao menos uma ocorrência não cancelada e todas estão `done`.

- `cancelled` não conta.
- Dia vazio, ou só com canceladas, não é perfeito.
- `partial`, `missed` e `pending` impedem.
- `done` atrasado conta, porque `late` só reduz o XP.
- No calendário, os filtros de área e contexto decidem o que conta, e o filtro de estado só esconde.

A Fase 6 reutiliza `isPerfectDay` para o XP, sem filtros, com as ocorrências do responsável, no fuso do perfil dele. Assim, o destaque sem filtros e o XP nunca divergem.

### 3. Taxa da Equipe

`done / (done + partial + missed + pendentes de dias anteriores a hoje)`, só com dias até hoje.

- Pendentes de hoje ainda estão no prazo, e dias futuros não contam, nem com um `done` adiantado.
- `done` atrasado conta como `done`, e `cancelled` fica fora.
- Sem nada vencido, a taxa é nula e a tela diz isso, em vez de mostrar 0%.
- A conta é `teamOverview`, em `packages/core`. O banco entrega só os totais.

Faixas: verde a partir de 80%, amarelo a partir de 50%, vermelho abaixo. A seção 7.1 pede as três cores, não os cortes, e o humano aceitou esses valores ao aprovar a Fase 2. Eles ficam em `tasksConfig.team.bands`, porque cada módulo tem sua config (seção 5.1).

### 4. `useCurrentUser`

Mora em `packages/data/src/session` e é exportado por `@azkaban/data`.

Features não se importam, `core` não tem React, e `packages/ui` não acessa dados. `packages/data` é o que todas as features já usam, e o hook é só uma composição de `profilesRepository` e `groupsRepository`. Ele também dá um único lugar às chaves `['profile']` e `['groups']`, das quais a invalidação do cache depende. Com isso, `packages/data` passa a depender de `react`, `@tanstack/react-query` e `@azkaban/config`.

Fica só esse hook. Repositórios continuam sem React, e consultas específicas de uma feature continuam nela.

### 5. Navegação

Isto substitui o paliativo do ADR-0004, em que as áreas viviam como chips na tela Início.

- As abas são Hoje, uma por área vinda do banco, Calendário e Perfil.
- Expo Router tem abas estáticas, então as áreas dividem a rota `area/[areaKey]`, e `AppTabBar` desenha uma aba para cada linha de `areas`. Área nova não exige código.
- Grupos sai da barra e entra em Perfil.
- Equipe fica na página do grupo, só para quem tem `task.view_group`.
- Como features não se importam, as rotas compõem as entradas: `ProfileScreen` e `GroupDetailScreen` recebem `children`, e a rota passa o link da outra feature.
- Uma tela de pilha aberta por endereço, como a de uma notificação, tem as abas por baixo (`unstable_settings = { anchor: '(tabs)' }`) e o cabeçalho próprio `BackHeader`, com "Voltar" de 44 px e sem título vazio. Documento, título por tela e marcos de página estão no [ADR-0008](0008-notificacoes-push-pwa-vermelho-automatico.md), seção 13.

## Alternativas

- **Calendário no fuso da tarefa:** cada linha do mesmo dia poderia estar em um calendário diferente, e "hoje" deixaria de ser um dia só.
- **Aceitar o desencontro de fuso:** não custa nada, mas não resolve o prazo contado como vencido antes da hora.
- **Hook em um pacote novo:** um `package.json` para um arquivo só.
- **Manter o hook duplicado:** a duplicata é pequena, mas uma mudança no formato de `can()` teria de acertar as duas.
- **Faixas em `packages/config` ou no banco:** só a Equipe as lê.
- **Grupos como aba:** com as duas áreas, seriam seis abas em 375px, para uma ação rara.

## Consequências

- `team_overview` muda de assinatura, então a migration e a chamada em `packages/data` precisam entrar juntas.
- Duas pessoas em fusos diferentes podem ver a mesma ocorrência em dias diferentes. É o esperado: o dia é de quem vê.
- `packages/data` deixa de ser livre de React.
