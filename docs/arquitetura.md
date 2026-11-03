# Arquitetura

Visão geral. Decisões e alternativas ficam em [adr/](adr/); o escopo do produto, em [PROMPT_MESTRE.md](PROMPT_MESTRE.md).

## Camadas

```
apps/app (rotas finas)
   └─> packages/features/*  (telas e fluxos, um módulo por feature)
          ├─> packages/ui        design system
          ├─> packages/i18n      traduções por módulo
          ├─> packages/data      repositórios, único acesso ao Supabase
          ├─> packages/platform  câmera, push, geolocalização, armazenamento
          ├─> packages/config    env validado, feature flags
          ├─> packages/core      domínio puro
          └─> packages/contracts tipos e schemas Zod
supabase/  migrations, seeds, Edge Functions, testes de RLS
```

## Regras verificadas por ferramenta

`pnpm boundaries` (dependency-cruiser, em `.dependency-cruiser.cjs`) falha quando:

- uma feature importa outra feature;
- um pacote importa o `src/` interno de outro em vez do `index.ts`;
- `core` ou `contracts` importam React, React Native ou Supabase;
- algo fora de `packages/data` importa `@supabase/*`;
- `packages/` importa `apps/`.

`pnpm lint` (ESLint) proíbe `any`, e globais de navegador (`window`, `document`, `navigator`) fora de `packages/platform`.

## Configuração e segredos

- `packages/config` valida o ambiente com Zod ao iniciar. `apps/app/src/env.ts` lê as variáveis `EXPO_PUBLIC_*` por nome, porque o Expo só embute acessos estáticos.
- `apps/app/.env.local` guarda só valores públicos do cliente. `.env.local` na raiz guarda valores de servidor, como `SUPABASE_DB_URL`.
- Ambos são ignorados pelo git. O repositório é público: só `.env.example` é versionado.

## Tokens

`packages/ui/src/tokens.ts` é a fonte das cores e medidas. `apps/app/tailwind.config.ts` as expõe ao NativeWind, com um par `<nome>` e `<nome>-dark` para cada cor de tema.

O tema usa `darkMode: 'class'`, porque o modo `media` dispara erro na web no NativeWind 4.2. `useSystemColorScheme`, em `packages/ui`, mantém a classe igual ao tema do sistema.

## Banco

Desenvolvimento em Supabase local (`pnpm db:start`, exige Docker). O projeto hospedado recebe migrations por `supabase db push --db-url "$SUPABASE_DB_URL"`, e só após revisão.
