# Handoff: revisor-seguranca para banco-de-dados

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-03 06:43 (BRT, derivada de UTC menos 3)
**Branch:** `chore/security-phase-8` (de `feat/phase-8-polish`, `9c54f16`)

## Contexto

Revisão de segurança da Fase 8 (ADR-0012) e da F7-5b. Exportação, exclusão, revogação do aceite e limites seguram o essencial: nenhum vazamento entre usuários, nenhum segredo no arquivo, limite de exportação conferido (200, 200, 200, 429). Ficaram quatro achados no banco, nenhum crítico.

## Achados

### SEG8-1 (média): XP de compra rende mais que 2 listas por dia trocando o fuso

`supabase/migrations/20261104140000_shopping_xp.sql:68-74`. O teto `maxRewardedPerDay` conta a partir da meia-noite do fuso **atual** do perfil, e `profiles.timezone` é editável pelo próprio usuário (grant de UPDATE na coluna). Quem troca para um fuso cuja meia-noite acabou de passar zera a contagem. Dá 2 listas por hora (o limite de criação é 30 por hora), até o teto de 300 XP em 24 h de `occurrence_award_xp`. Isso é 15 vezes as 20 XP por dia do desenho, e uma lista de grupo conta no ranking do grupo. O comentário `ponytail:` admite o caso, mas o teto rolante não o segura de verdade.

PoC (psql, numa transação desfeita no fim): 3 listas de 3 itens marcados em `America/Sao_Paulo` dão 2 eventos. Com os eventos recuados 2 h (simulando o tempo), mais 3 listas no mesmo fuso continuam em 2. Depois de trocar para `Etc/GMT+9`, mais 3 listas levam a contagem a **4**.

Correção sugerida (uma linha): contar numa janela rolante em vez de usar o dia local. Em vez de `e.created_at >= (now() at time zone tz)::date::timestamp at time zone tz`, usar `e.created_at >= now() - interval '24 hours'`. Teste: trocar o fuso entre duas conclusões não pode render a terceira.

### SEG8-2 (baixa): `accept_invite` é um oráculo de código de convite sem limite

`supabase/migrations/20261104100700_invite_lookup_rate_limit.sql:3`. `get_invite_preview` conta `invite_lookup`, mas `accept_invite` responde `invite_invalid` para um código errado sem contar nada (o `raise` desfaz o contador). PoC: 35 chamadas seguidas de `accept_invite` com códigos inválidos, e `rate_limit_counters` continuou sem nenhuma linha de `invite_lookup`. O risco prático é baixo: são 31^10 ≈ 8×10^14 códigos. Ainda assim, o limite de consulta deixa de valer para quem usa a outra porta.

Correção sugerida: em `accept_invite`, consumir `invite_lookup` e devolver o código inválido **sem `raise`** (por exemplo, `null` ou um resultado tipado que o cliente já trata), para o contador sobreviver. Outra opção: gravar a tentativa numa subtransação autônoma, como `dblink`/`pg_background`, o que é pior. Teste: 31 `accept_invite` inválidos dão 429.

### SEG8-3 (baixa): fotos apagadas antes do recheque de `owns_groups` em `finish_account_deletion`

`supabase/migrations/20261104120400_account_deletion.sql:63-76` e `:120-125`. `begin_account_deletion` devolve os caminhos, inclusive os de grupos só do dono (`t.group_id = any (solo)`, provas de ex-membros incluídas). A função apaga os objetos e só depois `finish` recheca o bloqueio. Se alguém aceita um convite de um grupo só do dono nesse intervalo, `finish` responde `owns_groups`, a conta e o grupo ficam, e as linhas de `task_proofs` desse grupo apontam para objetos que já não existem (perda de prova de terceiros). O handoff `20261103-0617-backend-funcoes-para-auth-grupos-...` já admite o caso. Não fiz PoC (precisa de uma corrida).

Correção sugerida: com uma linha aberta em `account_deletions`, `accept_invite` recusa os grupos cujo `owner_id` é a conta em exclusão (`invite_invalid`). Isso fecha a janela entre `begin` e `finish` sem mexer na ordem do ADR.

### SEG8-4 (informativo): `processed_requests` cresce sem limite por usuário

`supabase/migrations/20261104110100_stepper_request_id.sql:35-40`. `adjust_shopping_item_quantity` e `add_catalog_item_to_list` não têm limite próprio, e cada chamada com um `p_request_id` novo grava uma linha, guardada 48 h. Um script que só gira `requestId` enche a tabela na velocidade do PostgREST. Sugestão: uma ação `shopping_item_adjust` em `rate_limit_rules`, generosa, como 600 por hora.

## A verificar no hospedado (não verificável aqui)

- `complete_account_deletion` apagou do `auth.audit_log_entries` as linhas do usuário excluído no local (PoC: 0 linhas com o e-mail ou o id depois da exclusão). No hospedado, o dono da função pode não ter `DELETE` em `auth`. O log `account_deleted` traz `audit: null` nesse caso. Confira na primeira exclusão real. Os logs do Auth na plataforma (drain) guardam IP e e-mail fora do nosso alcance: isso cabe na política de privacidade.
- `whatsapp_console_messages` (`to_e164`, `message`) não tem chave para o usuário e sobrevive à exclusão até a retenção. É só do provedor de console, mas confirme que o hospedado nunca o usa.
