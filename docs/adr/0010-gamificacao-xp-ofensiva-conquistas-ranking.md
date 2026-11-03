# ADR-0010: Gamificação: XP, níveis, meta diária, ofensiva, conquistas, ranking e comemorações

**Status:** aceito pelo arquiteto para a Fase 6. Fica sujeito à validação do humano na aprovação da fase. Os valores da seção 13 são padrões a confirmar, todos em config ou seed.

## Contexto

A seção 7.11 do prompt mestre pede XP por evento, níveis com curva configurável, ofensiva com meta diária e proteção, anel em Hoje, conquistas em seed, ranking opcional por grupo e comemorações. A Fase 2 já grava `xp_events` no banco (ADR-0005, seção 6), a Fase 3 retém o XP da prova em análise e reservou o bônus de foto (ADR-0007, seção 11), e a Fase 5 deixou `streak` nulo no resumo diário (ADR-0009, seção 5). Ficaram pendentes desde a Fase 2: o XP em massa (ADR-0005, seção 11), o bônus de dia perfeito e a prova adiantada (ADR-0007, riscos aceitos). A Fase 7 vai dar XP ao concluir uma compra (F7-5, ADR-0011).

Este ADR decide o que `gamificacao`, `banco-de-dados` e `design-system` precisam para trabalhar em paralelo. Onde houve mais de uma saída boa, ficou a mais fácil de reverter.

## Decisão

### 1. XP

`xp_events` continua a fonte da verdade, append-only, e o banco continua o único escritor. Os totais são cache.

| Motivo                 | Quando                                                                      | Valor                                             | `occurrence_id` | `group_id`                 | `local_date` |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- | --------------- | -------------------------- | ------------ |
| `occurrence_done`      | Já existe                                                                   | `taskRules.xp`, status × dificuldade              | sim             | da tarefa, nulo se privada | nulo         |
| `occurrence_done_late` | Já existe                                                                   | idem                                              | sim             | idem                       | nulo         |
| `occurrence_partial`   | Já existe                                                                   | idem                                              | sim             | idem                       | nulo         |
| `occurrence_reverted`  | Já existe: compensa o saldo da ocorrência, por usuário e grupo do evento    | menos o saldo                                     | sim             | o do evento original       | nulo         |
| `proof_bonus`          | **Novo.** Junto do XP base, em `done` com `current_proof_id`                | `gamificationRules.xp.proofBonus` (5), fixo       | sim             | como o base                | nulo         |
| `perfect_day`          | **Novo.** Dia local do perfil que fica perfeito (seção 3)                   | `gamificationRules.xp.perfectDayBonus` (20), fixo | nulo            | nulo                       | sim          |
| `perfect_day_reverted` | **Novo.** Compensa o saldo de `perfect_day` daquele dia                     | menos o saldo                                     | nulo            | nulo                       | sim          |
| `shopping_completed`   | **Reservado para a Fase 7** (ADR-0011): valor, grupo e compensação são dela | —                                                 | —               | —                          | nulo         |

- `xp_events` ganha `local_date date`, com `check` de que é preenchida exatamente nos dois motivos de dia perfeito. O `check` de `reason` ganha os quatro motivos novos de uma vez, para a Fase 7 não precisar mexer nele.
- **Bônus de prova:** concedido em `occurrence_award_xp`, depois do base, quando `status = 'done'` e há prova corrente. `in_review` continua sem XP nenhum até aprovar, então o bônus vem junto do base na aprovação ou na retenção (ADR-0007, seção 11). Vale também para `done` atrasado. Contestar compensa os dois pelo saldo da ocorrência, sem código novo, como o ADR-0007 previu.
- **Nível não é guardado.** É função pura de `total_xp` e da curva de `gamificationDefaults.level`: de `n` para `n + 1` são `round(firstLevelXp × growth^(n − 1))` pontos, e o nível 1 começa em 0. Nenhum SQL lê o nível, então a curva não tem espelho, e mudá-la vale para todos na hora, sem migration. Com os padrões, os passos são 100, 125, 156, 195, 244, 305, 381, 477 e 596, e o nível 10 começa em 2.579 pontos. Cada passo é arredondado sozinho; 2.580 seria a soma sem arredondar.
- Reabrir pode baixar o nível, porque o total baixa. É o mesmo saldo honesto do ADR-0005.
- `packages/core` calcula os mesmos valores só para mostrar, como já faz `occurrenceXp`.

