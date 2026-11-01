# Handoff: backend-funcoes para prova-foto, funções de prova (F3-3 e F3-7)

**De:** backend-funcoes
**Para:** prova-foto
**Data:** 2026-11-01 19:01 (BRT)

## Contexto

As três funções do [ADR-0007](../../adr/0007-prova-por-foto.md) existem e foram testadas contra a pilha local: `proof-validate`, `proof-url` e `proof-retention` (esta última é só do cron, o app não a chama). Este handoff traz o pedido e a resposta exatos das duas que o app usa.

## O que foi entregue

Branch `feat/proof-functions`, a partir de `feat/phase-3-proof`. Código em `supabase/functions/proof-validate`, `proof-url`, `proof-retention` e `_shared`. Sem migration nova.

## Contratos criados ou alterados

Nenhum. Uso `proofUploadMetaSchema`, `proofResultSchema`, `proofUrlInputSchema`, `proofUrlSchema` e `proofErrorCodeSchema` como estão. Cinco códigos de transporte ficam **fora** de `proofErrorCodeSchema`, como já acontece em `materialize-occurrences`: `unauthorized` (401), `invalid_request` (400), `method_not_allowed` (405), `upload_timeout` (408) e `internal` (500). O arquiteto decide se `upload_timeout` entra no contrato; o app trata os cinco como "tente de novo" ou "erro genérico".

## O que o destinatário precisa fazer

### `proof-validate`

`POST {SUPABASE_URL}/functions/v1/proof-validate`

| Cabeçalho       | Valor                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `Authorization` | `Bearer <access token do usuário>`. A chave anon, ou a de serviço, dá 401 `{ "error": "unauthorized" }` |
| `apikey`        | A chave anon, como o `supabase-js` manda                                                                |
| `Content-Type`  | `image/jpeg`. Parâmetros como `; charset=...` são aceitos                                               |
| `x-proof-meta`  | `encodeURIComponent(JSON.stringify(meta))`, no máximo 4096 caracteres                                   |

Corpo: os bytes do JPEG, no máximo `proofRules.maxBytes` (2.097.152). Não é multipart nem base64. O navegador calcula o `Content-Length` sozinho; o `User-Agent` vai do cabeçalho da requisição (o servidor corta em 256).

`meta` é `proofUploadMetaSchema`:

```json
{
  "nonce": "<nonce de issue_proof_challenge>",
  "sha256": "<64 hexadecimais minúsculos dos bytes que vão no corpo>",
  "capturedAtDevice": "2026-11-01T19:01:00.000Z",
  "location": { "lat": -23.5505, "lng": -46.6305, "accuracyM": 12 },
  "platform": "web",
  "appVersion": "1.0.0"
}
```

`location` é `null` quando o contexto não tem local, ou o usuário recusou, ou o aparelho não leu. Sem local no contexto, o servidor **ignora** o que vier. As coordenadas nunca são gravadas nem registradas.

**Sucesso, 200**, `proofResultSchema`:

```json
{
  "proofId": "…",
  "occurrenceId": "…",
  "status": "done",
  "reviewStatus": "unreviewed",
  "receivedAt": "2026-11-01T22:01:03.123456+00:00",
  "late": false,
  "flags": []
}
```

`reviewStatus` é `in_review` quando a tarefa pede aprovação. `flags` pode trazer `out_of_radius`, `location_missing` e `clock_mismatch`: avisos, a prova vale. `receivedAt` é o horário oficial (o instante em que o nonce foi gasto), com offset `+00:00`.

**Erros**, sempre `{ "error": "<código>" }`:

| Status | `error`                                                       | Quando                                                                                                                     | Nonce gasto? |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 401    | `unauthorized`                                                | Token sem usuário (anon, serviço, vencido)                                                                                 | não          |
| 401    | (do gateway) `{ code, message, msg }`                         | Sem `Authorization`. Corpo é do gateway, não da função                                                                     | não          |
| 405    | `method_not_allowed`                                          | Não é `POST` nem `OPTIONS`                                                                                                 | não          |
| 415    | `proof_bad_type`                                              | `Content-Type` diferente de `image/jpeg`                                                                                   | não          |
| 413    | `proof_too_large`                                             | `Content-Length` acima de 2 MiB                                                                                            | não          |
| 400    | `invalid_request`                                             | `x-proof-meta` ausente, ilegível, fora do schema, ou com mais de 4096 caracteres                                           | não          |
| 409    | `challenge_invalid`                                           | Nonce desconhecido, de outro usuário, ou a ocorrência foi reaberta depois que ele foi emitido                              | não          |
| 409    | `challenge_used`                                              | Nonce já gasto                                                                                                             | —            |
| 410    | `challenge_expired`                                           | Passou dos 5 minutos                                                                                                       | não          |
| 403    | `forbidden`                                                   | Tarefa arquivada, ocorrência de outro responsável, ou saiu do grupo                                                        | não / sim    |
| 409    | `proof_not_required`, `occurrence_not_open`, `proof_disputed` | A situação mudou desde o desafio                                                                                           | não          |
| 409    | `late_window_expired`                                         | Fora de `overdue_at + 72 h`                                                                                                | não          |
| 413    | `proof_too_large`                                             | O corpo passou de 2 MiB, mesmo sem `Content-Length`                                                                        | **sim**      |
| 408    | `upload_timeout`                                              | O corpo parou de chegar por 30 s                                                                                           | **sim**      |
| 400    | `invalid_request`                                             | A conexão caiu no meio do corpo                                                                                            | **sim**      |
| 415    | `proof_bad_type`                                              | Os bytes não são um JPEG inteiro: sem `FF D8 FF` no início, sem `FF D9` no fim, estrutura quebrada, ou vazio               | **sim**      |
| 422    | `proof_bad_dimensions`                                        | Largura ou altura fora de 320 a 2048, lidas do cabeçalho do JPEG                                                           | **sim**      |
| 422    | `proof_hash_mismatch`                                         | `meta.sha256` difere do hash que o servidor calculou                                                                       | **sim**      |
| 409    | `proof_duplicate`                                             | Os mesmos bytes já são uma prova (de qualquer ocorrência). Releia a ocorrência: pode ser o reenvio de uma resposta perdida | **sim**      |
| 422    | `proof_out_of_radius`                                         | Só com `proofRules.outOfRadius = 'block'` (hoje `flag`)                                                                    | **sim**      |
| 409    | `challenge_invalid`                                           | A ocorrência foi reaberta enquanto a foto subia                                                                            | **sim**      |
| 403    | `forbidden`                                                   | A tarefa foi arquivada, ou a pessoa saiu do grupo, enquanto a foto subia                                                   | **sim**      |
| 500    | `internal`                                                    | Falha do Storage ou do banco. A resposta pode ter se perdido com a prova já gravada: releia a ocorrência antes de tentar   | **sim**      |

