# Handoff: prova-foto para orquestrador, plugins nativos e contrato da câmera (F3-4)

**De:** prova-foto | **Para:** orquestrador (e `arquiteto`, dono de `apps/app/app.config.ts` e do `docs/arquitetura.md`) | **Data:** 2026-11-01 17:30 (BRT) | **Branch:** `feat/proof-camera`

## Contexto

F3-4 entregou os adapters de câmera, carimbo, compressão, SHA-256 e geolocalização em `packages/platform`. Dois arquivos que preciso mexer estão fora do meu escopo.

## O que precisa ser feito

1. **`apps/app/app.config.ts`, `plugins`.** Sem os plugins, o build nativo não leva as chaves de permissão do iOS (`NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`) nem as permissões do Android. A F8-7 depende disso, e o `expo export` não acusa a falta. Proposta:

   ```ts
   plugins: [
     'expo-router',
     'expo-font',
     ['expo-camera', { cameraPermission: '<texto em pt-BR>', recordAudioAndroid: false }],
     ['expo-location', { locationWhenInUsePermission: '<texto em pt-BR>' }],
   ],
   ```

   `recordAudioAndroid: false` evita que o app peça `RECORD_AUDIO` sem usar o microfone. Os textos aparecem ao usuário e devem seguir o aviso da seção 14 do ADR-0007: câmera só para a foto da prova, localização só no momento da foto e só quando o contexto tem local.

2. **`docs/arquitetura.md`, seção "Adapters de plataforma".** O `tsconfig.json` de `packages/platform` passou a incluir a lib `dom`, porque os adapters `.web` usam `MediaStream`, `canvas` e `navigator`. Só esse pacote vê os tipos do DOM, o resto segue sem eles. Vale uma linha ali. Os arquivos que não são visuais (`sha256`, `geolocation`) seguem o padrão de `keyboard`: o arquivo sem sufixo é a versão nativa, e o `.web.ts` a substitui no Metro.

## Contrato para quem usa (F3-5)

Tudo sai de `@azkaban/platform`.

- `<ProofCamera facing label onStatusChange ref />` preenche o pai. `ref.capture({ taskTitle, userName, locale, timeZone? })` devolve `ProofPhoto`: `bytes`, `mimeType`, `width`, `height` (lidos do cabeçalho do JPEG), `sha256` e `capturedAt` (instante do aparelho, pronto para `meta.capturedAtDevice`). O carimbo, a redução para `captureLongEdgePx`, a qualidade e o hash já estão feitos.
- `onStatusChange({ permission, reason? })`: `prompt`, `granted` (preview ao vivo, e só então `capture` funciona), `denied` e `unavailable` (`reason`: `no_device`, `in_use`, `insecure_context`, `unsupported`, `error`). Para perguntar de novo depois de uma recusa, remonte com outra `key`.
- Erros de `capture` são `PhotoError` com `code`: `not_ready`, `too_small`, `too_large`, `encode_failed`. Precisam de texto em i18n na F3-5.
- `getLocationPermission()` lê o estado sem perguntar. `readLocation({ timeoutMs? })` pede a permissão se o sistema ainda deixar, faz uma leitura e nunca lança: devolve `{ status: 'ok', location: { lat, lng, accuracyM } }` ou `{ status: 'denied' | 'unavailable' | 'timeout' }`. A tela mostra o aviso antes de chamar.
- `sha256Hex(bytes)` também é exportado.

## O que a F3-5 ainda precisa resolver

- A tela de conferir precisa mostrar os bytes. Hoje `ProofPhoto` não traz URI de pré-visualização. Na web serve `URL.createObjectURL`, e no nativo um `data:` URI. Isso fica para quando a tela existir, para não criar um contrato sem uso.
- Mensagens de `PhotoError` e de `CameraStatus` em `packages/i18n`.

## Como testar

`pnpm --filter @azkaban/platform test` roda a lógica pura e o adapter web de geolocalização e de hash. O que roda o navegador de verdade (stream, captura, pixels, hash, parada ao desmontar, recusa) foi um teste temporário com Playwright e `--use-fake-device-for-media-stream`, que não ficou no repositório. A descrição está na entrada do LOG.
