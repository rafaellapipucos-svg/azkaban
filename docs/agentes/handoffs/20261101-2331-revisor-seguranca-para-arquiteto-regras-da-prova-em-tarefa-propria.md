# Handoff: revisor-seguranca para arquiteto, regras da prova em tarefa própria

**De:** revisor-seguranca
**Para:** arquiteto (a implementação cabe a `banco-de-dados`; a fila, a `prova-foto`)
**Data:** 2026-11-01 23:31 (BRT)
**Branch:** `chore/security-phase-3`

## Contexto

Revisão de segurança da Fase 3, com PoC contra a pilha local. Nenhum caminho deixa verde uma tarefa criada por um admin para um membro. Todos os itens abaixo dependem da exceção de "tarefa própria" (`created_by = assignee_id = auth.uid()`) do ADR-0007, seção 8, que não previu um admin impondo regra na tarefa de outra pessoa.

## O que foi entregue

Só este relatório. Nenhum código de produção mudou.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG-1, média. O membro desliga a foto que o admin exigiu.** A seção 9 do prompt mestre diz que o membro não consegue marcar verde uma tarefa com foto obrigatória sem prova válida. Reproduzido: o admin liga foto e aprovação por `edit_task` em uma tarefa criada pelo membro para si; o membro as desliga por `edit_task` e chama `set_occurrence_status(done)`. Resultado: `status = done`, `current_proof_id` nulo, 10 XP, e nada registra a mudança, porque `tasks` não tem histórico. Com uma prova já `in_review`, o caminho é desligar a aprovação, reabrir e reenviar: o XP sai sem revisão.

**SEG-2, média. O autor tira a prova do alcance do revisor depois de enviar.** Reproduzido em tarefa própria `group`:

- `edit_task` com `visibility = 'private'`: `review_proof` do admin dá `forbidden`, `proof-url` dá 403, e o XP continua no ranking do grupo (`xp_events.group_id` preenchido).
- `delete_task` com `all`: `review_proof` dá `forbidden`, e o XP fica.
- Prova contestada, depois `private`: o admin não consegue mais desfazer a contestação.

**Item 1 do handoff `20261101-2240-qa-testes-para-prova-foto-achados-do-qa` tem efeito de segurança.** Reproduzido: membro com prova `in_review` na tarefa própria chama `delete_task`, a revisão fica impossível, e a retenção, 90 dias depois, aprova com `reviewed_by` nulo e paga o XP. Em tarefa criada por admin, `can_delete_task` não deixa o membro arquivar (lido no código, sem PoC), então ali é só o defeito de tela já descrito.

Decisões pedidas:

1. Uma flag ligada por quem não é o dono continua sob a exceção? Sugestão: gravar quem exigiu (`proof_required_by`) e recusar `proof_flags_locked` ao dono quando for outra pessoa.
2. Recusar `visibility = 'private'` e o `delete_task` de `all` quando a tarefa tiver prova corrente em `group`, ou manter `can_review_proof` válido nesse caso. Sugestão: tirar `archived_at` de `can_review_proof`, o que também resolve a fila do item 1.
3. A retenção paga XP de prova em tarefa arquivada? Sugestão: não, e registrar a expiração.
4. Registrar mudança de `requires_photo_proof`, `requires_admin_approval` e `visibility`, para o admin ver quem mudou.

**SEG-8, baixa. A retenção apaga a foto contestada.** Reproduzido: `proofs_due_for_retention` não olha `review_status`, e a ocorrência fica em `missed`, `disputed`, sem a imagem que motivou a decisão. Decidir se a contestação estende o prazo, o que vira mais um item do aviso, ou se isso é aceito.

**SEG-9, baixa. Tarefa privada que vira de grupo mostra as fotos antigas ao admin.** Reproduzido: `proof-url` do admin dá 403 antes e 200 depois do `edit_task`. O aviso diz "Em tarefa privada, só você". Quem muda é o próprio dono, então bastaria um alerta na tela, ou gravar a visibilidade da prova.

**Riscos que o ADR já aceita, para confirmar com o humano:** prova para uma ocorrência 30 dias à frente fica verde e paga XP hoje (seção 8, Fase 6). Com raio de 150 m e precisão declarada de 200 m, uma leitura a 345 m não gera marca (seção 7).

## Bloqueios e dúvidas

Sem a decisão, `banco-de-dados` não tem o que implementar. SEG-1 e SEG-2 não bloqueiam a demonstração, mas contradizem a seção 9 enquanto admin puder exigir foto em tarefa de membro.

## Como testar

`pnpm db:start`. Com `supabase/functions/_shared/proof-kit.ts`: `newOccurrence` (tarefa própria com `approval` a escolher), `edit_task` como admin e como autor, `set_occurrence_status`, `upload`, `review_proof`. Confira `task_occurrences`, `xp_events` e `proof-url` depois de cada passo.
