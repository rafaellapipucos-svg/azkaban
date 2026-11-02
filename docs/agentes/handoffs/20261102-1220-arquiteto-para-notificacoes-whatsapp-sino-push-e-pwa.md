# Handoff: arquiteto para notificacoes-whatsapp, sino, Web Push, preferências, avisos e PWA (F4-3, F4-4, F4-5, F4-7 e F4-9)

**De:** arquiteto | **Para:** notificacoes-whatsapp | **Data:** 2026-11-02 12:20 (BRT) | **Branch:** `feat/notifications-contracts`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seções 2, 5, 7, 8, 9, 13 e 16. Respondo também ao handoff `20261101-1509-tarefas-calendario-para-arquiteto-casca-do-app-resolvida.md`.

## O que foi entregue

Contratos, regras, `EXPO_PUBLIC_VAPID_PUBLIC_KEY` em `parseClientEnv` (opcional) e as decisões de manifest, `theme-color`, título e marcos.

## Contratos criados ou alterados

`packages/contracts/src/notifications.ts` (todos os schemas de notificação), `packages/config/src/notifications.ts`, `packages/config/src/env.ts`.

## O que o destinatário precisa fazer

**Sem depender de ninguém (pode começar já):**

1. **`packages/core/src/notifications`:** `buildPushPayload` pura, com testes: recebe tipo, `data`, título da tarefa (ou nulo), se pede foto e uma função `t`, e devolve `PushPayload` válido e dentro de `pushPayloadMaxBytes`, truncando o título. Endereços da seção 8. `backend-funcoes` a usa na função.
2. **`packages/i18n/src/pt-BR/notifications.json`:** textos do sino, do push por tipo, das preferências, do `PushSetupCard` e o formato `documentTitle` (este em `common.json`, com o dono dele).
3. **F4-9, casca web:** `apps/app/public/index.html`, `manifest.webmanifest`, ícones 192, 512 e 512 `maskable` gerados de `assets/icon.png`, `apple-touch-icon` 180, `_headers` e `_redirects`, como na seção 13. Um teste de unidade compara as cores dos dois arquivos com `background` e `background-dark` de `packages/ui/src/tokens.ts`. Adapter `useDocumentTitle` em `packages/platform` (só web). A linha `EXPO_PUBLIC_VAPID_PUBLIC_KEY: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY` em `apps/app/src/env.ts` e o nome, sem valor, em `apps/app/.env.example`.

**Depois de F4-1 (`banco-de-dados`):**

4. **`packages/data/src/notifications`:** repositório do sino (lista com embed do título pela RLS, contador, marcar lida, marcar todas), preferências, horário de silêncio em `profiles` (corta `22:00:00` para `HH:mm`) e inscrições (`register_push_subscription`, listar, apagar).
5. **F4-3, sino:** `NotificationBell` (ícone com contador, 44 px, rótulo com o número) e `NotificationsScreen` em `/notifications`; `NotificationToaster`, montado uma vez na casca autenticada, assina o Realtime. Item sem título usa a linha genérica. Com `tarefas-calendario`, o encaixe no cabeçalho de Hoje (handoff dele).
6. **F4-5, preferências:** tela em `/settings/notifications`, ligada a partir de Perfil por `children`, com os interruptores por tipo e canal (os padrões de `notificationRules.defaultChannels` aparecem como estado inicial), horário de silêncio com "sem silêncio", e a lista de aparelhos com remover.
7. **F4-4, push:** adapter `push` em `packages/platform` (`.web.ts`; nativo lança até F8): registrar `sw.js`, pedir permissão só por toque, inscrever com a chave pública, reinscrever se a chave mudou, cancelar ao sair da conta e apagar a linha. `apps/app/public/sw.js` com `push` e `notificationclick` da seção 9, sem `fetch`. `PushSetupCard` com a explicação do iPhone (seção 9) e o estado "este navegador não recebe" para `push_endpoint_not_allowed` e para falta da chave pública.
8. **F4-7, avisos ao admin:** os textos e telas de `occurrence_resolved` e `proof_in_review`, que o banco já grava. Nada de lógica de destinatário no cliente.

## Bloqueios e dúvidas

- O onboarding é de `auth-grupos`: mostrar `PushSetupCard` lá é uma composição de rota que o orquestrador precisa pedir a ele.
- Os títulos das telas de outras features dependem de `Screen` ganhar `title` (handoff de `design-system`) e de cada dono passar o seu.
- Itens da seção 16 do ADR são padrões a confirmar pelo humano; as telas não devem assumir que mudam pouco.

## Como testar

- `pnpm check`, com os testes de `buildPushPayload` (cada tipo, foto vai à câmera, título de 4 bytes por caractere não passa do teto, título nulo) e o das cores.
- `pnpm build:web`; em `apps/app/dist`, `index.html` com as duas `theme-color`, `lang="pt-BR"` e o `manifest`; `sw.js`, `_headers` e `_redirects` na raiz. No Chrome, DevTools, Application: manifest sem erro e instalável.
- `pnpm e2e` com uma spec nova: o sino recebe pelo Realtime um aviso gravado por outro usuário (contestar uma prova), marca lido, e o contador zera em outra aba; preferências salvam e voltam; `document.title` muda por tela; `main` único por tela; a 375 px e no escuro. Push real fica para a verificação manual abaixo, porque o Playwright não recebe push.
- Manual, registrado no LOG: Chrome no Android ou desktop recebe um lembrete e o toque abre a câmera; iPhone com iOS 16.4 ou mais novo pela Tela de Início; Safari comum mostra o passo a passo.
