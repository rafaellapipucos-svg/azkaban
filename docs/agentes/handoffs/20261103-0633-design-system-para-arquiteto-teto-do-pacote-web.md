# Handoff: design-system para arquiteto, teto do pacote web (F8-6)

**De:** design-system
**Para:** arquiteto
**Data:** 2026-11-03 06:33 (BRT)
**Branch:** `feat/ui-polish`, a partir de `feat/phase-8-polish` (`d2c8d4e`)

## Contexto

[ADR-0012](../../adr/0012-polimento-lgpd-limites-offline.md), seção 10, meta 1: o maior JS de `pnpm build:web`, comprimido com gzip, não passa de 110% do tamanho medido no início de F8-6, e um script falha o `pnpm check` acima do teto. O script e a entrada ficam na raiz (`scripts/`, `package.json`), fora de `packages/ui`.

## O que foi entregue

A medida de partida, em `feat/ui-polish` (as mudanças desta branch não mexem no tamanho de forma visível: só movem a geometria do mascote para `mascotArt.ts`):

| Arquivo                                  | Bruto (bytes) | gzip nível 6 (padrão do `zlib`) | gzip nível 9 |
| ---------------------------------------- | ------------- | ------------------------------- | ------------ |
| `_expo/static/js/web/__common-<hash>.js` | 1 645 230     | **388 765**                     | 387 156      |
| `_expo/static/js/web/entry-<hash>.js`    | 1 135 243     | 299 144                         | 297 931      |
| `_expo/static/js/web/_layout-<hash>.js`  | 35 826        | 10 131                          | 10 085       |

36 arquivos JS, 2 864 238 bytes no total. Teto pelo nível padrão: 388 765 × 1,10 = **427 641 bytes**. Máquina: Windows 11 Home, Node 24, `pnpm build:web` (Expo SDK 58, Metro), `.env.local` falso.

Medido com `zlib.gzipSync` sobre cada `.js` de `apps/app/dist`, o maior pelo tamanho bruto.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. `scripts/check-bundle-size.mjs` (sugestão): acha o maior `.js` de `apps/app/dist`, comprime com `zlib.gzipSync` (nível padrão) e falha acima de 427 641 bytes, imprimindo o tamanho e o teto. O valor de partida pode ficar em `packages/config` ou no próprio script.
2. Ligar ao `pnpm check`. Como o `check` hoje não roda `build:web` (21 s nesta máquina), decidir se o `check` passa a construir ou se o teto vai para o CI depois do `build:web`.
3. Opcional, mesma família do QA6C-1: uma regra `no-restricted-syntax` no ESLint contra `pointerEvents` dentro de `style` (o react-native-web 0.21 o descarta; só a prop chega ao DOM). Tentei um teste em `packages/ui` que lê os `.tsx`, mas o pacote não tem tipos do Node e o `@types/node` içado briga com o `lib` do `tsconfig.base`; a regra de lint é o lugar certo.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm build:web` e o script; trocar o teto por um valor menor que 388 765 deve falhar.
