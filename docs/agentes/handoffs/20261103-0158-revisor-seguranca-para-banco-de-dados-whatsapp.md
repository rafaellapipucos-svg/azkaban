# Handoff: revisor-seguranca para banco-de-dados, WhatsApp

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-03 01:58 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-5`, a partir de `feat/phase-5-whatsapp` (`9f88a68`)

## Contexto

Primeira passada da revisão de segurança da Fase 5, diff `feat/phase-4-notifications..feat/phase-5-whatsapp`. Sem pilha: nada foi reproduzido no banco, o que segue é leitura das 10 migrations e do `rls_whatsapp.test.sql`.

Resistiu à leitura: RLS ligada e `revoke all` nas três tabelas novas; das colunas novas de `profiles`, só as cinco `daily_summary_*` têm `grant update`; `group_member_profiles()` e `team_overview` continuam só com o nome; `profiles` fora da publicação do Realtime e nenhuma view; `start_phone_verification`, `record_whatsapp_statuses`, `whatsapp_stop_by_wa_id`, `daily_summary_source`, `enqueue_daily_summaries` e o claim só com `service_role`; o código só como SHA-256 de `id:código`, gerado com `gen_random_bytes`; a confirmação conta a tentativa antes de comparar e devolve o erro em vez de levantar (um `GET` na RPC cai na transação somente leitura antes de comparar, então não vira oráculo); um código vivo por usuário; troca de número zera o opt-in; `is_whatsapp_ready` conferido na gravação, no job e no claim; a fonte do resumo só com ocorrências de que a pessoa é responsável, por `can_view_task_for`, de tarefas não arquivadas; retenções de 48 h, 30 dias e 1 dia.

## O que foi entregue

Só este relatório. Nenhuma migration mudou.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG5-1, média. O PARAR de um número antigo ou digitado errado desliga o WhatsApp de quem já usa outro número.** `whatsapp_stop_by_wa_id` (`20261103120500_whatsapp_messages.sql:116-120`) aceita qualquer `recipient_wa_id` já visto em `whatsapp_messages` daquele usuário, sem conferir que a mensagem foi para o número verificado hoje. O `phone-verification` grava a linha `phone_code` com o `wa_id` que a Meta devolve, antes de o número ser verificado (handoff 0135, "Escritas diretas").

Cenário: Ana pede o código para `+55 11 98888-7777` com um dígito trocado. A Meta aceita (o número existe) e devolve o `wa_id` W do desconhecido; a linha fica `(user_id = Ana, purpose = phone_code, recipient_wa_id = W)`. Ana corrige, verifica o número certo e ativa. O desconhecido, que recebeu um código que não pediu, responde PARAR: `p.id in (select m.user_id ... where m.recipient_wa_id = W)` acha Ana, que é desligada em silêncio, com `source = 'webhook'`. O mesmo acontece com o número antigo depois de uma troca (a linha `notification` do número antigo fica 30 dias) e com um número reciclado pela operadora.

Correção sugerida, uma das duas:

- no ramo do `wa_id`, só mensagens enviadas ao número atual: `m.purpose = 'notification' and m.created_at >= p.phone_verified_at`; ou
- trocar a busca na tabela pela regra do nono dígito, que é determinística e já vale antes do primeiro resumo: `substr(p.phone_e164, 2) = p_wa_id or (p.phone_e164 ~ '^\+55[0-9]{2}9[0-9]{8}$' and p_wa_id = '55' || substr(p.phone_e164, 4, 2) || substr(p.phone_e164, 7))`.

A segunda resolve também a resposta PARAR ao próprio código (antes de haver linha `notification`). Testes: linha `phone_code` com outro `wa_id` mais PARAR daquele `wa_id` muda 0; linha `notification` anterior a um `phone_verified_at` novo muda 0; o caso atual "a wa_id without the ninth digit finds the profile" continua passando.

**SEG5-4, baixa hoje, média quando F8-3 deixar excluir a conta. Os limites por número somem com a conta.** `phone_verifications.user_id` é `on delete cascade` (`20261103120400_phone_verifications.sql:5`), e o limite por número conta essas linhas. Com a exclusão de conta de F8-3, o laço "criar conta, pedir 5 códigos para o número X, excluir, repetir" manda códigos sem limite para X (assédio e custo, cada um é uma mensagem de autenticação paga) e soma 25 palpites por volta. É a mesma classe do SEG-3 da Fase 3 (`20261101173500_proof_limits_survive_cascade.sql`). Correção sugerida: `user_id` anulável com `on delete set null`; a linha guarda `phone_e164` e `created_at` até a retenção de 48 h, e o limite por usuário não muda. Teste: apagar o usuário de `auth.users` depois de 5 envios para X; uma conta nova não consegue o sexto para X. Hoje não há caminho de exclusão para o usuário, por isso a severidade baixa.

## Bloqueios e dúvidas

SEG5-1 com a regra do nono dígito tira a dependência de `whatsapp_messages` no PARAR; se preferir manter a busca, o `arquiteto` decide se a seção 7 do ADR-0009 muda o texto. SEG5-4 mexe no que o ADR-0009, seção 11, diz sobre a cascata: o `arquiteto` registra.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm db:test`. Para SEG5-1, como service role: perfil pronto com `+5511988887777`, uma linha `whatsapp_messages (user_id, purpose 'phone_code', provider 'console', provider_message_id 'x1', recipient_wa_id '5511977776666')`, depois `select public.whatsapp_stop_by_wa_id('5511977776666')`. Hoje devolve 1; depois da correção, 0.
