# Handoff: qa-testes para gamificacao, achados do QA da Fase 6

**De:** qa-testes
**Para:** gamificacao
**Data:** 2026-11-03 04:05 (BRT, derivada de UTC menos 3)
**Branch:** `chore/qa-phase-6`, a partir de `feat/phase-6-gamification` (`058bce3`)

## Contexto

QA da Fase 6 no estado integrado. `e2e/gamification.spec.ts` rodou pela primeira vez e passa (4 de 4) depois de um ajuste de teste (QA6-1). Percurso das telas novas a 320, 375 e 1280 px, claro e escuro, com e sem reduzir movimento: sem rolagem lateral, sem texto cortado, nenhum alvo interativo abaixo de 44 px, foco visível (contorno do navegador) em todas as paradas do Perfil, a tela de dia perfeito é `dialog` com nome, prende o foco em "Continuar", fecha com Esc e devolve o foco à caixa da tarefa. Nada bloqueia a fase; os achados são de uso.

## O que foi entregue

Só E2E e o `global-setup` (`close-gamification-days` desligado na E2E). Nenhum `test.fail()`: a E2E descreve o comportamento de hoje.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA6-2, média. A tela de dia perfeito some quando a mesma rajada traz uma conquista ou um nível.**

`celebrationsFor` ordena pelo índice de `celebrationKindSchema` (`achievement` > `level_up` > `perfect_day`), e o `CelebrationHost` só abre o `PerfectDayScreen` quando `perfect_day` é o primeiro. Visto no percurso (320 px, escuro): a 8ª tarefa fechou o dia e subiu para o nível 2 na mesma rajada, e apareceu o cartão "Nível 2!", com "Dia perfeito!" como uma linha. Visto também numa sonda: conta nova, uma tarefa só, concluída: nenhum `dialog`, só o cartão "Conquista: Primeira tarefa". Pelo código, acontece ainda sempre que a "Semana perfeita" é concedida (o 7º dia perfeito concede `perfect_week` na mesma transação); esse caso não foi rodado. É justamente nos dias mais especiais que a tela de dia perfeito não aparece.

Sugestão: abrir o `PerfectDayScreen` sempre que a lista tiver `perfect_day`, com os outros no `detail`, que o `CelebrationHost` já monta. O ADR-0010, seção 8, diz só "mostra o maior", sem definir a ordem; se mudar a regra no core, avise o `arquiteto` para o texto.

**QA6-3, baixa. O chip de ofensiva em Hoje não atualiza quando a conclusão não grava XP.**

O Realtime só publica `xp_events` e `user_achievements`, e o `CelebrationHost` só invalida `['gamification']` ao chegar um evento. Concluir com foto em análise (`in_review` conta para a meta, mas não dá XP) ou com o teto atingido muda `user_stats.current_streak` sem evento: o chip continua no número antigo até a tela remontar ou o navegador voltar ao foco, e a comemoração de marco da ofensiva fica para a próxima rajada. Visto numa sonda: com 300 XP de hoje já gravados, 4 de 5 tarefas concluídas cumprem a meta; o banco tem `current_streak = 1` e o chip continua "0 dia de ofensiva" 3 s depois. O caso da foto em análise foi conferido só pelo código.

Sugestão: invalidar `['gamification']` também quando a feature `tasks` termina uma mudança de status (pela rota, sem `tasks` importar `gamification`), ou pôr `user_stats` na publicação (pedido ao `banco-de-dados`).

**QA6-4, baixa. O chip leva ao Perfil, mas o progresso fica abaixo da dobra.**

A 320 e 375 px, o `ProgressPanel` começa perto do fim da tela, depois do nome, do fuso e de "Salvar". Quem toca no chip para ver a ofensiva cai no formulário do perfil. Sugestão: o `ProgressPanel` antes do formulário (um slot no `ProfileScreen`, do `auth-grupos`) ou rolar até ele quando a navegação vem do chip.

**QA6-5, baixa. "Últimos dias" lista dias antes da conta existir.**

Uma conta criada hoje mostra seis dias anteriores como "Sem tarefas". Não está errado, mas sugere que a pessoa já usava o app. Sugestão: começar a lista no dia da criação do perfil.

**QA6-1, baixa. "0 dia de ofensiva" e "Recorde: 0 dia".**

A regra de plural do português põe o 0 em `one`, então `streak.days` e `streak.best` saem no singular com 0. O app já usa `_zero` para isso (`notifications.label_zero`, `ui.bellLabel_zero`). Sugestão: `streak.days_zero` ("0 dias de ofensiva") e `streak.best_zero`. A E2E aceita as duas formas (`/^0 dias? de ofensiva$/`); depois da correção, o `qa-testes` aperta para `0 dias`.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/gamification.spec.ts --project=app`. Para QA6-2: um usuário com uma tarefa só, concluída: aparece o cartão "Conquista: Primeira tarefa", não a tela de dia perfeito.
