# Handoff: qa-testes para tarefas-calendario, bugs encontrados na auditoria da Fase 2

**De:** qa-testes | **Para:** tarefas-calendario | **Data:** 2026-11-01 13:46 (BRT) | **Branch:** `feat/qa-phase-2` (a partir de `feat/phase-2-tasks`, commit 17043fc)

## Contexto

Auditoria da Fase 2 como entregue, em 375px e 1280px, claro e escuro, com o banco e a função locais. Cada item abaixo foi reproduzido; os passos estão em "Como testar". Em ordem de gravidade.

## O que foi entregue

Dois testes E2E novos em `e2e/tasks-late-and-count.spec.ts` já cobrem os pontos 1 e 2 (um deles com `test.fail`, ver o ponto 2).

## O que o destinatário precisa fazer

1. **Média. Depois de "Esta e as próximas" a partir de um dia que não é o primeiro, a tela cai em "Não encontramos esta tarefa."** O `TaskFormScreen` chama `goBack()` no `onSuccess`, que volta ao detalhe da ocorrência aberta. Em `this_and_following` a RPC apaga as pendentes do pivô em diante (ADR-0005, seção 8), então o `id` do detalhe não existe mais. O usuário acabou de salvar com sucesso e vê um erro. Com `all` e `this` o `id` continua, e com o pivô na primeira ocorrência a RPC age como `all`, por isso os testes antigos não pegaram. Sugestão: depois de `this_and_following`, voltar à lista (`router.replace('/')` ou a aba de origem) em vez de `router.back()`. Teste: `test.fail('after this and the following the user does not land on a "task not found" screen')`; tire o `test.fail` quando corrigir.
2. **Média. Salvar uma tarefa que repete trava o formulário até a Edge Function responder.** `create` e `edit` esperam `materialize-occurrences` antes de voltar. Medido pelo trace do Playwright: `POST /functions/v1/materialize-occurrences` levou 4,3 s com quatro workers (partida a frio) e 14,6 s com a função atrasada em 12 s; o botão "Salvar" fica com o círculo girando e a tela não anda. Se a função falha (rota abortada), o usuário volta para Hoje sem aviso e a tarefa nova **não aparece** até o cron diário, e a pessoa tende a criar de novo. Sugestão: não bloquear a navegação (disparar a materialização e invalidar a lista quando voltar) e avisar, com texto, quando ela falhar. Isto também causou as falhas intermitentes do E2E (limite de 5 s do `expect`); subi o limite para 15 s em `playwright.config.ts`, o que esconde o sintoma e não o motivo.
3. **Média/baixa. Tarefas no mesmo horário trocam de lugar a cada mudança de estado.** `order('scheduled_start')` sem desempate (`packages/data/src/tasks/index.ts`, linha 191) e `byStart` em `packages/core/src/tasks/today.ts` só comparam o início. A criação rápida usa a mesma "próxima hora cheia", então quase toda tarefa de hoje empata. Observado: criadas T1..T8, a lista mostra T2 T4 T6 T8 T1 T3 T5 T7, e marcar uma linha a leva para outro ponto da lista (a linha que o dedo tocou sai do lugar). Sugestão: desempate estável (`created_at` da tarefa, depois `id`) no banco e no `byStart`.
4. **Baixa. Erro de carga mostra também o estado vazio.** Com a leitura falhando, Hoje exibe "Não deu para carregar as tarefas. Tente de novo." e, logo abaixo, "Nada pendente por aqui. Toque em Nova tarefa para começar." (e o Calendário, "Nada marcado para este dia."). Não há botão de tentar de novo. Esconder o vazio quando `failed` e oferecer "Tentar de novo".
5. **Baixa. Fora da janela de 72 h, a tela não diz por quê.** O detalhe mostra só "Não fiz" e "Cancelar esta tarefa". Quem fez a tarefa há cinco dias não entende que não pode marcar como feita. A mensagem `late_window_expired` diz "Peça a um administrador", mas uma tarefa pessoal não tem administrador. Sugestão: um texto no detalhe quando a janela passou, e uma mensagem sem "administrador" quando a tarefa é pessoal.
6. **Baixa. Estado "Tentei" riscado.** A linha amarela usa o mesmo risco do verde, que sugere concluída. O vermelho não risca. Decidir se o amarelo deve riscar.
7. **Baixa. Medidas soltas.** `Sections.tsx` linha 34 (`width: 12, height: 12` do ponto de contexto), `maxLength` 120, 500 e 2000 em `QuickCreate`, `TaskFormScreen` e `StatusActions`, `max={99}` e `max={31}` em `RecurrenceEditor`: deveriam sair de `tasksConfig` ou de `tokens`.
8. **Baixa. Calendário em tela de 320px.** As células do mês ficam com 38px de largura (abaixo de 44px) e os rótulos da barra de abas aparecem cortados ("Domést…", "Calend…"). Em 375px está dentro do pedido.
9. **Baixa. Visão do dia do calendário** começa às 00:00; com tarefas a partir das 8h, a pessoa rola sete horas vazias. Sugestão: rolar até a primeira tarefa ou à hora atual.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm e2e` (21 testes, um deles `test.fail`).

1. Crie uma tarefa que repete 5 vezes, abra a aba Trabalho (pela URL `/area/work`), abra o terceiro dia, Editar, Esta e as próximas, mude o nome, Salvar. Cai em "Não encontramos esta tarefa.".
2. No navegador, bloqueie `**/functions/v1/**` (ou atrase 12 s) e salve uma tarefa que repete.
3. Crie oito tarefas pela criação rápida e marque a terceira.
4. Bloqueie `**/rest/v1/task_occurrences*` com 500 e abra Hoje; espere 8 s.
