# Handoff: design-system para orquestrador, barra de abas com marco de navegação

**De:** design-system | **Para:** orquestrador (casca, `apps/app/src`) | **Data:** 2026-11-02 12:33 (BRT) | **Branch:** `feat/ui-page-landmarks`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 13, e o handoff `20261102-1220-arquiteto-para-design-system-titulo-e-marcos.md`, itens 3 e 4. `apps/app/src/AppTabBar.tsx` é da casca, fora do meu escopo.

## O que foi entregue

`TabBar` em `@azkaban/ui`: `role="navigation"` com o nome "Navegação principal" (de `ui.json`), `tablist` e `tab` como hoje, área segura embaixo. Cada aba tem a largura do rótulo e divide a sobra, com mínimo de 44 px; o rótulo quebra em até duas linhas em vez de reticências. Em `/design-system`, a 320 px, Hoje, Trabalho, Doméstico, Calendário e Perfil aparecem inteiros, numa linha. Com cinco quintos iguais (64 px), "Calendário" (72 px) e "Doméstico" (71 px) não cabem.

## Contratos criados ou alterados

`TabBar({ items })`, com `TabBarItem = { key, label, icon, selected, onPress }`.

## O que o destinatário precisa fazer

Em `AppTabBar.tsx`, trocar o `View role="tablist"` e o `map` por:

```tsx
<TabBar
  items={tabs.map((tab) => ({
    key: tab.id,
    label: tab.label,
    icon: tab.icon,
    selected: tab.selected,
    onPress: () => router.navigate(tab.href),
  }))}
/>
```

`MaterializeStatus` continua acima, fora da navegação. `useSafeAreaInsets` e `tokens` deixam de ser usados ali. Na mesma passada, `apps/app/app/+not-found.tsx` pode passar `title` ao `Screen`.

## Bloqueios e dúvidas

Nenhum. Se o app ganhar mais áreas, seis abas a 320 px não cabem inteiras numa linha: o rótulo de várias palavras quebra, e o de uma palavra só é cortado no meio.

## Como testar

`pnpm dev`, logado, a 320 px: um `navigation` com nome no leitor de acessibilidade do DevTools, rótulos inteiros e a aba ativa com a borda de cima.
