# Azkaban (nome provisório)

App de organização pessoal e interpessoal. Web primeiro, iOS/Android depois, com o mesmo código.
Especificação completa: [docs/PROMPT_MESTRE.md](docs/PROMPT_MESTRE.md). Responsável humano: Rafaell Bezerra Saraiva. Fuso: America/Sao_Paulo.

## Antes de alterar qualquer coisa

Leia o cabeçalho e as últimas 10 entradas de [LOG_DE_ALTERACOES.md](LOG_DE_ALTERACOES.md), [AGENTES.md](AGENTES.md), [docs/arquitetura.md](docs/arquitetura.md) e os ADRs em [docs/adr/](docs/adr/).

**Regra obrigatória do log:** ao terminar cada bloco de trabalho, antes do commit/PR, adicione uma entrada no final do `LOG_DE_ALTERACOES.md`, no formato do cabeçalho dele.

## Comandos

```bash
pnpm install            # instalar
pnpm dev                # app web (Expo)
pnpm lint               # ESLint + Prettier
pnpm boundaries         # fronteiras entre módulos
pnpm typecheck          # TypeScript strict
pnpm test               # testes de unidade
pnpm check              # todos os checks acima
pnpm db:start           # Supabase local (exige Docker)
pnpm db:reset           # recria o banco local com migrations + seeds
pnpm db:migration <nome> # nova migration
pnpm db:types           # gera os tipos do banco em packages/data
pnpm db:test            # testes de RLS (pgTAP)
pnpm db:check-permissions # compara a matriz do banco com packages/core
pnpm e2e                # Playwright (exige `pnpm db:start`)
pnpm functions:test     # Edge Functions (exige `pnpm db:start`; não use `supabase functions serve` no Windows)
```

## Regras de arquitetura

- Organização por feature em `packages/features/*`. API pública só pelo `index.ts`. Features não importam umas às outras.
- Negócio em `packages/core`: TypeScript puro, sem React e sem Supabase.
- Dados só via repositórios em `packages/data`. Nenhum componente chama o Supabase.
- Recursos de plataforma só em `packages/platform`, com `.web.ts` e `.native.ts`.
- Contratos em `packages/contracts` são a fonte da verdade entre agentes.
- Rotas em `apps/app/app` são finas: só montam a tela do módulo.
- Sem hardcode: textos em i18n, cores e medidas em tokens, regras em config ou banco, permissões via `can(...)`.
- Componentes usam primitivos do React Native, mobile-first, alvos de toque ≥ 44px.
- RLS em todas as tabelas. Service role só em Edge Functions. Uma migration por mudança; nunca editar migration mergeada.
- Código, tabelas e commits em inglês; interface em pt-BR via i18n; documentação em português.
- Conventional Commits. Branches `feat/<modulo>-<descricao>`, `fix/...`, `chore/...`, `docs/...`. `main` sempre deployável.
- Nunca commitar segredos. O repositório é público.
- Não avançar de fase sem aprovação do humano.

Sem comandos? `pnpm check` é a definição mínima de pronto; a completa está na seção 10 do prompt mestre.
