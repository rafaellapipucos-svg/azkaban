# Handoff: revisor-seguranca para notificacoes-whatsapp, WhatsApp

**De:** revisor-seguranca
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 01:58 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-5`, a partir de `feat/phase-5-whatsapp` (`9f88a68`)

## Contexto

Primeira passada da revisão de segurança da Fase 5: core do resumo e do telefone, repositório e telas.

Resistiu à leitura: a tela grava direto em `profiles` só as cinco `daily_summary_*`, validadas por `dailySummaryPreferencesSchema`; telefone, código, opt-in e opt-out só por RPC ou pela função; o telefone vai no corpo de `phone-verification`, nunca em URL; nenhum `console.*` novo no cliente; o código é validado com `codeLength` dígitos antes da RPC; o aviso tem nome do app, número, o que chega (com os títulos), a Meta, o custo zero e como parar, e a versão aceita é a de `whatsappRules.consentVersion`.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG5-6, baixa. O resumo leva para o WhatsApp, com o número da empresa, texto escrito por outra pessoa, sem filtro de controle bidirecional.** Títulos e nomes de contexto do resumo são escritos por quem cria a tarefa, que pode ser um admin do grupo. `cleanParam` (`packages/core/src/notifications/whatsapp.ts:47-49`) só troca `\p{Cc}` e espaços; `whatsappTextParamSchema` também só barra `\p{Cc}`, U+2028 e U+2029. PoC em Node: um título com U+202E (RLO) e U+202C e uma URL passa por `cleanParam` e pelo regex do contrato com os dois intactos. No WhatsApp, o RLO inverte o trecho exibido (um "xelaPIX.pdf" aparece como "fdp.XIPalex", ou o contrário, para disfarçar uma extensão ou um domínio), e a URL vira link clicável numa mensagem que chega do número verificado do Azkaban. No app, o mesmo título já aparece, mas fora do canal que a pessoa associa a "mensagem oficial".

Correção sugerida, a parte que é sua: `cleanParam` remove também `\p{Cf}` (controles bidirecionais U+202A a U+202E e U+2066 a U+2069, e os de largura zero), com teste do título com RLO. O que fazer com URLs (aceitar e registrar, ou desarmar) é decisão do `arquiteto`, que está no handoff dele; se ele decidir desarmar, a regra entra aqui.

**Observação, sem severidade, só UX que alimenta o SEG5-1:** `normalizePhone("0055 11 98765-4321")` tira os zeros e prefixa 55 de novo, e o resultado `+555511987654321` passa no E.164. O código vai para um número que não é o da pessoa, e isso cria exatamente a linha `phone_code` de outro `wa_id` descrita no SEG5-1 (handoff do `banco-de-dados`). Tratar `00` no começo como prefixo internacional evita o caso.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm --filter @azkaban/core exec vitest run src/notifications` com o caso novo de `cleanParam`.
