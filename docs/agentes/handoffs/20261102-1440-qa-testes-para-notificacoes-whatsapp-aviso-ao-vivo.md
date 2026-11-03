# Handoff: qa-testes para notificacoes-whatsapp, aviso ao vivo

**De:** qa-testes
**Para:** notificacoes-whatsapp
**Data:** 2026-11-02 14:40 (BRT, derivada de UTC menos 3)
**Branch:** `chore/qa-phase-4`, a partir de `feat/phase-4-notifications` (`15f5424`)

## Contexto

QA da Fase 4 no estado integrado, com Playwright a 320, 375 e 1280 px, claro e escuro. Sino, contador, lista, preferências, silêncio, títulos e marcos passaram. Seguem três achados do aviso ao vivo e do texto do vermelho.

## O que foi entregue

`e2e/notifications-jobs.spec.ts` cobre o lembrete (`enqueue_due_reminders`) entrando no sino ao vivo e o vermelho automático com o aviso ao responsável. Nenhum `test.fail()` para estes achados.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA4-2, média. O aviso ao vivo cobre o "Voltar" por 6 s, e um toque ali abre o aviso.**

Medido com `document.elementFromPoint` no centro do "Voltar" do `BackHeader`, nas 6 combinações:

| Largura | "Voltar"          | Aviso (`role="status"`) | "Voltar" coberto |
| ------- | ----------------- | ----------------------- | ---------------- |
| 320     | x 16, y 0, 71×44  | x 16, y 16, 288×72      | sim              |
| 375     | x 16, y 0, 71×44  | x 16, y 16, 343×72      | sim              |
| 1280    | x 376, y 0, 71×44 | x 360, y 16, 560×72     | sim              |

O aviso fica em `top: spacing[4]`, sobre o cabeçalho. Quem toca em "Voltar" nesses 6 s cai no `Pressable` do aviso, que marca como lido e navega para o destino dele, o contrário do que a pessoa pediu. Em Hoje, o mesmo aviso cobre o sino. Passo a passo: abrir `/tasks/<id>`; numa outra sessão, gerar um aviso para essa conta (por exemplo, `select public.enqueue_due_reminders();` com uma tarefa que começa em 5 minutos e antecedência de 10); tocar em "Voltar". Sugestão: o aviso embaixo, acima da barra de abas (respeitando a área segura), ou abaixo do cabeçalho.

**QA4-3, baixa. A região `role="status"` nasce junto com o texto.** `NotificationToaster` só monta a `View role="status" aria-live="polite"` quando há aviso. Leitores de tela costumam anunciar mudanças numa região viva que já existia; uma região inserida já com conteúdo muitas vezes não é lida (VoiceOver e NVDA variam). Sugestão: manter um contêiner `role="status"` vazio sempre montado e trocar só o conteúdo. Não verifiquei com leitor de tela real; é leitura do código.

**QA4-4, baixa. O aviso de vermelho automático não diz até quando ainda dá para concluir.** O ADR-0008, seção 10, diz "o aviso diz até quando". `push.occurrence_missed.auto` é "{{task}} passou do prazo e ficou como não feita.", e `missedData` só traz `byUserId`. A janela é `overdue_at + lateCompletionWindowHours` (`lateWindowEnd` em core). Para o sino, o embed de `task_occurrences` pode trazer `overdue_at`; para o push, o `claim_notification_batch` teria de devolvê-lo (dono `banco-de-dados`), e o texto ganharia uma variável (contrato com o `arquiteto` se `data` mudar). Pode ser decisão de deixar para depois; aí vale corrigir o ADR.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/notifications-jobs.spec.ts e2e/notifications-bell.spec.ts`. Para QA4-2, um teste que clique em "Voltar" com o aviso aberto e espere voltar.
