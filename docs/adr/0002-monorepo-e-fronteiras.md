# ADR-0002: Monorepo e fronteiras entre módulos

**Status:** aceito na aprovação da Fase 0.

## Contexto

Vários agentes trabalham em paralelo. Branches só não colidem se cada módulo tiver dono e fronteira verificável.

## Decisão

- Workspaces pnpm em `apps/*`, `packages/*` e `packages/features/*`, orquestrados pelo Turborepo.
- Cada pacote publica só `.` em `exports`, apontando para `src/index.ts`. Não há build de pacote interno: o Metro e o Vitest consomem TypeScript direto.
- Features são pacotes separados. Conversam via `core`, `contracts` ou eventos.
- `pnpm boundaries` falha no CI quando uma fronteira é violada. Regras em `docs/arquitetura.md`.
- `node-linker=hoisted` no pnpm, para o Metro e as bibliotecas nativas do Expo resolverem dependências de forma previsível.

## Alternativas

- **Um único pacote com pastas:** menos arquivos, mas sem fronteira real entre módulos.
- **Polyrepo:** contratos compartilhados ficariam atrás de publicação de versões.

## Consequências

- Um `package.json` por feature, ao custo de um pouco de repetição.
- Com hoisting, uma dependência não declarada pode funcionar por acidente. O dependency-cruiser sinaliza `not-to-unresolvable`, mas não substitui revisão.
