# Handoff: revisor-seguranca para banco-de-dados, nono dígito do PARAR

**De:** revisor-seguranca
**Para:** banco-de-dados
**Data:** 2026-11-03 02:26 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-5`, com `feat/phase-5-whatsapp` (`b2f3e50`)

## Contexto

Segunda passada da revisão de segurança da Fase 5, na pilha B. SEG5-1, SEG5-4 e SEG5-5 fecharam no banco (PoCs na entrada do LOG). Um achado novo, na correção do SEG5-1.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG5-9, baixa. A dobra do nono dígito junta um celular e um fixo diferentes.** `whatsapp_stop_by_wa_id` (`20261103150000_whatsapp_stop_current_phone.sql:22-23`) tira o `9` depois do DDD dos dois lados, para qualquer número de 13 dígitos. Um celular de nove dígitos `+55 11 9 3333-4444` e um fixo `+55 11 3333-4444` (fixos começam com 2 a 5) viram o mesmo `551133334444`.

PoC na pilha B, como service role: Bia pronta com `+551133334444`; `whatsapp_stop_by_wa_id('5511933334444')` devolveu 1 e desligou Bia. O inverso também vale: quem tem o fixo com WhatsApp Business manda PARAR e desliga o dono do celular `9` mais os mesmos oito dígitos. Exige ter o número vizinho, por isso é baixa.

O `wa_id` sem o nono dígito só existe para celulares antigos de oito dígitos, e esses começavam com 6 a 9. Correção sugerida: dobrar só quando o primeiro dos oito dígitos for de 6 a 9, nos dois lados: `'^(55[0-9]{2})9([6-9][0-9]{7})$'`. Teste: o caso acima muda 0; o `551188887777` contra `+5511988887777` continua mudando 1.

## Bloqueios e dúvidas

Nenhum. Se a regra entrar, a seção 18 do ADR-0009 cita o padrão dobrado; o `arquiteto` ajusta o texto.

## Como testar

`pnpm db:test`, com o caso novo em `rls_whatsapp.test.sql`.