### 2. XP em massa e anti-trapaça

O ADR-0005 (seção 11) deixou para esta fase: quem cria tarefas, inclusive futuras, e as conclui na hora ganha XP sem limite. Bloquear a conclusão antecipada não fecha o furo, porque reagendar para hoje é permitido e trapaça e uso legítimo ("lavei o carro um dia antes") têm a mesma forma. A defesa é um **teto diário**:

- `gamificationRules.xp.dailyCap` (300): o saldo dos motivos de `cappedXpEventReasons` (todos, menos os dois de dia perfeito) que um usuário soma no **dia local do perfil em que o evento é gravado** não passa do teto.
- Em `occurrence_award_xp`, depois da compensação: `espaço = min(teto, max(0, teto − saldo do dia))`. O base recebe `min(base, espaço)`, e o bônus de prova, o que sobrar. Valor zero não gera evento, regra que já existe.
- Compensar libera espaço no mesmo dia. Isso não abre brecha: reconcluir só devolve o que a ocorrência vale, e a média por dia fica no teto.
- **O espaço nunca passa do teto.** Reabrir hoje 300 pontos de ontem deixa o saldo de hoje em −300; sem o `min`, o espaço viraria 600. O teto existe contra farm, e uma compensação de outro dia não vira crédito para hoje. `capRoom`, de `packages/core`, e o banco usam a mesma fórmula.
- Duas transições do mesmo usuário ao mesmo tempo passariam juntas pelo teto. `occurrence_award_xp` toma `pg_advisory_xact_lock` por usuário antes de somar.
- O dia perfeito fica fora do teto: é um por dia e já tem valor fixo.
- A Fase 7 herda o teto para `shopping_completed`, salvo decisão em contrário no ADR-0011.
- A tela mostra quando o teto foi atingido: o cliente soma os próprios eventos de hoje, que a RLS já entrega, e `packages/core` compara com o teto.

O que mais impede farmar:

| Caminho                                 | Defesa                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Concluir e reabrir em laço              | Saldo por ocorrência (ADR-0005). O SEG4-1 só limita os avisos, e não precisa limitar o XP                                    |
| Dia perfeito em laço                    | Saldo por usuário e dia: o banco grava só a diferença entre o devido e o saldo (seção 4)                                     |
| Conquista em laço                       | Concedida uma vez e nunca revogada. As contagens são de ocorrências distintas no estado atual, nunca de eventos (seção 5)    |
| Muitas tarefas, ou difíceis, para si    | Teto diário                                                                                                                  |
| Ocorrências futuras, prova adiantada    | Teto diário. Fecha o risco aceito do ADR-0007                                                                                |
| Ranking inflado                         | Teto diário, só XP de tarefas `group` do grupo, e o admin vê tudo na Equipe. Tarefa privada grava `group_id` nulo (ADR-0005) |
| Ofensiva com uma tarefa trivial por dia | Aceito. É da natureza da ofensiva, e só engana a própria pessoa                                                              |
| Trocar o fuso do perfil                 | `last_closed_date` só avança, então nenhum dia fecha duas vezes. Pular para a frente fecha dias vazios, que não contam       |

### 3. Meta diária e ofensiva

**Dia de uma ocorrência:** o dia local, **no fuso do perfil** do responsável, de `scheduled_due` em `deadline` e de `scheduled_start` nos outros tipos. É a regra de `occurrenceDay` e de Hoje (ADR-0006).

**Contagens do dia**, para o responsável: ocorrências não canceladas, de tarefas pessoais ou de grupos de que ainda é membro (ADR-0005, seção 9). `in_review` conta como `done` (ADR-0007, seção 10).

