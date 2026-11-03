# ADR-0001: Stack

**Status:** aceito na aprovação da Fase 0.

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

## Nota da Fase 2: `date-fns-tz` fora

**Status:** aceito. O humano confirmou a decisão ao aprovar a Fase 2.

A seção 4 do prompt mestre recomenda `date-fns-tz`, mas ele ficou fora: `packages/core` usa só `Intl` para fuso. Na versão 3.2.0, `getTimezoneOffset('America/New_York', new Date('2026-03-08T06:59:59Z'))` devolve -4 em vez de -5, um erro justamente ao redor da virada de horário de verão, que a recorrência precisa acertar.

`date-fns`, sem o `-tz`, continua permitido na UI, se for útil.
