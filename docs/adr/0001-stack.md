# ADR-0001: Stack

**Status:** proposto, aguardando validação do humano na Fase 0.

## Contexto

Um único código deve servir à web agora e a iOS e Android depois, sem reescrita. A seção 4 do prompt mestre recomenda a stack.

## Decisão

Adotar a stack recomendada sem trocas: pnpm + Turborepo, Expo com Expo Router e React Native Web, TypeScript strict, NativeWind, TanStack Query, Zustand, React Hook Form + Zod, date-fns, rrule, i18next, Supabase, Vitest, Playwright, dependency-cruiser para fronteiras e GitHub Actions.

Moti, Lottie, TanStack Query, Zustand, formulários, datas, rrule e Playwright entram na fase que os usar primeiro, não na fundação. Reanimated já está instalado, porque o NativeWind depende dele.

## Alternativas

- **Tamagui** em vez de NativeWind: mais recursos de design system, mas curva e configuração maiores. Reavaliar se o NativeWind limitar o tema.
- **eslint-plugin-boundaries** em vez de dependency-cruiser: integrado ao ESLint, porém menos preciso com workspaces. O dependency-cruiser também checa pacotes proibidos com uma única config.
- **Next.js + React Native separados:** dois apps e reescrita de telas, contrário ao objetivo.

## Consequências

- Componentes ficam restritos a primitivos do React Native, mesmo na web.
- Hospedagem web fica para um ADR próprio, após a resposta do humano.
