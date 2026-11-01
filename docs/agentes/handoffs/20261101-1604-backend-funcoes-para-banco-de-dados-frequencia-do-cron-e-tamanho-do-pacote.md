# Handoff: backend-funcoes para banco-de-dados, frequência do cron da materialização

**De:** backend-funcoes | **Para:** banco-de-dados | **Data:** 2026-11-01 16:04 (BRT) | **Branch:** `feat/tasks-materialize-cpu`

## Contexto

Para respeitar os 2 s de CPU por requisição das Edge Functions hospedadas, `materialize-occurrences` agora processa no máximo 200 tarefas (ou 600 ms de expansão) por execução e deixa o resto, começando pelas de cursor mais antigo, para a próxima. Com o cron diário (`0 6 * * *`, `materialize-occurrences-daily`), a capacidade é de 200 tarefas por dia: acima disso, cada tarefa é renovada a cada N/200 dias e a cobertura à frente cai de 60 para 60 menos N/200 dias.

## O que o destinatário precisa fazer

Quando houver mais de ~500 tarefas recorrentes (ainda não é o caso), ou já agora se quiser folga, trocar o agendamento por um mais frequente, por exemplo `*/15 * * * *`, numa migration nova (não edite a `20261101130900_materialize_cron.sql`). É seguro e barato: a função ignora tarefa cujo cursor está a menos de 12 h do limite, então uma execução sem trabalho lê a lista, não encontra nada e responde `{"inserted":0}` em ~15 ms. Quinze minutos dão ~19 mil tarefas por dia na capacidade atual.

Nada mais muda: URL, segredo e corpo `{}` são os mesmos.

## Bloqueios e dúvidas

- **Tamanho do pacote:** o pacote da função tem 15 MB. A documentação da Supabase dá o limite de 20 MB para empacotamento local pelo CLI e **5 MB para empacotamento no servidor** (Dashboard, Management API, `supabase functions deploy --use-api`). Faça o deploy pelo CLI com Docker, sem `--use-api`, ou o deploy falha.

## Como testar

`pnpm functions:test` com `pnpm exec supabase functions serve` (o teste "a run stops at its budget" cria 80 tarefas caras e chama o cron até todas terem cursor).
