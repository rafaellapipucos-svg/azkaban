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

- `gamificationRules.xp.dailyCap` (300): o saldo dos motivos de `cappedXpEventReasons` (todos, menos os dois de dia perfeito) que um usuário soma nas **últimas `capWindowHours` (24) antes do evento**, janela móvel e sem fuso, não passa do teto (atualizado na seção 14, SEG6-1; antes era o dia local do perfil).
- **Saldo da janela por ocorrência e grupo, com piso zero** (atualizado em 2026-11-03, seção 14, SEG6-3): os eventos com teto gravados na janela são agrupados por `(coalesce(occurrence_id, id do evento), group_id)`, cada par é somado, e o saldo é `Σ max(0, saldo do par)`. "Hoje", nos itens abaixo, é a janela.
- Em `occurrence_award_xp`, depois da compensação: `espaço = min(teto, max(0, teto − saldo do dia))`. O base recebe `min(base, espaço)`, e o bônus de prova, o que sobrar. Valor zero não gera evento, regra que já existe.
- Reabrir algo concluído hoje libera o espaço dele, porque a ocorrência volta a zero. Isso não abre brecha: reconcluir só devolve o que a ocorrência vale, e a média por dia fica no teto.
- **Uma compensação de outro dia não vira crédito para hoje.** A soma simples falhava: reabrir hoje 300 pontos de ontem deixa a soma de hoje em −300, e cada uma de 21 conclusões difíceis (30 cada) cabia no espaço, gravando 600 pontos de conclusões no dia. O `min` só limitava uma conclusão, não o dia. Com o piso por ocorrência, os grupos das ocorrências reabertas valem 0, e as conclusões novas param em 300: a 11ª não grava nada. A mutação com a soma simples no pgTAP do `banco-de-dados` dá 600.
- Reconcluir hoje o que foi reaberto de outro dia não consome o teto de hoje, porque a ocorrência só volta a zero. O saldo líquido do dia continua no teto.
- `capRoom`, de `packages/core`, e o banco usam a mesma regra.
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
| Trocar o fuso para reabrir o teto       | Janela móvel de 24 h, sem fuso, e `profiles.timezone` só com nomes de `pg_timezone_names` (seção 14, SEG6-1)                 |
| Ocorrência no passado distante          | Piso da história: nada antes da criação do perfil − 1 nem de 400 dias atrás (seção 14, SEG6-2)                               |

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
- **RPC `group_ranking(p_group_id, p_week_start)`**, `security definer`, para `authenticated`. Exige ser membro atual (`forbidden`) e o ranking ligado (`ranking_disabled`). A semana é `[p_week_start, + 7 dias)` no fuso do perfil de quem chama, lido no servidor, alinhada a `gamificationRules.ranking.weekStartsOn` e entre as últimas `maxWeeks` (2). A soma não começa antes de o ranking ser ligado nem de quem chama entrar no grupo (seção 14, SEG6-4; antes o fuso e a semana vinham livres do cliente).
- **Soma:** `xp_events` com `group_id` do grupo e `created_at` na semana, a partir de `greatest(início da semana, groups.ranking_enabled_at, joined_at de quem chama)`, por membro atual. Devolve só quem tem saldo positivo, com `rank()`. Ex-membros saem.
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
- **LGPD:** exportar e excluir a conta, em F8-3, cobrem `xp_events`, `user_stats`, `user_day_stats` e `user_achievements`. A cascata por `user_id` já apaga. Retenção e o texto da tela de transparência: seção 14.
- O som e a vibração são preferência do aparelho, sem dado no servidor.

### 8. Comemorações

