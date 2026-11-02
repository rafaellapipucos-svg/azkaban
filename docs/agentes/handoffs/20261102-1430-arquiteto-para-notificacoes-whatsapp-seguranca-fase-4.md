# Handoff: arquiteto para notificacoes-whatsapp, segurança da Fase 4

**De:** arquiteto
**Para:** notificacoes-whatsapp
**Data:** 2026-11-02 14:30 (BRT)
**Branch:** `docs/notifications-security-decisions`, a partir de `feat/phase-4-notifications` (`15f5424`)

## Contexto

Decisões da revisão de segurança da Fase 4 no ADR-0008, seção 17. O handoff `20261102-1420-revisor-seguranca-para-notificacoes-whatsapp-service-worker-e-cabecalhos` traz os achados; este diz o que fazer.

## O que foi entregue

ADR-0008, seção 17. `internalPathSchema` exportado de `packages/contracts`, usado por `pushPayloadSchema.url`, que agora recusa qualquer caractere de controle.

## Contratos criados ou alterados

`internalPathSchema` (novo) e `pushPayloadSchema.url` (mais estrito). `notificationUrl` e `buildPushPayload` não mudam: montam caminhos com ids.

## O que o destinatário precisa fazer

1. **SEG4-6, `apps/app/public/sw.js`.** `internalPath` resolve contra a própria origem: aceita só se `typeof path === 'string'`, `path.length <= 200`, a regex do contrato (`/^\/[^/\\\p{Cc}][^\\\p{Cc}]*$/u`) e `new URL(path, self.location.origin).origin === self.location.origin`; devolve `pathname + search + hash`, senão `'/'`. Atualize o comentário: a regra é a de `internalPathSchema`.
2. **SEG4-7, `apps/app/public/_headers`.** Acrescente, para `/*`:

   ```text
   /*
     Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'
     X-Content-Type-Options: nosniff
     Referrer-Policy: strict-origin-when-cross-origin
   ```

   Mantenha os `Cache-Control` de `/sw.js` e do manifest. `apps/app/public.test.ts` confere as três linhas. A CSP completa (seção 17) é o passo seguinte, como `Content-Security-Policy-Report-Only`, e não entra agora.

3. **SEG4-8.** Quando a sessão fica nula por qualquer caminho (`onSessionChange` de `packages/data/src/auth`, que já existe), e há chave local `{ userId, deviceId }`, chame `unsubscribePush()` e limpe a chave. O botão Sair continua apagando a linha antes do `signOut`. Se precisar do tipo do evento, e não só da sessão, peça a `auth-grupos`.

## Bloqueios e dúvidas

Nenhum. A opção "esconder o conteúdo na tela bloqueada" não entra na Fase 4 (a confirmar pelo humano).

## Como testar

- `pnpm check`.
- SEG4-6: um teste de `sw.js` (ou `node -e` com a função extraída) mostra `'/'` para `"/\t/evil.com"`, `"/\n/evil.com"`, `"/\r/evil.com"`, `"//evil.com"`, `"/\\evil.com"` e um caminho de 201 caracteres, e devolve `/tasks/<id>/proof` intacto.
- SEG4-7: `pnpm build:web` e conferir `apps/app/dist/_headers`. Uma passada da E2E de notificações com o `dist` servido com esses cabeçalhos, se o servidor de teste os aplicar; senão, registre como não verificado.
- SEG4-8: ativar push, apagar a sessão do `localStorage` e recarregar: a inscrição do navegador foi cancelada e a chave local sumiu.
