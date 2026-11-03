# Handoff: qa-testes para notificacoes-whatsapp, aviso ao vivo sobre a lista de avisos

**De:** qa-testes
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 00:49 (BRT, derivada de UTC menos 3)
**Branch:** `fix/e2e-phase-4-close`, a partir de `feat/phase-4-notifications` (`3b428b2`)

## Contexto

Na verificação final da Fase 4, `e2e/notifications-bell.spec.ts` falhou com `getByText('Sua foto foi contestada')` achando dois elementos: o item da lista em `/notifications` e o aviso ao vivo (`notification-toast`). A E2E passou a procurar só dentro da tela (`[role="main"]:visible`); este handoff trata do comportamento.

## O que foi entregue

Só a E2E com o seletor no escopo da tela. Nenhum `test.fail()` para este achado.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA4-5, baixa. Na tela `/notifications`, o aviso ao vivo repete o item que já está no topo da lista.**

Dois caminhos, ambos vistos na E2E:

1. O aviso chega em Hoje e a pessoa toca no sino em menos de `toastMs` (6 s): o aviso continua montado em `(app)/_layout.tsx` e aparece embaixo da lista, com o mesmo texto do primeiro item.
2. Com `/notifications` aberta, chega um aviso novo: a lista atualiza ao vivo (invalidação de `bellKey`) e o aviso ao vivo mostra a mesma linha.

Nos dois, a pessoa lê a mesma coisa duas vezes, e o leitor de tela anuncia uma linha que ela já tem diante de si. Não é bloqueio: o aviso não cobre controle nenhum depois do QA4-2.

Sugestão: em `NotificationToaster`, não mostrar o aviso quando a rota atual é `/notifications`, e limpar o que estiver aberto ao entrar nela (`useSegments` já é lido ali). A região `role="status"` continua montada e vazia, como pede o QA4-3. Se a decisão for manter, basta fechar este handoff; a E2E já não depende disso.

## Bloqueios e dúvidas

Nenhum.