- `planned`: todas essas;
- `completed`: `done`, mais `partial` quando `goal.countPartial`;
- **meta cumprida:** `planned > 0` e `completed × 100 ≥ planned × goal.percent`. Conta inteira, para TypeScript e SQL não divergirem por arredondamento;
- **quanto falta para a meta:** `needed = ceil(planned × percent / 100)`, ou seja `(planned × percent + 99) / 100` em divisão inteira;
- **dia perfeito:** `planned > 0` e todos `done`. É `isPerfectDay`, de `packages/core`, que o calendário já usa.

**Dia fechado:** um dia `D` está fechado quando a hora local do perfil passou de `D + 1` às 00:00. Hoje está aberto, e dias futuros não entram na conta.

**Ofensiva**, dobrando os dias em ordem, do mais antigo para hoje, com estado `{ streak, best, freezes, perfectRun }`:

| Dia                                           | `streak`                         | `freezes`                                                                 | `perfectRun`              |
| --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ------------------------- |
| Sem nada planejado, com `emptyDayKeepsStreak` | igual                            | igual                                                                     | igual                     |
| Sem nada planejado, sem a opção, fechado      | como meta não cumprida           | como meta não cumprida                                                    | igual                     |
| Meta cumprida (aberto ou fechado)             | `+1`; `best = max(best, streak)` | `+1` quando `streak` vira múltiplo de `freezeEveryDays`, até `maxFreezes` | `+1` se perfeito, senão 0 |
| Aberto (hoje) e meta não cumprida             | igual                            | igual                                                                     | igual                     |
| Fechado, meta não cumprida, com proteção      | igual; o dia grava `freezeUsed`  | `−1`                                                                      | 0                         |
| Fechado, meta não cumprida, sem proteção      | 0                                | igual                                                                     | 0                         |

- Hoje entra assim que a meta é cumprida. `current_streak` já inclui hoje nesse caso, e a tela não soma nada.
- A **proteção** vem da própria ofensiva: uma a cada 7 dias seguidos, até 2. "Obtida com conquistas" se cumpre assim, porque 7 dias é a conquista `streak_7`. Comprar proteção com XP fica de fora (seção 13).
- A ofensiva é toda derivada dos dias. Proteções não são eventos, e um dia corrigido depois recalcula as proteções seguintes.
- Concluído atrasado conta para o dia da ocorrência. Uma conclusão dentro da janela de 72 horas (ADR-0005, seção 1) refaz o dia, e a ofensiva se recompõe.

**Casos canônicos**, com os padrões (`percent` 80, `countPartial`, dia vazio mantém, proteção a cada 7, até 2). `F` é dia fechado com meta, `x` fechado sem meta, `0` fechado vazio, `P` fechado perfeito, `h+` hoje com meta, `h−` hoje sem meta. `packages/core` e os testes de pgTAP usam esta mesma tabela.

| Dias                             | `streak` | `freezes` | `perfectRun` | Observação                          |
| -------------------------------- | -------- | --------- | ------------ | ----------------------------------- |
| `F F F`                          | 3        | 0         | 0            |                                     |
| `F 0 F`                          | 2        | 0         | 0            | dia vazio não quebra                |
| `F F x F`                        | 1        | 0         | 0            | sem proteção                        |
| `F×7`                            | 7        | 1         | 0            |                                     |
| `F×7 x F`                        | 8        | 0         | 0            | o `x` grava `freezeUsed`            |
| `F×21`                           | 21       | 2         | 0            | teto de proteções                   |
| `F F h−`                         | 2        | 0         | 0            | hoje ainda não quebra               |
| `F F h+`                         | 3        | 0         | 0            |                                     |
| `P 0 P`                          | 2        | 0         | 2            |                                     |
| `P P F`                          | 3        | 0         | 0            | meta sem perfeição zera a sequência |
| `F 0`, sem `emptyDayKeepsStreak` | 0        | 0         | 0            |                                     |

Metas: 4 de 5 cumpre (400 ≥ 400); 3 `done` e 1 `partial` de 5 cumpre com `countPartial`; 2 de 3 não cumpre (200 < 240), e `needed` de 3 é 3; 0 planejadas não cumpre e é dia vazio.

### 4. Onde roda cada regra

`packages/core/src/gamification` tem o motor puro: nível, meta, dobra da ofensiva, valor de uma ocorrência com bônus, espaço no teto e escolha das comemorações. A tela usa o core. O banco faz a mesma conta e é o único que grava; o core é a especificação executável, como em `occurrenceXp`.

