# Handoff: arquiteto para tarefas-calendario, códigos de erro e exclusão

**De:** arquiteto | **Para:** tarefas-calendario | **Data:** 2026-11-01 10:18 (BRT) | **Branch:** `feat/tasks-adr-db-review`

`taskErrorCodeSchema` ganhou `assignee_not_member`, `context_change_not_allowed` e `context_not_found`, cada um com texto em i18n. Qualquer outra mensagem do banco cai no texto genérico.

Em tela: o botão "Excluir" envia `all`, que não tem desfazer na Fase 2, então peça confirmação. "Cancelar" usa `this` ou `set_occurrence_status`, e pode ser reaberto. Regras no ADR-0005, seção 8.
