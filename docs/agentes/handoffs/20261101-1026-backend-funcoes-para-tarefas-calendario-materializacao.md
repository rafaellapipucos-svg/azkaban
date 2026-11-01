# Handoff: backend-funcoes para tarefas-calendario, como chamar `materialize-occurrences` (F2-5)

**De:** backend-funcoes
**Para:** tarefas-calendario
**Data:** 2026-11-01 10:26 (BRT)

## Contexto

A Edge Function `materialize-occurrences` está pronta na branch `feat/tasks-materialize` (ADR-0005, seção 7). Só ela cria ocorrências de tarefa recorrente. Tarefa avulsa continua sendo coberta pelo trigger do banco.

## O que foi entregue

`POST {SUPABASE_URL}/functions/v1/materialize-occurrences`, com o JWT do usuário em `Authorization: Bearer ...`. No cliente: `supabase.functions.invoke('materialize-occurrences', { body })`, dentro de um repositório de `packages/data`.

Corpo, validado por `materializeRequestSchema` (`@azkaban/contracts`). Precisa de `taskIds`, de `until` ou dos dois; corpo vazio dá 400.

| Corpo                | Efeito                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| `{ taskIds }`        | Cada tarefa recorrente da lista, até hoje + `materializationWindowDays` (60) |
| `{ taskIds, until }` | Idem, até `until`                                                            |
| `{ until }`          | Todas as tarefas recorrentes que a RLS do usuário deixa ler, até `until`     |

Resposta 200, `materializeResponseSchema`: `{ "inserted": number }`, só as linhas realmente criadas.

| Status | Corpo                          | Quando                                                                            |
| ------ | ------------------------------ | --------------------------------------------------------------------------------- |
| 200    | `{ inserted }`                 | Sucesso, inclusive `0`                                                            |
| 400    | `{ error: 'invalid_request' }` | JSON inválido, `taskIds` vazio ou com mais de 100, `until` que não é instante ISO |
| 400    | `{ error: 'empty_request' }`   | Nem `taskIds` nem `until`                                                         |
| 401    | `{ error: 'unauthorized' }`    | Sem JWT, ou JWT inválido (a chave anon sozinha não vale)                          |
| 500    | `{ error: 'internal' }`        | Falha de banco. Repetir é seguro                                                  |

## O que o destinatário precisa fazer

1. **Quando chamar:**
   - depois de criar uma tarefa com `rrule` (o `insert` não cria ocorrências), com o `id` devolvido;
   - depois de `edit_task`, com os `uuid[]` que a RPC devolve (vazio: não chame);
   - ao navegar o calendário além da janela carregada, com `until` no fim do período visível.
2. A chamada é idempotente e pode ser repetida sem medo. Não bloqueie a tela nela: se falhar, o cron diário (06:00 UTC) repõe, e a lista de ocorrências já mostra o que existe.
3. **Não há erro para os casos silenciosos.** Devolvem `{ inserted: 0 }` sem sinal:
   - `taskIds` que o usuário não vê (RLS) ou que estão arquivadas;
   - tarefa de grupo cujo responsável saiu do grupo (nada é criado e o cursor não anda; ao reatribuir, a série continua de onde parou);
   - `until` acima de `onDemandMaxDays` (366 dias): é **cortado** nesse limite, não rejeitado. A resposta não informa o corte, então não peça além disso esperando receber.
4. `until` mais cedo que o cursor `materialized_until` da tarefa não faz nada. O cursor só anda para frente.
5. Depois de materializar, releia as ocorrências pelo repositório; a função não devolve as linhas.

## Contratos criados ou alterados

Nenhum. Usa `materializeRequestSchema` e `materializeResponseSchema` como estão.

## Bloqueios e dúvidas

- A mesma expansão corre em dois ambientes (Node nos testes, Deno na função), e `packages/core` funciona nos dois, mas só porque o `deno.json` da função mapeia os arquivos necessários (veja o relatório). **Se alguém criar um import novo sem extensão em `core/src/recurrence` ou em `contracts/src/tasks.ts`**, a função não sobe até o mapa ganhar a entrada. O teste de integração acusa na hora.
- Corrida conhecida: uma materialização em andamento durante um `edit_task` com mudança de agenda pode inserir ocorrências com a agenda antiga logo depois de a RPC apagar as pendentes. Janela de milissegundos, não tratada: a UI chama a função depois do retorno da RPC, então só um cron ou uma segunda aba coincidindo com a edição a alcança.

## Como testar

Com `pnpm db:start` rodando e `cp supabase/functions/.env.example supabase/functions/.env`:

```
pnpm exec supabase functions serve
node --test supabase/functions/materialize-occurrences/materialize.integration.test.ts
```