| O quê                             | Onde                                  | Quando                                                             |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| XP base, bônus de prova, teto     | `occurrence_award_xp`                 | Trigger de status, aprovação e retenção, como hoje                 |
| `user_stats.total_xp`             | Trigger `after insert` em `xp_events` | No mesmo `insert`, por upsert                                      |
| Contagens do dia e dia perfeito   | `refresh_user_day(user, date)`        | Trigger de status, para o dia da ocorrência; e o job de fechamento |
| Ofensiva, proteções, `perfectRun` | `refold_streak(user, from)`           | Ao fim de `refresh_user_day`, de `date` até hoje                   |
| Conquistas                        | `grant_achievements(user)`            | Ao fim de `refresh_user_day`, só para as ainda não concedidas      |
| Fechar os dias                    | `close_gamification_days()`, pg_cron  | A cada 15 minutos, como o vermelho automático                      |
| Meta de hoje no resumo            | O claim do resumo (ADR-0009)          | Na hora do envio                                                   |
| Ranking                           | RPC `group_ranking`                   | Leitura                                                            |
| Comemorações                      | Cliente, `packages/core`              | Ao chegar um evento novo pelo Realtime                             |

- **`refresh_user_day`** recalcula as contagens daquele dia a partir de `task_occurrences` e faz upsert em `user_day_stats`. Depois concilia o bônus: o devido é `perfectDayBonus` se o dia está perfeito e não é futuro, senão 0; grava `perfect_day` ou `perfect_day_reverted` com a diferença para o saldo daquele `local_date`, se houver. Rodar duas vezes não muda nada.
- **`refold_streak`** parte do estado da última linha de `user_day_stats` antes de `from` (zero se não há), dobra até hoje pela seção 3, grava o estado de cada linha e copia o final para `user_stats`. Dias sem linha, ou com `planned = 0`, são vazios. Um status de hoje refaz um dia; o admin sem janela, corrigindo 40 dias atrás, refaz 40.
- **`close_gamification_days`** pega até `closeJob.batchSize` perfis com `coalesce(last_closed_date, criação − 1) < ontem local`, com `for update skip locked`. Para cada um, chama `refresh_user_day` de cada dia de `last_closed_date + 1` até ontem, no máximo `maxCatchUpDays` para trás, e avança `last_closed_date`. Isso fecha os dias que ninguém tocou, conta ocorrências apagadas, reatribuídas ou criadas depois e quebra a ofensiva de quem não cumpriu. Uma passada sem trabalho custa a leitura da lista.
- O vermelho automático não basta para fechar o dia: ele usa o fuso da tarefa, que pode fechar antes do perfil.
- `user_stats` e `user_day_stats` nascem por upsert, no primeiro evento ou no primeiro fechamento.

### 5. Conquistas

Definidas em `achievements` por seed, legíveis por todo usuário autenticado. Concedidas em `user_achievements`, chave `(user_id, achievement_key)`, com `insert ... on conflict do nothing`. **Nunca revogadas.**

| `key`          | `kind`             | `threshold` | Ícone |
| -------------- | ------------------ | ----------- | ----- |
| `first_task`   | `occurrences_done` | 1           | 🌱    |
| `streak_7`     | `streak_days`      | 7           | 🔥    |
| `streak_30`    | `streak_days`      | 30          | 🏆    |
| `proofs_100`   | `proofs`           | 100         | 📸    |
| `perfect_week` | `perfect_run`      | 7           | ⭐    |

- `occurrences_done`: ocorrências distintas do usuário em `done`, sem `in_review`.
- `proofs`: ocorrências distintas em `done` com prova corrente `unreviewed` ou `approved`. Reenviar não soma, porque a prova anterior fica superada.
- `streak_days` e `perfect_run`: o estado depois de cada dia dobrado, hoje incluído.
- "Semana perfeita" é `perfectRun` 7: sete dias perfeitos seguidos, sem contar dias vazios. Quem não tem tarefa no fim de semana também alcança.
- Os textos ficam em i18n, `gamification:achievements.<key>.title` e `.description`. Uma conquista nova de um `kind` conhecido é uma linha de seed e duas chaves de tradução; um `kind` novo é código no banco e no contrato.
- Conquista não dá XP nem proteção nesta fase.

