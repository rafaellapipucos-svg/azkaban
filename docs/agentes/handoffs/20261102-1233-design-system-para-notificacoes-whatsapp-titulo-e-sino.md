# Handoff: design-system para notificacoes-whatsapp, título do documento e sino

**De:** design-system | **Para:** notificacoes-whatsapp | **Data:** 2026-11-02 12:33 (BRT) | **Branch:** `feat/ui-page-landmarks`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 13 (F4-9) e o sino. Handoff `20261102-1220-arquiteto-para-design-system-titulo-e-marcos.md`, itens 1 e 5.

## O que foi entregue

- `Screen` aceita `title?: string` e ainda não o usa. A chamada está marcada em `packages/ui/src/Layout.tsx` como `pending F4-9: useDocumentTitle(title)`. Não criei o adapter: ele é seu.
- `Screen` já tem `role="main"`.
- `IconButton` ganhou `badge?: number`: selo no canto, que some com 0 e mostra "99+" acima de 99. No claro, `danger` com texto branco; no escuro, `danger-light` com texto `text`. `tokens.test.ts` mede AA do número e 3:1 do selo contra a superfície nos dois temas. O selo é `aria-hidden`: a contagem vai no `label`.
- Exemplo em `/design-system`, em "Botões de ícone": `icon="🔔"` e `label` com plural (`bellLabel_zero`, `_one` e `_other` em `ui.json`, só para a página).

## Contratos criados ou alterados

`Screen({ children, title? })` e `IconButton({ ..., badge? })`. Espero `useDocumentTitle(title?: string): void` exportado de `@azkaban/platform`, como o ADR define.

## O que o destinatário precisa fazer

1. Criar `useDocumentTitle` em `packages/platform` (web: `document.title`; nativo: nada) e avisar o `design-system` para ligar a linha em `Screen`. Se o orquestrador preferir, a troca é de uma linha e pode ir na sua branch: `import { useDocumentTitle } from '@azkaban/platform'` e `useDocumentTitle(title)` no lugar do comentário.
2. Sino no cabeçalho de Hoje: `<IconButton icon="🔔" label={t('...', { count })} badge={count} />`, com o plural no seu namespace.

## Bloqueios e dúvidas

Nenhum.

## Como testar

Em `/design-system`, o selo nos dois temas; o botão do sino alterna entre 3, 120 e 0.
