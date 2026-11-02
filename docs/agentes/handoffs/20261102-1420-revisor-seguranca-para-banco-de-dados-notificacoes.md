# Handoff: revisor-seguranca para banco-de-dados, notificações

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-02 14:20 (BRT)
**Branch:** `chore/security-phase-4`, a partir de `feat/phase-4-notifications` (`55f87f0`)

## Contexto

Revisão de segurança da Fase 4, diff `feat/phase-3-proof..feat/phase-4-notifications`. A pilha local estava com outro agente o tempo todo, então nada aqui foi reproduzido no banco: o que segue é leitura das migrations, com o raciocínio. O resto resistiu à leitura: RLS e grants das quatro tabelas, outbox sem policy nem grant, `claim` e `report` só para `service_role`, recheque de acesso no claim, ex-membro e título pelo embed, regex de host (userinfo, barra invertida, porta, ponto final, IP fora da lista, não ASCII), limite de 10 e o vermelho automático (XP zero, `late` pelo relógio, janela de 72 h intacta, `in_review` intocado).

## O que foi entregue

Só este relatório. Nenhuma migration mudou.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG4-1, média. Um membro enche o sino do criador sem limite.** `('done', 'pending', 'assignee')` e `('pending', 'done', 'assignee')` deixam o responsável alternar à vontade numa tarefa sem foto. Cada `pending -> done` escreve uma linha nova em `task_status_history`, e `notify_status_change` usa o id dessa linha como chave: `occurrence_resolved:<history_id>`. O `unique (user_id, dedupe_key)` nunca bate, então cada volta é uma linha nova no sino do criador, um evento de Realtime (o `NotificationToaster` mostra um aviso por insert) e, se o criador ligou push para `occurrence_resolved`, um push no celular. Não há limite de taxa em `set_occurrence_status`. O criador não apaga linhas do sino (sem `delete`), então convive com elas por 30 dias. O mesmo vale, em escala menor, para `proof_disputed`: quem revisa pode contestar e desfazer em laço. Sugestão: chave por ocorrência e destino, não por linha do histórico, por exemplo `occurrence_resolved:<occurrence_id>:<to_status>` com um balde de tempo (hora local) ou, mais simples, `on conflict` que só renova `created_at` e `read_at` sem nova linha na outbox se outra saiu há menos de N minutos. A alternativa é um limite por usuário em `set_occurrence_status`. PoC a executar: logar como Duda, alternar 50 vezes `set_occurrence_status` entre `done` e `pending` numa tarefa de Caio e contar `notifications` de Caio (espera-se 50).

**SEG4-2, baixa. Conhecer o endpoint basta para tomar a inscrição de outra conta.** `on conflict (endpoint) do update set user_id = excluded.user_id` move a linha para quem chamou, com as chaves que ele mandou. O endpoint é segredo do navegador e nunca volta ao cliente, por isso a severidade é baixa, mas quem o obtiver (computador compartilhado, extensão, log de terceiro) desliga o push da vítima em silêncio e, se tiver também `p256dh` e `auth`, faz o nosso servidor exibir no aparelho dela os títulos que ele mesmo escrever nas próprias tarefas, com o ícone do app. O caso legítimo (mesmo navegador, outra conta) chega com as mesmas chaves, porque é a mesma inscrição. Sugestão: só trocar o dono quando `p256dh` e `auth` forem iguais aos guardados; senão, `raise exception 'forbidden'` ou nada. O `syncThisDevice` do cliente já cancela a inscrição de outra conta antes de criar uma nova, então o fluxo normal não muda.

**SEG4-3, baixa. `proof_in_review` não passa por `can_view_task_for`.** Em `can_receive_notification`, o ramo de `proof_in_review` exige grupo, `visibility = 'group'` e `proof.review`, mas não ver a tarefa nem `archived_at is null`. Hoje os mesmos papéis têm `proof.review` e `task.view_group`, então não vaza nada. Se um papel ganhar só `proof.review`, o push leva o título de uma tarefa que a pessoa não vê, e `can_view_proof` nem a deixaria revisar. Sugestão: `public.can_view_task_for(p_user, t) and t.archived_at is null and ...`, o que alinha com `can_review_proof`.

**SEG4-4, informativo. O Realtime manda os `DELETE` de `notifications` para todo assinante.** O Supabase não aplica RLS nem filtro a `DELETE` em `postgres_changes`; o `old` traz só a chave primária. Toda madrugada, `delete_expired_notifications` gera um evento por linha apagada para cada cliente conectado, com o `id` de avisos de outras pessoas. Não há conteúdo, e o cliente ignora `DELETE`. Fica registrado porque a ADR diz que o Realtime só entrega as linhas do próprio usuário, e porque o leque cresce com usuários vezes linhas. O Broadcast em canal privado, já citado como caminho na ADR, resolve.

**SEG4-5, baixa, LGPD. `push_subscriptions` não tem retenção.** Sai com 404 ou 410, ao sair da conta ou com a conta. Um navegador abandonado que o serviço não recusa fica para sempre, com `user_agent`. Sugestão: no mesmo cron diário, apagar inscrições com `coalesce(last_success_at, created_at)` mais velho que, por exemplo, 90 dias. O app inscreve de novo ao abrir, porque `register_push_subscription` faz upsert. Valor em `notificationRules`, com espelho.

**Sem achado, para registro.** `auto_miss_occurrences`: a carência de 60 minutos só adia o vermelho de quem alterna `done` e `pending`, o que já deixa histórico e é limitado pela janela de atraso; não dá XP nem mexe na janela da prova (`proof_assert_open` só invalida desafio em `to_status = 'pending'`, e o job escreve `missed`).

## Bloqueios e dúvidas

SEG4-1 é também decisão de produto (quanto aviso ao criador é útil). Se a chave por ocorrência mudar o que o criador vê, vale passar pelo `arquiteto`.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset` e, como Duda, o laço de SEG4-1. Para SEG4-2: Eva chama `register_push_subscription` com o endpoint da linha de Duda e chaves diferentes; hoje a linha passa a ser de Eva, depois da correção deve falhar.
