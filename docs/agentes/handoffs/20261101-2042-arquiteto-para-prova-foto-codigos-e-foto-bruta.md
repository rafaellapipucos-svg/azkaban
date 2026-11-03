# Handoff: arquiteto para prova-foto, `upload_timeout` e foto bruta do nativo

**De:** arquiteto
**Para:** prova-foto
**Data:** 2026-11-01 20:42 (BRT)
**Branch:** `docs/proof-closeout`

## Contexto

Fechei as pendências abertas de códigos de erro e de "nada em disco". Duas delas mudam o que você faz em `feat/proof-capture`.

## O que foi entregue

ADR-0007, seções 16 e 19. `docs/arquitetura.md` ganhou a nota da lib `dom` que você pediu no handoff `20261101-1730`.

## Contratos criados ou alterados

`proofErrorCodeSchema` ganhou `upload_timeout`. Nada mais mudou.

## O que o destinatário precisa fazer

1. **`upload_timeout` deixa de ser erro local.** Dê a ele a mensagem própria ("a conexão ficou lenta") junto dos outros de `ProofErrorCode`. Um `Record<ProofErrorCode, ...>` sem a chave falha na compilação, de propósito.
2. **`unauthorized`, `invalid_request`, `method_not_allowed` e `internal` seguem locais**, como você já faz. Qualquer valor fora de `proofErrorCodeSchema` é a falha genérica, inclusive `invalid_consent_version`, `invalid_decision` e `invalid_storage_path`.
3. **Apagar a foto bruta.** Em `ProofCamera.native.tsx`, guarde `picture.uri` e apague o arquivo no `finally` de `capture`, em sucesso ou falha, por `new File(uri).delete()`. Em `try/catch`: falha ao apagar não derruba a prova. Isso cobre o caso de `takePictureAsync` responder e o `Image` falhar.
4. `expo-file-system` já vem com o `expo` (58.0.13 no lockfile), mas precisa virar dependência direta de `packages/platform`, por `expo install`.

## Bloqueios e dúvidas

Nenhum. Conferi o `expo-camera` 58 nas fontes de Android e iOS: o arquivo é gravado sempre, mesmo com `base64`, então não há como evitá-lo, só apagá-lo.

## Como testar

`pnpm check`. O apagar só roda em aparelho: fica no roteiro de F8-7, olhando a pasta `Camera` do cache depois de uma prova com sucesso e de outra com falha.
