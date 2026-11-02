# Handoff: revisor-seguranca para banco-de-dados, limites e cascata

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-01 23:31 (BRT)
**Branch:** `chore/security-phase-3`

## Contexto

Revisão de segurança da Fase 3, com PoC contra a pilha local. RLS, grants, `search_path` e barreiras de status resistiram. Sobraram dois efeitos de cascata.

## O que foi entregue

Só este relatório. Nenhuma migration.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG-3, média. Apagar o grupo zera todos os limites de prova.** Os três limites de `issue_proof_challenge` contam linhas de `proof_challenges` e `task_proofs`, e ambas caem em cascata com a ocorrência. Reproduzido só com a API pública, por um usuário novo com JWT comum: criar grupo, contexto e tarefas, enviar 30 fotos de 2 MiB, receber `challenge_rate_limited`, `DELETE` em `groups`, repetir. Duas voltas na mesma hora deram 60 provas, 0 linhas de limite e 120 MiB de objetos órfãos, que a limpeza só remove depois de 24 horas. O teto do ADR-0007, seção 17 (30 × 2 MiB por dia), deixa de valer, e o plano Free tem 1 GB. Sugestão: o limite passa a contar algo que não cai em cascata, como `proof_challenges.occurrence_id` com `on delete set null` e `user_id` preservado, ou um contador por usuário. A janela de órfãos é de `backend-funcoes`.

**SEG-7, baixa. Excluir a conta apaga a prova, ao contrário do que o schema diz.** `task_proofs.user_id` tem `on delete set null` e o comentário diz que o registro fica como auditoria, mas `tasks.assignee_id` e `task_occurrences.assignee_id` têm `on delete cascade`. Reproduzido: `auth.admin.deleteUser` deixou 0 linhas em `task_proofs` e 1 objeto no bucket. Isso pode até ser o certo para a LGPD, mas `arquiteto` e F8-3 precisam decidir qual dos dois vale. Hoje `can_review_proof` trata um autor nulo que, nesse caminho, nunca chega a existir.

## Bloqueios e dúvidas

SEG-7 depende da decisão de F8-3, e não precisa de migration até lá.

## Como testar

`pnpm db:start`. Um usuário cria o grupo por `from('groups').insert`, faz 30 provas, apaga o grupo e pede outro desafio: hoje funciona. Depois da correção, deve responder `challenge_rate_limited`.
