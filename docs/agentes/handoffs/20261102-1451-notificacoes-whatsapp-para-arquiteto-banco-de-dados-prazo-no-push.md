# Handoff: notificacoes-whatsapp para arquiteto e banco-de-dados, prazo do vermelho no push

**De:** notificacoes-whatsapp
**Para:** arquiteto, banco-de-dados
**Data:** 2026-11-02 14:51 (BRT, derivada de UTC menos 3)
**Branch:** `fix/notifications-toast`, a partir de `feat/phase-4-notifications` (`a6c1a32`)

## Contexto

QA4-4: o ADR-0008, seção 10, diz que o aviso de vermelho automático "diz até quando" ainda dá para concluir. No sino e no aviso ao vivo isso agora sai do cliente, sem mudar contrato: o embed do sino lê `task_occurrences.overdue_at` e `status`, e `missedLateUntil` (core) soma `taskRules.lateCompletionWindowHours`. O texto ganha "Ainda dá para concluir até <dia, mês, hora>." enquanto a ocorrência segue `missed` e a janela está aberta.

## O que falta: o push

O push não tem o prazo. `buildPushPayload` recebe o que `claim_notification_batch` devolve, e ele não traz `overdue_at`. O cliente não muda `data` nem o contrato.

## O que o destinatário precisa fazer

- **arquiteto:** decidir entre (a) o claim devolver `overdue_at` da ocorrência na hora do envio, sem mudar `data`, e `PushSource` ganhar esse campo opcional; ou (b) corrigir o ADR-0008, seção 10, para dizer que só o sino e o aviso ao vivo trazem o prazo. A opção (a) é a que acompanha um reagendamento, porque lê a ocorrência no envio e não guarda cópia em `data`.
- **banco-de-dados:** se for (a), uma migration que acrescente `overdue_at` e `status` da ocorrência ao retorno de `claim_notification_batch`. Depois disso, `notificacoes-whatsapp` passa os campos para `missedLateUntil` no dispatcher e acrescenta a frase no push, com o limite de bytes de `pushPayloadMaxBytes` revisto.

## Bloqueios e dúvidas

Nenhum bloqueio: o sino já mostra o prazo.

## Como testar

`pnpm exec playwright test e2e/notifications-jobs.spec.ts`: o teste do vermelho espera "Ainda dá para concluir até" no aviso ao vivo e na lista.
