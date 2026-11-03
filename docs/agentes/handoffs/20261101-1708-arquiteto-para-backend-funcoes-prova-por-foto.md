# Handoff: arquiteto para backend-funcoes, prova por foto (F3-3 e F3-7)

**De:** arquiteto
**Para:** backend-funcoes
**Data:** 2026-11-01 17:08 (BRT)

## Contexto

Três funções novas, seguindo o [ADR-0007](../../adr/0007-prova-por-foto.md), que prevalece sobre este resumo: seções 3 a 7 para `proof-validate`, 12 para `proof-url`, 14 para `proof-retention`.

## O que foi entregue

Branch `feat/proof-contracts`, a partir de `feat/phase-3-proof`.

## Contratos criados ou alterados

- `packages/contracts/src/proof.ts`: `proofMetaHeader`, `proofUploadMetaSchema`, `proofResultSchema`, `proofUrlInputSchema`, `proofUrlSchema`, `proofErrorCodeSchema`.
- `packages/config/src/proof.ts`: `proofRules` e `proofDefaults`.

As RPCs estão no handoff para `banco-de-dados`, de mesma data. Espere F3-2.

## O que o destinatário precisa fazer

**`proof-validate`.** `verify_jwt` no padrão. CORS como em `materialize-occurrences`, com `x-proof-meta` a mais em `access-control-allow-headers`. Erros como `{ "error": <ProofErrorCode> }`.

Siga esta ordem, porque cada etapa é mais cara que a anterior:

1. Usuário pelo JWT, como a função existente. Falha: 401.
2. Sem consumir o nonce: `Content-Type` igual a `proofRules.contentType` (415, `proof_bad_type`), `Content-Length` acima de `maxBytes` (413, `proof_too_large`), `x-proof-meta` por `decodeURIComponent` e `proofUploadMetaSchema` (400).
3. `claim_proof_challenge`. Depois deste ponto, qualquer falha gasta o nonce.
4. Leia `req.body` em fluxo, somando bytes. Passou de `maxBytes`: cancele e responda 413. Vale sem `Content-Length`. Limite de `uploadTimeoutSeconds`. Não use `req.arrayBuffer()`: ele lê tudo antes de você poder recusar.
5. Bytes: início `FF D8 FF`, fim `FF D9`, senão `proof_bad_type`. Percorra os segmentos até um marcador SOF (`FFC0` a `FFCF`, exceto `C4`, `C8` e `CC`) e leia altura e largura, sem decodificar. Faltou SOF, ou fora de `[minEdgePx, maxEdgePx]`: `proof_bad_dimensions`.
6. `crypto.subtle.digest('SHA-256', bytes)`. Diferente de `meta.sha256`: `proof_hash_mismatch`. Guarde o seu.
7. `select` por `sha256`: existe, `proof_duplicate`. O `unique` é a barreira real, isto só evita um upload à toa.
8. Com local no contexto, haversine contra `meta.location`, seguindo a seção 7. Calcule `flags`. Com `outOfRadius = 'block'`, `proof_out_of_radius`. Sem local no contexto, ignore o que veio. **Nunca grave nem registre coordenadas.**
9. `clock_mismatch`: seção 5. `clock_delta_seconds` sai do `commit_proof`.
10. Upload em `task-proofs`, caminho `<occurrence_id>/<nonce>.jpg`, `contentType` fixo, `upsert: false`.
11. `commit_proof`. Falhou: remova o objeto e responda o código recebido. A resposta valida com `proofResultSchema`.

`user_agent` vem do cabeçalho da requisição, cortado em 256.

Logs: etapa e código. Nunca nonce, hash, coordenadas, caminho ou nome.

**`proof-url`.** Corpo com `proofUrlInputSchema`. Leia `task_proofs` com o JWT do usuário, então a RLS decide; sem linha, 403. Depois, com service role, leia `storage_path` e crie a URL assinada por `signedUrlTtlSeconds`. `photo_deleted_at` preenchido: `proof_photo_deleted`. Resposta em `proofUrlSchema`.

**`proof-retention`.** `verify_jwt = false` e `x-cron-secret`, com a comparação de tempo constante que já existe. A cada execução:

1. `proofs_due_for_retention(retentionBatchSize)`.
2. Remove os objetos pela API do Storage. Nunca por SQL.
3. `mark_proof_photo_deleted` por prova, depois de remover.
4. `orphan_proof_objects`, remove, e `delete_stale_proof_challenges`.

Repetir tem de ser seguro. Interrompida no meio, a próxima execução continua de onde parou. Respeite os 2 s de CPU, como `materialize-occurrences`.

**Testes.** Acrescente a `functions:test` em `package.json`, e no CI se ainda não entrar por lá. `deno.json` de cada função mapeia `@azkaban/contracts` e `@azkaban/config` para `proof.ts`, além de `common` e `tasks`. Atenção: `proof.ts` importa `./tasks`, que importa `./recurrence`.

## Bloqueios e dúvidas

- Depende de F3-2.
- **O limite de corpo de uma Edge Function hospedada não está documentado.** Teste `maxBytes` no local, e registre no LOG. A confirmação no projeto hospedado fica para o primeiro deploy. Se falhar, a saída é a alternativa de upload assinado do ADR, e o arquiteto decide.
- Meça CPU real em `proof-validate` com 2 MiB. A medição do ADR foi no Node.

## Como testar

`pnpm db:start`, `pnpm exec supabase functions serve`, `pnpm functions:test`.

Casos que precisam existir, com um JPEG real pequeno como fixture:

1. Caminho feliz: ocorrência `done`, objeto em `task-proofs`, hash no banco igual ao dos bytes.
2. Sem JWT e com JWT de anon: 401, sem consumir nonce.
3. Nonce de outro usuário, vencido, usado, e dois envios simultâneos do mesmo nonce: um só vence, e existe um objeto.
4. `Content-Length` acima do limite: 413, nonce intacto.
5. Corpo sem `Content-Length` acima do limite: 413, e o streaming para no limite.
6. Corpo que para no meio: encerra pelo limite de tempo.
7. Exatamente `maxBytes` passa, e `maxBytes + 1` não.
8. PNG, HTML com `Content-Type: image/jpeg`, JPEG truncado sem `FF D9`: `proof_bad_type`.
9. JPEG 1×1, e cabeçalho de 65535×65535: `proof_bad_dimensions`.
10. Hash diferente: `proof_hash_mismatch`, nada gravado.
11. Mesmos bytes num segundo desafio: `proof_duplicate`.
12. Falha do Storage: ocorrência sem mudança.
13. Falha de `commit_proof` depois do upload (ocorrência cancelada no meio): objeto removido.
14. Dentro e fora do raio, sem leitura e com precisão pior que `maxLocationAccuracyM`, com `flag` e `block`.
15. Coordenadas somem: nenhuma coluna ou log as contém.
16. Relógio do aparelho 10 minutos adiantado: prova aceita com `clock_mismatch`.
17. `x-proof-meta` inválida ou com texto grande: 400.
18. Preflight `OPTIONS` aceita `x-proof-meta`.
19. `proof-url`: autor e admin recebem, colega e ex-membro não, admin em tarefa privada não. A URL lê o objeto, e deixa de ler depois do prazo.
20. `proof-retention`: sem o segredo, 401. Prova vencida perde o objeto e fica a linha. Em `in_review`, aprova uma vez. Repetir não falha. Órfão de mais de 24 horas sai, e um de 1 hora fica.
