# Handoff: revisor-seguranca para auth-grupos, sessão aceita de qualquer link do app (BL23-2)

**De:** revisor-seguranca
**Para:** auth-grupos (e, para conhecimento, arquiteto, pela escolha do fluxo, e notificacoes-whatsapp, autor do F8-7)
**Data:** 2026-11-03 11:04 (BRT, derivada de UTC menos 3)
**Branch:** `review/backlog-security` (de `feat/backlog-after-phase-8`, `960c107`)

## Contexto

BL-23, revisão de segurança do backlog pós-Fase 8 (`c74cce6..960c107`). `parseSessionLink` está certo no que propõe: só o esquema e o host do app (`createAppLink('/')`), caminho validado por `internalPathSchema` e de novo por `safeInternalPath`, nenhum open redirect, e a descrição de erro do GoTrue não vai para a tela. Um achado médio, que é o desenho do fluxo e não um erro de parsing.

## BL23-2 (média): login CSRF pelo deep link, a sessão do aparelho é trocada pela de outra conta

`packages/data/src/auth/index.ts:53-63` (`setSessionFromLink`), `packages/features/auth/src/useSessionFromLink.ts:23-33`, com o cliente em fluxo implícito (`packages/data/src/client.ts:56`, sem `flowType`).

Qualquer `azkaban:///<caminho>#access_token=…&refresh_token=…` que abra o app vira a sessão do aparelho, com ou sem pedido de link deste aparelho e mesmo com outra conta já dentro. Os tokens são do nosso projeto (o `setSession` confere no GoTrue), mas nada liga o link a quem pediu.

Cenário: o atacante cria uma conta descartável, faz login e monta o link com os próprios tokens. Manda para a vítima por WhatsApp ou e-mail ("veja a lista do grupo"). A vítima toca, o app abre já na conta do atacante (o `useClearCacheOnUserChange` troca a tela sem aviso) e a sessão dela some deste aparelho. O que a vítima fizer dali em diante fica na conta do atacante, que lê tudo em outro aparelho: tarefas, fotos de prova com local, o número de telefone verificado pelo WhatsApp e o próprio aparelho, se ela ativar o push. É dado pessoal da vítima entregue a terceiro (LGPD). O mesmo vale na web, onde `detectSessionInUrl` lê o fragmento sozinho (anterior a este diff).

## O que fazer

Correção de raiz (decisão do arquiteto, ADR-0004): `flowType: 'pkce'` no `createClient`. O link passa a trazer `?code=`, e só o aparelho que pediu tem o `code_verifier` no `storage` para trocá-lo (`exchangeCodeForSession`). Fecha o caso na web e no nativo. Custo: o link de e-mail só serve no aparelho ou navegador que pediu, inclusive a confirmação de cadastro e a reautenticação da exclusão.

Mitigação mínima, se o PKCE ficar para depois, toda dentro de `useSessionFromLink`/`setSessionFromLink`:

1. Com sessão já ativa, ignorar o link de sessão (não trocar a conta). No máximo, ir para o caminho.
2. Aceitar a sessão só se este aparelho pediu um link há pouco: gravar um marcador com validade no `storage` em `signInWithOtp`, `signUp` e na reautenticação por link, e apagá-lo ao usar. Sem marcador, mandar para `/sign-in` sem sessão.

Teste: um link com tokens válidos, sem pedido e com sessão ativa, não chama `setSession`.

## Como testar

`pnpm check`; manual num aparelho: abrir um link montado à mão com tokens de outra conta, com e sem sessão.
