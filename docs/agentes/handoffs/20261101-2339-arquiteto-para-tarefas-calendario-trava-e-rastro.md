# Handoff: arquiteto para tarefas-calendario, trava das regras e rastro

**De:** arquiteto
**Para:** tarefas-calendario
**Data:** 2026-11-01 23:39 (BRT)
**Branch:** `docs/proof-security-decisions`

## Contexto

Decisões de SEG-1, SEG-2 e SEG-9 na [seção 20 do ADR-0007](../../adr/0007-prova-por-foto.md). O servidor decide tudo: aqui é só espelho e tela. Depende das migrations 1 a 4 do handoff para `banco-de-dados`, e de `pnpm db:types`.

## O que foi entregue

ADR-0007 atualizado e contratos.

## Contratos criados ou alterados

- `taskSchema.proofFlagsLocked`. Tem `default(false)` só para não quebrar antes da migration. Ao ler a coluna, passe o valor, e pode retirar o `default`: o `arquiteto` aprova.
- `taskRuleChangeSchema`, `TaskRuleChange`, `taskRuleFieldSchema`.
- `taskErrorCodeSchema`: `proof_visibility_locked`. `proof_flags_locked` vale em mais casos.

## O que o destinatário precisa fazer

**1. Dados, `packages/data/src/tasks/index.ts`.** Selecione `proof_flags_locked` nos dois lugares, leve-a a `OccurrenceListItem.task` e a `taskSchema.parse`. Novo `listRuleChanges(taskId)`, com `taskRuleChangeSchema`, as mais recentes primeiro.

**2. Espelho, `packages/core/src/tasks/actors.ts`.**

- `ActorSubject` ganha `proofFlagsLocked`, e `deleter` passa a `(own && !proofFlagsLocked) || manages || mayDeleteAssigned`. `editor` não muda.
- `proofFlagsLocked(user, ...)` passa a `!(manages || (own && !locked))`.

**3. Formulário, `TaskFormScreen`.** Com a tarefa travada e `proofLocked`, os dois interruptores ficam como já ficam, e o de privada também não muda. Reescreva `proof_flags_locked` em `tasks.json`, porque "quem criou" deixa de ser verdade: "Um administrador definiu as regras de foto desta tarefa. Só quem administra o grupo pode mudá-las."

**4. Erro novo em `tasks.json`.** `errors.proof_visibility_locked`: "Esta tarefa já tem foto enviada, então não pode mudar entre privada e do grupo. Crie outra tarefa." Não antecipe no formulário: a lista de provas não está no cliente, e a recusa do servidor basta.

**5. Detalhe, `TaskDetailScreen`.** Bloco "Mudanças nas regras", só quando houver linhas: quem, quando, e a frase da regra ("desligou a foto obrigatória", "ligou a aprovação", "tornou privada"), em i18n, a partir de `field` e `toValue`. Sem paginação: são poucas linhas. O autor nulo mostra o mesmo texto de pessoa removida que o histórico de status já usa, se houver.

## Bloqueios e dúvidas

Espere as migrations. `edit_task` responde `proof_flags_locked` também ao levar uma tarefa travada a `private`.

## Como testar

`pnpm check`, com testes em `actors.test.ts` para os dois espelhos: dono com trava não é `deleter` e não muda as flags; admin muda; dono sem trava segue como hoje. Na E2E: o admin liga a foto na tarefa do membro, o membro vê os interruptores travados e sem "Excluir", e o detalhe mostra a mudança com o nome do admin.
