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

## Tarefas

Regras completas no [ADR-0005](adr/0005-tarefas-ocorrencias-recorrencia.md).

- `tasks` é a definição, e `task_occurrences` guarda o estado de cada instância.
- O cliente lê por RLS, cria tarefa por `insert` e faz o resto pelas RPCs `set_occurrence_status`, `edit_task` e `delete_task`. Triggers gravam histórico e XP em qualquer caminho.
- Ocorrências recorrentes só nascem na Edge Function `materialize-occurrences`, que usa a recorrência de `packages/core`. A de tarefa avulsa vem de um trigger.
- `taskRules` (`packages/config`) e `occurrenceTransitions` (`packages/contracts`) têm espelho no banco, como a matriz de permissões. Os dois arquivos não têm importação em tempo de execução, para o Node carregá-los direto em `pnpm db:check-permissions`.

## Banco

Desenvolvimento em Supabase local (`pnpm db:start`, exige Docker), nas portas 544xx para conviver com outros projetos locais: `apps/app/.env.development.local` aponta o `pnpm dev` para ele. O projeto hospedado recebe migrations por `supabase db push --db-url "$SUPABASE_DB_URL"`, e só após revisão.
