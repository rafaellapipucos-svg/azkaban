# Handoff: revisor-seguranca para backend-funcoes, corpo e retenção

**De:** revisor-seguranca
**Para:** backend-funcoes
**Data:** 2026-11-01 23:31 (BRT)
**Branch:** `chore/security-phase-3`

## Contexto

Revisão de segurança da Fase 3, com PoC contra a pilha local. `proof-validate`, `proof-url` e `proof-retention` resistiram a JWT forjado, reuso e corrida de nonce, JPEG malicioso e segredo errado. Sobraram quatro ajustes.

## O que foi entregue

Só este relatório. Nenhuma função mudou.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG-4, média, bloqueia produção. A retenção pode nunca rodar, em silêncio.** `call_proof_retention` retorna sem erro nem log quando falta `proof_retention_url` ou `cron_secret` no Vault. Reproduzido: Vault vazio, `select public.call_proof_retention()` responde vazio, `net.http_request_queue` fica com 0 linhas e o cron segue ativo. O aviso promete apagar a foto em 90 dias, e os nomes dos segredos só aparecem em handoffs e no LOG. Sugestão: lista de implantação versionada e um alerta. Por exemplo, `raise warning` na função ou uma checagem de provas vencidas há mais de um dia.

**SEG-3, parte da função. Janela de órfãos.** Ver o handoff para `banco-de-dados`. Com a causa corrigida, a janela de 24 horas basta. Enquanto não for, ela é o que deixa o armazenamento crescer.

**SEG-6, baixa. `proof-url` lê o corpo inteiro antes de medir.** `await req.text()` vem antes de `MAX_BODY_CHARS`. Reproduzido com JWT válido: 120 MiB levaram 2,6 s até o 400, e 400 MiB derrubaram o worker com 546 `WORKER_LIMIT` e `memory limit reached` no log. Corrija com `readLimited` de `proof-validate/body.ts`. O limite de corpo do projeto hospedado não foi verificado.

**SEG-10, baixa. `appVersion` com NUL vira 500 depois de gastar o nonce.** `\u0000` passa em `proofUploadMetaSchema`, e o Postgres recusa no `commit_proof`. O objeto é removido e só o autor perde, então o efeito é pequeno, mas a recusa deveria ser 400 antes do passo 3. Esse ajuste é no contrato, com aprovação de `arquiteto`.

## Bloqueios e dúvidas

Confirmar no primeiro deploy se os logs de requisição do projeto hospedado guardam `x-proof-meta`, que leva as coordenadas. Na pilha local, Kong e Edge Runtime não registraram nenhuma.

## Como testar

`pnpm db:start`. Para SEG-6: `POST` em `proof-url` com corpo em stream de 400 MiB, e depois `docker logs supabase_edge_runtime_azkaban`. Para SEG-4: chame `public.call_proof_retention()` sem segredos no Vault e confira `net.http_request_queue`.
