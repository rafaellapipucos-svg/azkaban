# Handoff: qa-testes para notificacoes-whatsapp, achados do QA da Fase 5

**De:** qa-testes
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 02:10 (BRT, derivada de UTC menos 3)
**Branch:** `chore/qa-phase-5`, a partir de `feat/phase-5-whatsapp` (`e140adc`)

## Contexto

QA da Fase 5 no estado integrado. `e2e/whatsapp.spec.ts` passou a rodar (fluxo completo, mais um percurso das telas a 320, 375 e 1280 px, claro e escuro, com os erros do contrato). Nada bloqueia a fase; os três achados são de uso.

## O que foi entregue

Só E2E e o `global-setup`. Nenhum `test.fail()` para estes achados: a E2E descreve o comportamento de hoje.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA5-1, média. A tela do código some quando a página recarrega, e o reenvio fica travado.**

`sentTo` vive só no estado do componente (`WhatsAppSection.tsx`). No celular, a pessoa sai do navegador para abrir o WhatsApp e ler o código; ao voltar, o navegador (o Safari do iPhone, sobretudo, e o PWA) muitas vezes recarrega a aba. Ela cai de novo em "Seu número de WhatsApp", sem campo para o código que acabou de receber, e o "Enviar código" responde 429 até passar `resendSeconds`. Pedir outro invalida o primeiro. Visto na E2E: depois de `page.reload()`, a tela mostra o passo do número, e o mesmo número dá "Muitos códigos pedidos" com a contagem regressiva.

Sugestão: guardar `sentTo` e `waitUntil` em `sessionStorage` (via `packages/platform`, com `expiresAt`), ou ler do banco se há código vivo para o usuário (uma RPC do `banco-de-dados` que devolva só o número e `expiresAt`). A primeira não muda contrato.

**QA5-2, baixa. O 429 do reenvio diz "Muitos códigos pedidos".**

Na primeira vez que a pessoa pede de novo antes de 60 s, ela pediu um código só, e lê "Muitos códigos pedidos. Tente de novo mais tarde.", com "Você pode pedir outro código em 58 segundos." embaixo. A contagem esclarece, mas o texto acusa. `phone_rate_limited` cobre o reenvio e o limite de 24 h; dá para escolher o texto pelo tamanho de `retryAfterSeconds` (até `resendSeconds`: "Aguarde para pedir outro código."), sem mudar contrato.

**QA5-3, baixa. O número aparece cru em E.164.**

"Enviamos um código pelo WhatsApp para +5511917058802.", "Ativo para +5511917058802." e o aviso de consentimento mostram o número sem separação. Um `formatPhone` em core (por exemplo `+55 11 91705-8802` para o Brasil, E.164 como está para os outros países) lê melhor e ajuda a conferir o número antes de ativar. A E2E procura o texto com o número cru: ajuste `e2e/whatsapp.spec.ts` junto, ou peça ao `qa-testes`.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/whatsapp.spec.ts --project app`. Para o QA5-1, um teste que recarregue a página na tela do código e espere o campo do código.