Depois de qualquer erro com "sim", peça **outro desafio**. Antes de tentar de novo, releia a ocorrência (ADR seção 16). Uma foto mantida na tela pode ir com o novo nonce; `clock_mismatch` denuncia se demorar demais.

Comportamentos que o app precisa respeitar:

- **A resposta só chega depois que o corpo termina de ser enviado.** O runtime da Supabase segura a resposta da função até o remetente fechar o corpo. Não cancele a requisição esperando uma recusa antecipada, e não mostre "falhou" por falta de resposta antes do tempo da própria requisição.
- **Uma tentativa por nonce.** Reenviar o mesmo nonce, mesmo com outros bytes, dá `challenge_used`. Dois envios simultâneos do mesmo nonce: um vence, os outros recebem `challenge_used`.
- O hash é dos bytes **exatos** do corpo, depois de reduzir, carimbar e codificar.
- CORS: o preflight `OPTIONS` devolve 204 e libera `authorization, x-client-info, apikey, content-type, x-proof-meta`.

### `proof-url`

`POST {SUPABASE_URL}/functions/v1/proof-url`, `Authorization: Bearer <token do usuário>`, `Content-Type: application/json`.

Pedido, `proofUrlInputSchema`: `{ "proofId": "<task_proofs.id>" }`. Corpo de até 1024 caracteres.

**Sucesso, 200**, `proofUrlSchema`:

```json
{
  "url": "https://<projeto>.supabase.co/storage/v1/object/sign/task-proofs/<ocorrência>/<nonce>.jpg?token=…",
  "expiresInSeconds": 60
}
```

A URL serve o JPEG (`content-type: image/jpeg`) por 60 s, sem login. Peça outra a cada abertura da foto, e não a guarde.

**Local:** a função roda dentro do Docker, onde `SUPABASE_URL` é `http://kong:8000`, e a URL sai com esse host, que o navegador não alcança. Em produção é o endereço público. No ambiente local, troque a origem pela do seu `EXPO_PUBLIC_SUPABASE_URL`, mantendo o caminho e a query.

**Erros**:

| Status | `error`               | Quando                                                                                                                                                          |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `unauthorized`        | Token sem usuário. Sem `Authorization`, o gateway responde 401 com o corpo dele                                                                                 |
| 400    | `invalid_request`     | Corpo vazio, não JSON, sem `proofId`, com id inválido, ou grande demais                                                                                         |
| 403    | `forbidden`           | A RLS não devolveu a linha: colega, ex-membro (autor ou não), admin em tarefa privada, ou prova que não existe. As quatro respostas são idênticas, de propósito |
| 410    | `proof_photo_deleted` | A retenção já removeu a foto (a linha fica, sem a imagem)                                                                                                       |
| 405    | `method_not_allowed`  | Não é `POST` nem `OPTIONS`                                                                                                                                      |
| 500    | `internal`            | Falha do banco ou do Storage                                                                                                                                    |

Quem vê (testado): o autor com acesso atual à tarefa, `owner` e `admin` do grupo em tarefa `group`. Não vê: outro membro, ex-membro, admin em tarefa privada.

### `proof-retention`

Só do cron (`x-cron-secret`). O app não chama. Resposta de contagens: `{ photosRemoved, proofsMarked, orphansRemoved, challengesDeleted, moreDue }`.

## Bloqueios e dúvidas

- **Limite de corpo hospedado, ainda sem número na documentação.** A função aceita exatamente 2.097.152 bytes localmente e recusa 2.097.153. A primeira implantação precisa repetir esse teste no projeto hospedado.
- **Latência.** Medido localmente com 2 MiB: leitura do corpo 34 a 106 ms, SHA-256 1,4 a 5,7 ms (38 ms na primeira chamada de um worker), resposta inteira 181 a 784 ms. Um worker frio leva cerca de 2 s a mais na primeira chamada.

## Como testar

`pnpm exec supabase start`, `cp supabase/functions/.env.example supabase/functions/.env`, `pnpm exec supabase functions serve`, e em outro terminal `pnpm functions:test`. Os arquivos `validate.integration.test.ts`, `url.integration.test.ts` e `retention.integration.test.ts` são exemplos executáveis de cada chamada, e `_shared/proof-kit.ts` monta o pedido com `x-proof-meta`.
