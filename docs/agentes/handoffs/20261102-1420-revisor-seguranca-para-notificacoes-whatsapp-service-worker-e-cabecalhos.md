# Handoff: revisor-seguranca para notificacoes-whatsapp, service worker e cabeçalhos

**De:** revisor-seguranca
**Para:** notificacoes-whatsapp
**Data:** 2026-11-02 14:20 (BRT)
**Branch:** `chore/security-phase-4`, a partir de `feat/phase-4-notifications` (`55f87f0`)

## Contexto

Revisão de segurança da Fase 4. O cliente resistiu à leitura: endpoint e chaves nunca voltam (colunas de `push_subscriptions`), `localStorage` guarda só `{ userId, deviceId }`, `syncThisDevice` cancela a inscrição de outra conta em vez de adotá-la, `forgetThisDevice` roda antes do `signOut` com teto de 5 s, o título do sino vem pelo embed com RLS, e o bundle de `pnpm build:web` não tem segredo (só a lógica do supabase-js que reconhece o prefixo `sb_secret_`).

## O que foi entregue

Só este relatório. Nenhum arquivo do módulo mudou.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG4-6, baixa. `internalPath` do `sw.js` aceita tab, LF e CR, e a URL resolvida sai do app.** A regra `^\/[^/\][^\]*$` deixa passar `"/\t/evil.com"`. O parser de URL remove tab e quebra de linha antes de interpretar, e `new URL("/\t/evil.com", origin).href` vira `https://evil.com/`, que o `notificationclick` abre com `openWindow` ou `navigate`. PoC executado no Node 24: `"/\t/evil.com"`, `"/\n/evil.com"` e `"/\r/evil.com"` passam na regex e resolvem para `https://evil.com/`. Hoje a `url` vem só do servidor (`notificationUrl` com ids), e o contrato tem a mesma regex (handoff para `arquiteto`), então não é explorável sem controlar o payload. Correção sugerida no `sw.js`, que não depende da regex: resolver e comparar a origem, `const u = new URL(path, self.location.origin); return u.origin === self.location.origin ? u.pathname + u.search + u.hash : '/'`, mantendo o teto de 200.

**SEG4-7, baixa. `_headers` não tem nenhum cabeçalho de segurança.** Só `Cache-Control` em `/sw.js` e no manifest, que está certo. Faltam, para todas as rotas: `Content-Security-Policy` com ao menos `frame-ancestors 'none'` (o app aceita ser posto num iframe, e tem ações de um toque, como concluir tarefa e revisar foto), `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`. Uma CSP completa (`script-src 'self'`, `connect-src` com a URL do Supabase e `wss:` do Realtime) precisa de cuidado com os estilos inline do react-native-web: comece com `Content-Security-Policy-Report-Only` e confira o console. `apps/app/public.test.ts` pode verificar que os cabeçalhos existem.

**SEG4-8, baixa. Sessão que acaba sem o botão Sair deixa o push da conta anterior ativo.** `forgetThisDevice` só roda no `ProfileScreen`. Se a sessão expira, é revogada em outro aparelho ou o usuário limpa só os cookies, o navegador segue recebendo os avisos daquela conta, com o título da tarefa, até outra conta abrir o app ali. Sugestão: em `onAuthStateChange` com `SIGNED_OUT`, chamar `unsubscribePush()` e limpar a chave local. Sem sessão a linha não é apagada, mas o endpoint morre, o serviço responde 410 e o despacho a apaga.

**Risco de produto, para o orquestrador levar ao humano.** O título da tarefa aparece na tela bloqueada de quem ativou o push (ADR-0008, seção 9 e Consequências). Hoje só dá para desligar o push por tipo. Uma opção "esconder o conteúdo na tela bloqueada" (título genérico, o detalhe só ao abrir) custa uma preferência e um ramo no `buildPushPayload`. Junto: o aviso de SEG4-1 (handoff para `banco-de-dados`) aparece como toast a cada insert, então o laço de um membro também enche a tela do criador com o app aberto.

## Bloqueios e dúvidas

Nenhum.

## Como testar

SEG4-6: `node -e` com a regex do `sw.js` e `new URL("/\t/evil.com", "https://app.example").href`. SEG4-7: `pnpm build:web` e conferir `apps/app/dist/_headers`. SEG4-8: ativar push, apagar a sessão do `localStorage` e recarregar; hoje a inscrição continua.