- **Quem dispara:** um `CelebrationHost` da feature `gamification`, montado pela rota no layout do app, como o `NotificationToaster`. Ele assina pelo Realtime os `insert` em `xp_events` e `user_achievements` do próprio usuário (RLS), relê `user_stats` uma vez por rajada, e `packages/core` decide o que comemorar comparando antes e depois. Assim vale para qualquer caminho: Hoje, calendário, detalhe, prova aprovada mais tarde. A feature `tasks` não importa `gamification`.
- O toque já tem retorno imediato no `TaskCheck`, de `tasks`. A comemoração chega logo depois, com o evento.
- **Conclusão com o teto atingido:** vale zero, nenhum evento é gravado (seção 2), e o `CelebrationHost` não comemora. O `TaskCheck` ainda dá o retorno imediato, e a tela mostra que o teto foi atingido. Consequência aceita: inventar outro gatilho faria `tasks` conhecer `gamification`, ou comemoraria um XP que não existe.
- **Tipos** (`celebrationKindSchema`): `occurrence_partial` (mascote feliz, sem confete: a honestidade também conta), `occurrence_done` (confete curto e mascote comemorando), `streak_milestone` (em `gamificationDefaults.streakMilestones`), `perfect_day` (tela inteira de dia perfeito, pelo evento `perfect_day`), `level_up` e `achievement`. Juntos, mostra o maior e lista os outros.
- Subir de nível de novo depois de reabrir não comemora outra vez: o aparelho guarda o maior nível já comemorado.
- **Reduzir movimento** (`useReducedMotion`, de `packages/ui`): sem confete e sem animação do mascote; o texto e o mascote parado continuam. Não desliga som nem vibração, que têm as próprias chaves (decisão de `gamificacao`, a confirmar pelo humano).
- **Cartão de comemoração:** fica no centro, para não cobrir o cabeçalho nem a faixa do aviso de notificações, e fecha sozinho em 6 s.
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

- `recompute_user_gamification(user)`, só `service_role`: `total_xp` pela soma de `xp_events`; `refresh_user_day` de cada dia desde a primeira ocorrência, sem passar do piso de `historyDays` (400) nem da criação do perfil − 1 (seção 14, SEG6-2); e `refold_streak` desde o primeiro. Não reescreve eventos; só concilia o dia perfeito, que é idempotente.
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
10. **Reduzir movimento** não desliga som nem vibração (seção 8).
11. **Janela móvel de 24 h** para o teto, no lugar do dia local (seção 14, SEG6-1).
12. **Histórico de 400 dias** para contar, dobrar e recalcular (SEG6-2).
13. **Ranking** só com a semana corrente e a anterior, e só desde que foi ligado e desde que a pessoa entrou no grupo (SEG6-4).
14. **Risco aceito** do `DELETE` de `user_achievements` pelo Realtime (SEG6-6).
15. **Retenção** dos dados de gamificação enquanto a conta existir, sem poda de `user_day_stats` (seção 14, LGPD).

### 14. Revisão de segurança da Fase 6

Decisões de 2026-11-03 sobre a primeira passada do `revisor-seguranca` (handoffs `20261103-0350-revisor-seguranca-para-arquiteto-gamificacao` e `20261103-0350-revisor-seguranca-para-banco-de-dados-gamificacao`). Onde divergir das seções anteriores, vale esta; as seções 2, 6, 7 e 11 já apontam para cá.

**SEG6-1 (média): trocar o fuso reabria o teto.** O teto começava na meia-noite do fuso atual do perfil, que o próprio usuário grava. O PoC somou 10.500 pontos em 24 h trocando entre 35 zonas.

- **Decisão: janela móvel.** O teto vale para os eventos com teto gravados nas últimas `gamificationRules.xp.capWindowHours` (24) antes do evento, `created_at >= now() − 24 h`, sem fuso. Em qualquer intervalo de 24 h o saldo líquido fica no teto. Fecha a classe inteira (fuso, horário de verão, strings POSIX) sem coluna nova; o lock por usuário não muda.
- Por que não as outras: congelar o fuso do teto por dia pede estado em `user_stats` e uma regra de `least` que a tela teria de imitar; limitar a troca de fuso pune quem viaja e não fecha as strings POSIX.
- Consequência para o usuário: quem bateu o teto às 22h volta a ter espaço a partir das 22h do dia seguinte, à medida que os eventos saem da janela, e não à meia-noite. A tela fala em "últimas 24 horas".
- Dia perfeito, ofensiva e `last_closed_date` continuam por dia local do perfil.
- **`profiles.timezone`** passa a ser validado contra `pg_timezone_names` num trigger de `insert` e de `update of timezone`, com `invalid_timezone` (22023). Corta as strings POSIX, que o Postgres aceita em `at time zone`, também nos dias e no fechamento. A migration troca antes as linhas inválidas pelo padrão do perfil. O cliente já valida pelo `Intl` (`timezoneSchema`), então o erro não ganha código de contrato.
- Residual aceito: trocar o fuso ainda remaneja ocorrências entre dias locais e pode render um bônus de dia perfeito a mais. O bônus tem `group_id` nulo, não entra no ranking e só engana a própria pessoa, como a ofensiva trivial.

