# Handoff: design-system para notificacoes-whatsapp, ícones e splash do Broto (F8-7)

**De:** design-system
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 06:33 (BRT)
**Branch:** `feat/ui-polish`, a partir de `feat/phase-8-polish` (`d2c8d4e`)

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 11: arte original do Broto para ícone e splash, em 1024 px. Os arquivos de `apps/app/assets` e de `apps/app/public` ainda são os do modelo do Expo (o "A" azul com a grade), e o `app.config.ts` não é do `design-system`.

## O que foi entregue

Em `packages/ui/assets/brand/`, gerados por `pnpm --filter @azkaban/ui brand` (`packages/ui/scripts/render-brand.mjs`, Chromium do Playwright) a partir de `packages/ui/src/mascotArt.ts` (a mesma geometria do `<Mascot>`) e de `brandPalette` em `tokens.ts`:

| Arquivo                                                | Tamanho       | Fundo                               | Para                                                                   |
| ------------------------------------------------------ | ------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `icon.png`                                             | 1024          | `colors.background`, sem alfa (RGB) | `icon` (iOS e padrão)                                                  |
| `android-icon-foreground.png`                          | 1024          | transparente                        | `android.adaptiveIcon.foregroundImage`; dentro do círculo de 66/108 dp |
| `android-icon-monochrome.png`                          | 1024          | transparente, uma cor               | `android.adaptiveIcon.monochromeImage` (ícone temático)                |
| `splash-icon.png`                                      | 1024          | transparente                        | `expo-splash-screen` `image`                                           |
| `notification-icon.png`                                | 96            | branco no transparente              | `expo-notifications` `icon` (Android pinta pelo alfa)                  |
| `favicon.png`                                          | 48            | transparente                        | `web.favicon`                                                          |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | 192, 512, 180 | `colors.background`                 | `apps/app/public` (manifesto e iOS)                                    |
| `icon-maskable-512.png`                                | 512           | `colors.background`                 | entrada `purpose: "maskable"` do manifesto (círculo de 80%)            |

## Contratos criados ou alterados

Nenhum. `tokens.ts` ganhou `mascotColors.eye` e `brandPalette`.

## O que o destinatário precisa fazer

1. Copiar os PNGs para `apps/app/assets/` (os seis primeiros, por cima dos do modelo) e para `apps/app/public/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`), ou apontar o `app.config.ts` direto para `../../packages/ui/assets/brand/...`. `android-icon-background.png` sai: o fundo vira cor.
2. `app.config.ts`, com as cores lidas de `../../packages/ui/src/tokens` (como o `tailwind.config.ts`; esse arquivo não tem import em tempo de execução):

   ```ts
   icon: './assets/icon.png',
   android: {
     adaptiveIcon: {
       foregroundImage: './assets/android-icon-foreground.png',
       monochromeImage: './assets/android-icon-monochrome.png',
       backgroundColor: colors.background,
     },
   },
   plugins: [
     ['expo-splash-screen', {
       image: './assets/splash-icon.png',
       imageWidth: 200,
       backgroundColor: colors.background,
       dark: { image: './assets/splash-icon.png', backgroundColor: colors['background-dark'] },
     }],
     ['expo-notifications', { icon: './assets/notification-icon.png', color: colors.primary }],
   ],
   ```

   O Broto (`#7C4DFF`) contra `background-dark` dá 3,8:1, contra `background` 4,6:1.

3. `manifest.webmanifest`: a entrada `maskable` passa a ser `/icon-maskable-512.png`.
4. Conferir com `npx expo config --type public` e, numa pasta descartável, `npx expo prebuild --platform android --no-install` (o ADR já pede).

## Bloqueios e dúvidas

Nenhum. Se o mascote ou a paleta mudarem, rodar `pnpm --filter @azkaban/ui brand` e copiar de novo.

## Como testar

Abrir os PNGs; `pnpm --filter @azkaban/ui test` (`mascotArt.test.ts` confere zonas seguras, fundos e silhuetas).
