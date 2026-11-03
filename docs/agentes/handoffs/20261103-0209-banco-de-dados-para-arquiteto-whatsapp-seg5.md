# Handoff: banco-de-dados para arquiteto, SEG5-1 e SEG5-4

**De:** banco-de-dados
**Para:** arquiteto
**Data:** 2026-11-03 02:09 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `fix/whatsapp-db-security`, a partir de `feat/phase-5-whatsapp` (`5ed013c`)

## Contexto

Correções de banco do SEG5-1 e do SEG5-4 (handoff `20261103-0158-revisor-seguranca-para-banco-de-dados-whatsapp`). O comportamento mudou em dois pontos que o ADR-0009 descreve com o texto antigo.

## O que foi entregue

- `20261103150000_whatsapp_stop_current_phone.sql`: `whatsapp_stop_by_wa_id` casa o `wa_id` só com o telefone atual de um perfil pronto, pelos dígitos ou pela variante do nono dígito do Brasil (`55` + DDD + 8 dígitos ↔ `55` + DDD + `9` + 8 dígitos). Os dois lados são dobrados para a forma de 8 dígitos. Outros países: só igualdade. Saiu a busca por `recipient_wa_id` em `whatsapp_messages`, e com ela o índice `whatsapp_messages_wa_id_idx`. Contas com o mesmo número continuam parando juntas (decisão 10).
- `20261103150100_phone_verifications_survive_account.sql`: `phone_verifications.user_id` anulável, `on delete set null`. As linhas de uma conta excluída ficam com `user_id` nulo até a retenção de 48 h, e o limite por número continua contando.

## Contratos criados ou alterados

Nenhum. `database.types.ts`: `phone_verifications.user_id` passou a `string | null`.

## O que o destinatário precisa fazer

- **ADR-0009, seção 7, item 7:** trocar "pelos dígitos de `phone_e164` **ou** pelo `recipient_wa_id` já visto em `whatsapp_messages`" pela regra do nono dígito sobre o telefone atual, e dizer que um número antigo, digitado errado ou reciclado não para ninguém.
- **ADR-0009, seção 8 e comentário de `whatsapp_messages`:** `recipient_wa_id` não serve mais ao PARAR; fica só como registro da entrega.
- **ADR-0009, seção 11:** "excluir a conta apaga tudo por cascata de `user_id`" deixa de valer para `phone_verifications`: as linhas ficam sem `user_id` (telefone, hash do código e datas) até 48 h. Registrar como exceção, como o SEG-3 da Fase 3, e citar na transparência e na exportação de F8-3.

## Bloqueios e dúvidas

Nenhum. A regra trata um fixo de 8 dígitos com um `9` na frente como o mesmo número, como pedido ("quando o número de 9 dígitos começa com 9"). Se quiser restringir a celulares de 8 dígitos começando por 6 a 9, é uma linha.

## Como testar

`bash docs/agentes/ferramentas/pilha-b.sh db`, `pnpm exec supabase db reset`, `pnpm db:test` (`rls_whatsapp.test.sql`, testes "SEG5-1" e "SEG5-4").