### 6. Ranking

- **Desligado ou ligado por grupo** em `groups.settings.rankingEnabled` (`groupSettingsSchema`), que quem tem `group.update` já edita. Ausente vale o padrão do tipo: `family` ligado, `company` e `other` desligados, e um tipo desconhecido desligado. O banco ganha um `check` de que a chave, se existe, é booleana.
- **RPC `group_ranking(p_group_id, p_week_start, p_timezone)`**, `security definer`, para `authenticated`. Exige ser membro atual (`forbidden`) e o ranking ligado (`ranking_disabled`). A semana é `[p_week_start, + 7 dias)` no fuso pedido, como `team_overview`. O cliente manda o início da semana de `gamificationDefaults.rankingWeekStartsOn` no fuso do perfil.
- **Soma:** `xp_events` com `group_id` do grupo e `created_at` na semana, por membro atual. Devolve só quem tem saldo positivo, com `rank()`. Ex-membros saem.
- O XP do ranking é o de tarefas `group` daquele grupo. Tarefas privadas, dia perfeito e o XP de outros grupos ficam de fora.
- Sem ligas entre grupos. "Ligas semanais" da seção 7.11 é o ranking da semana dentro do grupo.
- Índice `xp_events (group_id, created_at)`.

### 7. RLS e privacidade

| Dado                                                             | Quem lê                                       |
| ---------------------------------------------------------------- | --------------------------------------------- |
| `xp_events`, `user_stats`, `user_day_stats`, `user_achievements` | Só o dono                                     |
| `achievements`                                                   | Todo autenticado                              |
| Ranking: nome, XP da semana no grupo, posição                    | Membros atuais do grupo, com o ranking ligado |
| Nível, ofensiva, total, conquistas de outra pessoa               | Ninguém, nem o admin                          |

- O cliente não escreve em nenhuma dessas tabelas. Só funções `security definer` e triggers.
- Nível, ofensiva e conquistas misturam tarefas pessoais e de outros grupos, então mostrá-los a um grupo vazaria a vida fora dele (ADR-0003). Por isso o ranking não os traz.
- O admin já vê o status das tarefas `group` na Equipe. O XP não acrescenta nada que ele precise, e fica fora.
- **Grupos de empresa:** ranking desligado por padrão. Ligar é escolha de quem administra. A tela de transparência para funcionários de F8-3 precisa dizer que, ligado, os colegas veem o nome e o XP semanal.
- **LGPD:** exportar e excluir a conta, em F8-3, cobrem `xp_events`, `user_stats`, `user_day_stats` e `user_achievements`. A cascata por `user_id` já apaga.
- O som e a vibração são preferência do aparelho, sem dado no servidor.

### 8. Comemorações

- **Quem dispara:** um `CelebrationHost` da feature `gamification`, montado pela rota no layout do app, como o `NotificationToaster`. Ele assina pelo Realtime os `insert` em `xp_events` e `user_achievements` do próprio usuário (RLS), relê `user_stats` uma vez por rajada, e `packages/core` decide o que comemorar comparando antes e depois. Assim vale para qualquer caminho: Hoje, calendário, detalhe, prova aprovada mais tarde. A feature `tasks` não importa `gamification`.
- O toque já tem retorno imediato no `TaskCheck`, de `tasks`. A comemoração chega logo depois, com o evento.
- **Conclusão com o teto atingido:** vale zero, nenhum evento é gravado (seção 2), e o `CelebrationHost` não comemora. O `TaskCheck` ainda dá o retorno imediato, e a tela mostra que o teto foi atingido. Consequência aceita: inventar outro gatilho faria `tasks` conhecer `gamification`, ou comemoraria um XP que não existe.
- **Tipos** (`celebrationKindSchema`): `occurrence_partial` (mascote feliz, sem confete: a honestidade também conta), `occurrence_done` (confete curto e mascote comemorando), `streak_milestone` (em `gamificationDefaults.streakMilestones`), `perfect_day` (tela inteira de dia perfeito, pelo evento `perfect_day`), `level_up` e `achievement`. Juntos, mostra o maior e lista os outros.
- Subir de nível de novo depois de reabrir não comemora outra vez: o aparelho guarda o maior nível já comemorado.
- **Reduzir movimento** (`useReducedMotion`, de `packages/ui`): sem confete e sem animação do mascote; o texto e o mascote parado continuam.
- **Som:** desligado por padrão. Na web, um tom curto gerado pela Web Audio, sem arquivo e sem licença. No nativo, nada até F8-7.
- **Vibração:** ligada por padrão, por adapter `haptics` em `packages/platform`. Na web, `navigator.vibrate` quando existe (Android; o iPhone não tem). No nativo, `expo-haptics` entra em F8-7, com o build nativo; até lá, nada.
- Preferências de som e vibração ficam no aparelho, por `gamificationDefaults.celebration`.
- Confete com `react-native-reanimated` e `react-native-svg`, que já estão instalados. Sem Lottie nem dependência nova.

