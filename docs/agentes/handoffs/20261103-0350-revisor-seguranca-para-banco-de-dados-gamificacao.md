# Handoff: revisor-seguranca para banco-de-dados, gamificação (primeira passada)

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-03 03:50 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-6`, com `feat/phase-6-gamification` (`93321a5`)

## Contexto

Primeira passada da revisão de segurança da Fase 6, só leitura e sem pilha. Revisei as 11 migrations da F6-2 contra o ADR-0010. O que está bom: RLS das quatro tabelas novas (só o dono lê, ninguém escreve pelo cliente), `revoke` em todas as funções internas, `group_ranking` checa a filiação antes de tudo (o não membro recebe `forbidden` exista o grupo ou não), ex-membros saem pelo `join` com `group_members`, tarefas privadas e dia perfeito ficam fora pelo `group_id` nulo, `rankingEnabled` só muda por quem tem `group.update` (política e `grant update (settings)` já existentes), o lock consultivo vem antes da soma, a compensação inclui o bônus de prova, e o dia perfeito em laço não passa de 20 por dia.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG6-1, média. Trocar o fuso do perfil zera o teto diário.** `occurrence_award_xp` (`20261103170400_occurrence_award_xp_cap.sql:62-68`) começa a janela do teto na meia-noite local do fuso **atual** do perfil, e `profiles.timezone` é gravável pelo próprio usuário direto pelo PostgREST (`20261101120000_profiles.sql:21`, só `char_length <= 64`). Cenário: Duda faz 300 em `America/Sao_Paulo`; troca o fuso para uma zona cuja meia-noite passou há minutos (sempre existe uma, de UTC−12 a UTC+14, em passos de 15 a 60 minutos); a janela nova exclui os 300 e cabem mais 300; repete. PoC em Node puro (Intl, mesma conta da migration, uma tentativa a cada 15 minutos por 24 h, escolhendo a zona de meia-noite mais recente): **10.500 pontos em 24 h com 35 zonas IANA**, contra 300. Com strings POSIX (`'<X>-13:37'`), que o Postgres aceita em `at time zone`, a janela pode começar em qualquer minuto. Afeta o ranking das famílias (ligado por padrão). A troca de fuso também remaneja ocorrências entre dias e pode render bônus de dia perfeito a mais, só para si.

Correção sugerida, a decidir com o `arquiteto` (handoff paralelo): (a) janela móvel de 24 h, `e.created_at >= now() - interval '24 hours'`, que não depende de fuso; ou (b) congelar o fuso do teto por dia (gravar em `user_stats` o início da janela no primeiro evento com teto e usar `least(início gravado, meia-noite atual)` enquanto o início gravado tiver menos de 24 h); ou (c) limitar a troca de fuso (trigger em `profiles` com intervalo mínimo). Em qualquer caso, valide `profiles.timezone` contra `pg_timezone_names` num trigger, para cortar as strings POSIX. Teste: trocar o fuso entre duas conclusões e esperar zero na segunda.

**SEG6-2, média. Ocorrência no passado distante vira negação de serviço do vermelho automático.** `refold_streak` (`20261103170500_gamification_days.sql:123,141`) dobra de `p_from` até hoje, e o trigger `task_occurrences_after_status_gamification` chama com o dia da ocorrência, sem limite para trás. `start_at` aceita desde `2000-01-01` (`20261101140600_task_dates_and_zones.sql:94`) e não há limite de criação de tarefas. Cenário: Duda cria por script 9.800 tarefas pessoais avulsas, uma por dia desde 2000, pendentes. O `auto_miss_occurrences` (`20261102131300_auto_miss_occurrences.sql:38`) ordena por `auto_miss_at`, então as dela vêm primeiro em todo lote de 500. Cada linha marcada roda `refresh_user_day` e uma dobra de cerca de 9.800 dias, atualizando todas as linhas de `user_day_stats` dela daquele dia em diante: o lote faz da ordem de 500 × 9.500 ≈ 4,8 milhões de `update`, numa transação só, a cada 5 minutos, por cerca de 20 lotes. Enquanto isso o vermelho de todos os outros usuários espera, e `user_day_stats` incha. Cada `set_occurrence_status` dela numa ocorrência antiga também custa a dobra inteira. Efeito lateral só para si: quem tem `task.manage_group` (qualquer dono do próprio grupo) conclui sem janela e ganha 20 pontos de dia perfeito por dia passado, sem teto, mais `streak_30` e `perfect_week`.

Correção sugerida: (1) em `refresh_user_day_counts` e no trigger, ignorar dias antes de `greatest(dia local da criação do perfil − 1, hoje − 400)`, como o recálculo já faz; (2) limitar o início de `refold_streak` ao mesmo piso; (3) sem bônus de dia perfeito antes da criação do perfil. Opcional, com o `tarefas-calendario`: piso de `start_at` relativo a `now()` na criação. Teste: ocorrência de 2000 marcada `missed` não cria linha em `user_day_stats` nem evento.

**SEG6-3, baixa. Mudar o grupo do XP de outro dia não consome o teto.** O saldo agrupa por `coalesce(occurrence_id, id)` (`20261103170400_occurrence_award_xp_cap.sql:71`), sem `group_id`. Cenário (a confirmar no PoC): Duda conclui 10 tarefas privadas difíceis ontem (300, `group_id` nulo); hoje, dentro da janela de 72 h, muda a visibilidade para `group` por `edit_task`, reabre e reconclui. Hoje ficam `−30` com `group_id` nulo e `+30` com o grupo, a ocorrência fecha em zero, e o teto de hoje continua livre: ela soma mais 300 novos, e o ranking do dia recebe 600. Quem tem `task.manage_group` não tem janela e despeja no ranking da semana todo o XP privado da história. Correção: agrupar por `(coalesce(occurrence_id, id), group_id)`: o grupo nulo vale zero pelo piso e o `+30` do grupo consome o teto. O `capRoom` do core acompanha (já há handoff ao `gamificacao` sobre a divergência).

**SEG6-4, baixa. `group_ranking` aceita qualquer semana e qualquer fuso.** `20261103170700_group_ranking.sql:51-52`. (a) Janelas de 7 dias deslocadas de um dia, ou de uma hora com `p_timezone` vizinho, dão por diferença o XP diário ou horário de cada membro, não o semanal que o ADR promete. (b) Um membro consulta semanas de antes de entrar no grupo, e, quando o admin de uma empresa liga o ranking, todos veem o XP semanal de cada colega de toda a história em que o ranking estava desligado. Correção sugerida: ler o fuso do perfil de quem chama no servidor (sem `p_timezone`), exigir `p_week_start` alinhado a `rankingWeekStartsOn` e dentro das últimas N semanas (2, por exemplo). Guardar quando o ranking foi ligado e não devolver semanas anteriores fecha (b) por inteiro; o `arquiteto` decide.

**SEG6-5, baixa. `close_gamification_days` trava `profiles` com `for update`.** `20261103170600_close_gamification_days.sql:31`. `FOR UPDATE` conflita com o `FOR KEY SHARE` das chaves estrangeiras: enquanto o lote de até 200 perfis roda, qualquer `insert` que aponte para esses perfis (`xp_events` de uma conclusão, `task_occurrences`, `notifications`, `group_members`) espera o fim do lote. Além disso, uma exceção num perfil desfaz o lote inteiro, e como a ordem é `p.id`, o mesmo perfil volta primeiro na próxima passada, parando o fechamento de todos. Correção: `for no key update of p skip locked` e um bloco `begin`/`exception when others then raise warning` por perfil, que não avança `last_closed_date` dele. Informativo: a passada sem trabalho lê e calcula o fuso de todos os perfis a cada 15 minutos.

**Informativo, não segurança:** `user_day_counts` (`20261103170500_gamification_days.sql:29-39`) não exclui tarefas arquivadas. Uma ocorrência pendente de tarefa arquivada conta como planejada, nunca pode ser concluída (`set_occurrence_status` barra arquivada) e o vermelho automático a ignora, então o dia nunca fica perfeito. Confira se Hoje e `daily_summary_source` (que filtra `archived_at is null` nas listas) concordam.

## Bloqueios e dúvidas

SEG6-1 e SEG6-4 mexem em regra do ADR-0010; o `arquiteto` decide a forma (handoff `20261103-0350-revisor-seguranca-para-arquiteto-gamificacao`).

## Como testar

PoCs de banco para a segunda passada, na pilha:

1. SEG6-1: concluir 300, trocar `profiles.timezone`, concluir de novo e somar os eventos com teto das últimas 24 h.
2. SEG6-2: 500 tarefas avulsas de 2000 a 2026, rodar `auto_miss_occurrences()` com tempo medido e contar `user_day_stats`.
3. SEG6-3: privada concluída ontem, mudar para `group`, reabrir, reconcluir, concluir 300 novos e ler `group_ranking`.
4. SEG6-4: `group_ranking` com `p_week_start` deslocado de um dia e diferença entre as duas respostas.
5. SEG6-5: lote do job aberto numa sessão e `set_occurrence_status` do mesmo usuário em outra, medindo a espera.
