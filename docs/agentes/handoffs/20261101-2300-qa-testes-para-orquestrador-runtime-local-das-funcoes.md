# Handoff: qa-testes para orquestrador, runtime local das funções

**De:** qa-testes
**Para:** orquestrador (`CLAUDE.md`), `arquiteto` (`ci.yml`) e `backend-funcoes`
**Data:** 2026-11-01 23:00 (BRT)
**Branch:** `chore/qa-phase-3`

## Contexto

A E2E falhava de forma intermitente, e a instabilidade relatada na Fase 3 misturava causas diferentes. Duas vêm do runtime local das funções e mudam a forma de rodar os testes.

**1. O 503: `supabase functions serve` no Windows.** O observador de arquivos dele trata como escrita a atualização do último acesso que o NTFS faz no máximo a cada hora, e reinicia o Edge Runtime. Um arquivo com mais de uma hora sem esse carimbo dispara o reinício na primeira leitura, inclusive quando a E2E importa `proof-kit.ts`. O reinício é um `File change detected ... (WRITE)` no log, e derruba o runtime por 6 a 19 s. Provado: com o último acesso recuado, ler o arquivo, sem escrever, reiniciou o runtime, com `mtime` e hash iguais. No log do relatório anterior isso aparece às 21:39:55, 21:44:1x e 21:49:5x, sem nenhuma edição. A observação alcança os arquivos importados de `packages/`.

**2. O 546: limite de CPU do worker local.** O runtime local mata o worker aos 2 s de CPU (`cpuTimeHardLimitMs`, fixo no serviço principal, sem opção de configuração). Pelo log, a partida conta: a primeira chamada de um worker já estoura, antes de a função responder. `proof-validate` não tem repetição automática do runtime, porque a requisição tem corpo. Com 8 workers da E2E, a primeira chamada de `proof-validate` deu 546 em 3 de 6 rodadas. Com 4 workers, nenhuma em 8.

## O que foi entregue

- A pilha de `supabase start` já serve as quatro funções, com o `.env`, e sem observador. A E2E (55 de 55, 6 rodadas seguidas) e `pnpm functions:test` (80 de 80) passaram sem `functions serve`, com o runtime sem nenhum reinício.
- `playwright.config.ts`: 4 workers fora do CI.
- `pnpm e2e` chama antes `wait-for-functions.mjs`, que acorda as funções e falha cedo se elas não responderem.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**Orquestrador:** em `CLAUDE.md`, trocar a linha de `pnpm functions:test` para "exige `pnpm db:start`". Criar `supabase/functions/.env` **antes** de `pnpm db:start`, ou reiniciar a pilha depois, porque o runtime lê o arquivo ao subir. Quem precisa de `functions serve` para depurar não deve rodar a suíte ao mesmo tempo no Windows. Editar função com a pilha no ar continua valendo, porque cada worker lê o código ao partir, mas isso eu não testei.

**`arquiteto`:** os passos de `functions serve` em `ci.yml` ficaram sobrando. Não os removi: no Linux não há esse reinício, a mudança não foi pedida, e o `.env` precisaria ser copiado antes de `db:start`.

**`backend-funcoes`:**

- `wait-for-functions.mjs` ainda manda rodar `supabase functions serve` na mensagem de erro. Trocar por `pnpm db:start`.
- `STATUS` em `proof-validate/index.ts:26` continua sem `upload_timeout: 408`, como pedia o handoff `20261101-2042`. Nada muda em execução, porque a função responde 408 direto.
- Risco para a implantação: o custo de CPU da partida a frio do `proof-validate` não foi medido no projeto hospedado. Lá o pacote é outro, e a documentação fala em 2 s por requisição. Depois da primeira implantação, confira nos logs se há `WORKER_LIMIT` nas primeiras chamadas.

## Bloqueios e dúvidas

Nenhum. Desligar o último acesso no Windows (`fsutil behavior set disablelastaccess 1`) também eliminaria a causa 1, mas é configuração da máquina do humano e não foi feito nem é necessário.

## Como testar

`pnpm db:start`, sem `functions serve`, e `pnpm e2e`, `pnpm functions:test`.