**SEG6-2 (média): ocorrência no passado distante.** Uma ocorrência de 2000 fazia o trigger e o vermelho automático dobrarem milhares de dias por linha.

- **Piso da história**, confirmado: `greatest(dia local da criação do perfil − 1, hoje local − gamificationRules.historyDays)`, com `historyDays` 400, o mesmo horizonte que o recálculo já usava, agora em config.
- `refresh_user_day_counts`, o trigger de status, o início de `refold_streak` e o recálculo ignoram dias antes do piso: nenhuma linha em `user_day_stats` e nenhum evento.
- **`perfect_day` só a partir do dia local da criação do perfil.** O "− 1" do piso existe para que uma troca de fuso para oeste não deixe o primeiro dia de fora; esse dia conta, mas não rende bônus.
- **Uma dobra por usuário por comando.** Com o piso, um lote de 500 linhas do vermelho automático de uma mesma pessoa ainda faria 500 dobras de até 400 dias. O trigger passa a agrupar por comando: um `refresh` por (usuário, dia) e uma dobra por usuário a partir do menor dia tocado (trigger `for each statement` com tabela de transição, ou equivalente que o `banco-de-dados` escolher). O lote fica em no máximo uma dobra de 400 linhas por pessoa.
- O piso de `start_at` relativo a `now()` na criação de tarefas não é necessário com isso, e fica de fora.

**SEG6-3 (baixa): o saldo agrupa por `(ocorrência, grupo)`.** Reconcluir num grupo o XP privado de outro dia fechava a ocorrência em zero e não consumia o teto, mas entrava no ranking. O saldo da janela agrupa por `(coalesce(occurrence_id, id), group_id)`, com piso zero em cada par: o par privado reaberto vale 0, e o `+30` do grupo consome o teto. `capRoom` faz o mesmo com `occurrenceId ?? id` e `groupId`.

**SEG6-4 (baixa): o ranking aceitava qualquer semana e qualquer fuso.**

- **Assinatura `group_ranking(p_group_id uuid, p_week_start date)`.** A de três argumentos sai. O fuso é o do perfil de quem chama, lido no servidor.
- `p_week_start` precisa cair em `gamificationRules.ranking.weekStartsOn` (`extract(dow)`, 0 é domingo, como `WeekStart` do core) e ficar entre o início da semana corrente menos `7 × (maxWeeks − 1)` dias e o início da semana corrente, no fuso de quem chama. Fora disso, `invalid_argument` (22023), sem código de contrato: a tela nunca pede outra semana.
- **`maxWeeks` 2:** a semana corrente e a anterior, para a segunda-feira ainda mostrar a semana que fechou. `rankingWeekStartsOn` sai de `gamificationDefaults` para `gamificationRules.ranking.weekStartsOn`, porque o servidor passa a conferir; o nome antigo aponta para o novo até a feature trocar.
- **Nada antes de o ranking ser ligado.** Coluna `groups.ranking_enabled_at timestamptz`, fora do `grant update` do cliente, escrita só por trigger `before insert or update` em `groups`: vira `now()` quando o ranking efetivo (a chave ou o padrão do tipo, por `group_ranking_enabled`) passa de desligado para ligado, inclusive no `insert`; vira nulo quando desliga; e não muda nos outros casos. Não fica em `settings` porque `settings` é gravável por quem tem `group.update`, e o servidor teria de apagar o que o cliente mandasse. O cliente não lê a coluna, e o contrato não muda por ela.
- **Nada antes de quem chama entrar.** A soma começa em `greatest(início da semana, ranking_enabled_at, joined_at de quem chama)`. Quem entra numa empresa não vê o XP dos colegas de antes de entrar; a semana dele começa vazia.
- **Grupos `family`** nascem ligados, então `ranking_enabled_at` é a criação do grupo e nada muda para eles. Na migration, os grupos já ligados, pela chave ou pelo padrão, recebem `now()`: perde-se só o ranking da semana em curso, e nada antes da produção.
- Residual aceito: as bordas da semana seguem o fuso de quem chama, e trocar o próprio fuso desloca a janela em até 26 h em cada ponta. Por diferença, um membro ainda tira o XP dos colegas nessas bordas, só nas duas semanas permitidas e mexendo nos próprios dias. Se isso pesar, o caminho é um fuso por grupo.
- **Contrato:** `groupRankingInputSchema` perde `timezone` junto com a troca do repositório, pelo `gamificacao`, para o build não quebrar entre os dois passos. A migration do banco e essa troca entram juntas na integração.

