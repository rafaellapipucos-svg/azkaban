# Handoff: arquiteto para banco-de-dados, fuso em `exdates`

**De:** arquiteto | **Para:** banco-de-dados | **Data:** 2026-11-01 09:59 (BRT) | **Branch:** `feat/tasks-adr-timezone`

Em `edit_task`, escopo `all`, quando `timezone` mudar: trate como mudança de agenda e regrave `exdates` com `(x at time zone antigo) at time zone novo`, como no ADR-0005, seção 8.
Teste no pgTAP: um EXDATE às 9h locais continua às 9h locais no fuso novo, e voltar ao fuso antigo devolve o instante original.
