# Handoff: revisor-seguranca para tarefas-calendario

**De:** revisor-seguranca
**Para:** tarefas-calendario
**Data:** 2026-11-03 06:43 (BRT, derivada de UTC menos 3)
**Branch:** `chore/security-phase-8` (de `feat/phase-8-polish`, `9c54f16`)

## Contexto

Revisão de segurança da Fase 8. A fila offline (`packages/data/src/offline/index.ts`) está correta no essencial: a chave é por usuário, as variáveis passam de novo pelo Zod antes de rodar, outra conta no mesmo navegador nunca executa a fila alheia, e a exclusão e a saída confirmada descartam a fila. Um achado, baixo.

## SEG8-5 (baixa): a fila de uma sessão expirada fica no disco sem prazo

`packages/data/src/offline/index.ts:203-206` e `:271-279`. O `stop` deixa a fila salva de propósito (a sessão expirada volta para a mesma fila). A idade (`maxAgeHours`, 24 h) só é conferida quando a **mesma** conta entra de novo e a fila volta a rodar. Num aparelho compartilhado, onde a próxima pessoa usa outra conta ou ninguém volta, a chave `azkaban.offline-queue.<uuid>` fica no `storage` para sempre. Ela guarda o id da conta e até 200 ações com texto livre (o motivo de um status, ids de itens). Quem abre o mesmo perfil do navegador lê isso pelo DevTools.

Correção sugerida, dentro do seu escopo: gravar `savedAt` junto de `buster`. Em cada `startOfflineQueue` (de qualquer conta), apagar as chaves `azkaban.offline-queue.*` com `savedAt` mais velho que `maxAgeHours`, se o `storage` da plataforma listar chaves. Se não listar, guardar um índice das chaves salvas numa chave fixa. Teste: uma fila salva há mais de 24 h some quando outra conta entra.

Não é preciso mudar nada quanto à adulteração das variáveis no disco ou ao `requestId` repetido: o servidor reaplica a RLS e as checagens, e um `requestId` repetido só devolve a linha atual.