### 9. Resumo diário

O claim do resumo (ADR-0009, seção 5) passa a preencher `streak`:

- `current`: `user_stats.current_streak`, ou 0 sem linha. Às 8h, hoje quase nunca está cumprido, então é a ofensiva até ontem;
- `goalToday`: `needed` de hoje pela seção 3, nulo sem nada planejado hoje.

O template não muda. `buildDailySummary` passa a montar o `footer` com a ofensiva, e o fecho neutro fica para `streak` nulo.

### 10. Hoje

O anel de Hoje passa a mostrar a meta da seção 3: as ocorrências cujo dia é hoje, inclusive as que já passaram para "Atrasadas", com `completed` sobre `needed`, cheio quando a meta é cumprida. Hoje ele conta só `done` sobre `plan.today`, que perde um prazo vencido às 11h e melhora sozinho. O cálculo vem de `packages/core/src/gamification`, que `tasks` pode importar. A ofensiva entra no cabeçalho por um slot que a rota preenche com um componente de `gamification`, como o sino.

### 11. Recálculo e implantação

- `recompute_user_gamification(user)`, só `service_role`: `total_xp` pela soma de `xp_events`; `refresh_user_day` de cada dia desde a primeira ocorrência, no máximo 400 dias; e `refold_streak` desde o primeiro. Não reescreve eventos; só concilia o dia perfeito, que é idempotente.
- **Backfill:** a migration que cria as tabelas roda o recálculo de todos os perfis, com `last_closed_date` em ontem. Quem já tinha dias perfeitos recebe o bônus deles; a ofensiva nasce da história.
- Mudar `taskRules.xp` ou `gamificationRules.xp` não muda eventos antigos. Os eventos são história; o recálculo é dos totais.
- Mudar `goal` ou `streak` muda o que o próximo `refresh_user_day` ou o recálculo produz.

### 12. Divisão do trabalho

O que corre em paralelo desde já, sobre este ADR, `packages/contracts/src/gamification.ts` e `packages/config/src/gamification.ts`:

| Agente                  | Trabalho                                                                                                          | Depende de                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `gamificacao`           | F6-1: `packages/core/src/gamification` com os casos da seção 3                                                    | Este ADR                     |
| `banco-de-dados`        | F6-2: migrations, espelho, funções, job, RPC, Realtime, backfill, pgTAP com os mesmos casos; o `streak` do resumo | Este ADR                     |
| `design-system`         | Confete, mascote animado, `XpBar`, `StreakBadge`, `AchievementBadge`, tela de dia perfeito, em `/design-system`   | Este ADR                     |
| `gamificacao`           | F6-3 a F6-5: dados, telas, comemorações, ranking, adapters de `haptics` e som                                     | F6-1, F6-2 e o design system |
| `tarefas-calendario`    | O anel de Hoje pela meta e o slot da ofensiva                                                                     | F6-1                         |
| `notificacoes-whatsapp` | O `footer` com a ofensiva                                                                                         | F6-2 (o `streak` no claim)   |

`revisor-seguranca` revê a RLS, o `security definer` e o teto ao fim de F6-2.

### 13. A confirmar pelo humano

