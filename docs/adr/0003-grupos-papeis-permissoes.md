# ADR-0003: Grupos, papéis e permissões

**Status:** proposto, aguardando validação do humano na Fase 0. A implementação é da Fase 1.

## Contexto

Uma pessoa pode pertencer a vários grupos. O admin da Casa A não pode ver nada do trabalho da mesma funcionária na Casa B, e tarefas pessoais nunca aparecem para admins.

## Decisão

- Papel é por grupo: `owner`, `admin` ou `member`, em `group_members`.
- A matriz fica nas tabelas `permissions` e `role_permissions`, espelhada em `packages/core/src/permissions` para a UI.
- O código sempre pergunta `can(user, 'task.create_for_others', group)`, nunca compara o papel.
- A segurança real é RLS no Postgres, com `is_group_member(group_id)` e `has_permission(group_id, permission)`. O espelho no cliente só esconde botões.
- A visibilidade de uma tarefa deriva do contexto: sem grupo ou marcada como privada, só o responsável vê; com grupo, só quem tem permissão naquele grupo.
- Um teste no CI confere que o espelho e a seed do banco são iguais.

## Alternativas

- **Papel global por usuário:** não representa a funcionária em duas casas.
- **Permissões só na aplicação:** um cliente adulterado leria dados de outro grupo.
- **Claims no JWT:** evita consultas, mas fica desatualizado até o token renovar.

## Consequências

- Toda tabela precisa de política RLS e de teste. As consultas fazem checagens extras, então os índices em `group_members` são obrigatórios.
- Regra padrão: o membro não exclui tarefa atribuída por admin, mas pode mudar o estado e comentar. É configurável pela matriz.