**SEG6-5 (baixa): direção confirmada.** `close_gamification_days` passa a `for no key update of p skip locked`, com um bloco `begin ... exception when others then raise warning` por perfil, que não avança o `last_closed_date` de quem falhou. É implementação do `banco-de-dados`; nenhuma regra muda.

**SEG6-6 (informativo): risco aceito, como o SEG4-4 (ADR-0008).** Na exclusão de uma conta, o `DELETE` em cascata de `user_achievements` vai pelo Realtime a todo assinante, sem RLS, com a chave `(user_id, achievement_key)`. Quem recebe fica sabendo um id e quais conquistas ele tinha; nada de nome, tarefa ou grupo. Aceito por ora. Caminho, se o humano não aceitar ou a carga pesar: (1) chave substituta `id` em `user_achievements`, com `unique (user_id, achievement_key)`, que reduz o vazamento ao id opaco, como em `xp_events`; (2) a comemoração por Broadcast num canal privado por usuário, que também tira a checagem de RLS de cada `insert` para cada assinante nas rajadas do fechamento e do recálculo. Até lá, a carga do Realtime fica em observação.

**LGPD, para F8-3.**

- **Exportar:** as linhas da pessoa em `xp_events`, `user_stats`, `user_day_stats` e `user_achievements`. O ranking não entra: é derivado do XP de outros.
- **Excluir:** a cascata por `user_id` já apaga as quatro.
- **Retenção:** as quatro ficam enquanto a conta existir. `xp_events` é a fonte do total e não pode ser podado sem mudar o nível. `user_day_stats` antes do piso de `historyDays` deixa de ser lido e pode ser podado em F8-3, se o humano preferir (seção 13, item 15).
- **Tela de transparência** para funcionários precisa dizer: (a) com o ranking ligado, os colegas do grupo veem o nome e o XP semanal das tarefas daquele grupo, e quem administra pode ligar a qualquer momento; (b) o ranking conta só a partir de quando foi ligado e de quando a pessoa entrou, e mostra só a semana corrente e a anterior; (c) `user_day_stats` guarda, por dia, quantas tarefas a pessoa planejou, concluiu e perdeu, visível só para ela; (d) nível, ofensiva, total e conquistas não aparecem para ninguém, nem para quem administra.

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
- `occurrence_award_xp` passa a depender de um lock por usuário. Desde a seção 14, o teto não depende do fuso.
- O resumo diário passa a ler `user_stats`, e o claim, a contar as ocorrências de hoje.
- Uma ofensiva pode subir ou cair dias depois, quando uma conclusão atrasada ou uma contestação refaz um dia passado.
- Um dia perfeito pode perder o bônus no fechamento, se uma ocorrência nova entrar naquele dia depois da comemoração.
- Trocar o fuso do perfil não reescreve os dias passados; os novos usam o fuso novo.
- A Fase 7 usa `shopping_completed`, reservado aqui, e herda o teto diário.
- F8-3 cobre as quatro tabelas na exportação e diz aos funcionários o que o ranking mostra. F8-7 traz `expo-haptics` e o som no nativo.