Todos são valores em config, seed ou uma linha de matriz, e voltam atrás sem perda de dados.

1. **Teto diário de 300 pontos**, fora o dia perfeito. Uma pessoa com 10 tarefas médias soma 200.
2. **Bônus:** prova 5, dia perfeito 20, fixos.
3. **Meta:** 80% das ocorrências do dia, com o amarelo contando.
4. **Proteção:** uma a cada 7 dias seguidos, até 2, sem compra com XP. Comprar exigiria um evento negativo e baixaria o nível de quem compra.
5. **Dia vazio** não conta nem quebra.
6. **Ranking:** ligado por padrão em `family`, desligado em `company` e `other`. Sem opção individual de sair; ela pode entrar como preferência do perfil, com o ranking pulando quem saiu.
7. **Curva de nível:** 100 pontos para o nível 2, crescendo 25% por nível.
8. **Som** desligado e **vibração** ligada por padrão.
9. **Conquistas** da seção 5, e "semana perfeita" como sete dias perfeitos seguidos, sem contar os vazios.

## Alternativas

- **Bloquear a conclusão antes do dia:** reagendar para hoje contorna, e pune quem adianta de verdade. Também quebraria `deadline`, cujo início pode ser o próprio prazo.
- **XP adiado até o dia da ocorrência:** exige um job para conceder depois e uma coluna para saber o que falta, e o reagendamento contorna do mesmo jeito.
- **Teto só para tarefas criadas por si:** a família cria quase tudo para si, e a trapaça migraria para tarefas trocadas entre duas pessoas.
- **Nível guardado em `user_stats`:** mudar a curva exigiria recalcular todos, e nenhum SQL precisa do nível.
- **Ofensiva calculada só ao fechar o dia:** a comemoração de 7 dias chegaria no dia seguinte, e a tela teria de somar hoje por conta própria.
- **Ofensiva calculada na leitura, sem cache:** cada abertura leria a história inteira; o resumo diário, para todos de uma vez.
- **Proteções como eventos:** um dia corrigido depois deixaria uma proteção gasta à toa. Derivadas da dobra, elas se recompõem.
- **Revogar conquista ao reabrir:** a medalha piscaria, e o laço de concluir e reabrir ganharia um efeito visível. Concedida uma vez, ela não premia o laço.
- **Ranking com nível e ofensiva:** vazaria a atividade fora do grupo.
- **Ranking com quem tem zero:** expõe quem não fez nada naquela semana, que é exatamente o que a seção 7.11 teme em empresas.
- **Coluna `ranking_enabled` em `groups`:** daria o mesmo, com migration de coluna; `settings` já existe, já tem a política de quem edita e já é o lugar da seção 8 para isso.
- **Comemoração disparada pela tela de tarefas:** exigiria `tasks` conhecer `gamification`, e perderia a aprovação de prova e o calendário.
- **Lottie para o mascote:** dependência nova e arquivos de animação. O mascote já é SVG, e o Reanimated já está instalado.
- **Som por arquivo:** precisa de um áudio com licença e de cache. Um tom gerado não tem nenhum dos dois.

## Consequências

- Mudar `gamificationRules` exige uma migration, e `pnpm db:check-permissions` passa a comparar `gamification_rules`. **Até F6-2 entrar, ele acusa a chave ausente.**
- `xpEventSchema` ganha `localDate` e quatro motivos. Nenhum código lia o schema antes desta fase.
- `occurrence_award_xp` passa a depender do fuso do perfil e de um lock por usuário.
- O resumo diário passa a ler `user_stats`, e o claim, a contar as ocorrências de hoje.
- Uma ofensiva pode subir ou cair dias depois, quando uma conclusão atrasada ou uma contestação refaz um dia passado.
- Um dia perfeito pode perder o bônus no fechamento, se uma ocorrência nova entrar naquele dia depois da comemoração.
- Trocar o fuso do perfil não reescreve os dias passados; os novos usam o fuso novo.
- A Fase 7 usa `shopping_completed`, reservado aqui, e herda o teto diário.
- F8-3 cobre as quatro tabelas na exportação e diz aos funcionários o que o ranking mostra. F8-7 traz `expo-haptics` e o som no nativo.
