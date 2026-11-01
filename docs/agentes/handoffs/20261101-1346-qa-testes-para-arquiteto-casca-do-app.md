# Handoff: qa-testes para arquiteto, casca do app (rotas, 404, idioma, cabeçalho)

**De:** qa-testes | **Para:** arquiteto | **Data:** 2026-11-01 13:46 (BRT) | **Branch:** `feat/qa-phase-2`

## Contexto

`apps/app` (layouts e rotas) não tem dono na tabela do `AGENTES.md`; você é o mais próximo (configs da raiz e estrutura). Se preferir, o orquestrador redireciona. Achados da auditoria da Fase 2, em ordem de gravidade.

## O que o destinatário precisa fazer

1. **Alta. Tela de pilha aberta direto pela URL (recarregar, link, futura notificação) fica sem saída.** Abrir `/tasks/<id>`, `/tasks/new`, `/contexts`, `/groups` ou `/groups/<id>` por endereço mostra uma faixa em branco no topo, sem seta de voltar (zero links "Voltar"), e essas telas não têm a barra de abas. O detalhe da tarefa não tem botão "Voltar" no corpo (só o erro "não encontrada" tem). A pessoa fica presa. A seção 5.3 pede deep links como parte do desenho (notificação abre a tarefa). Sugestão: `unstable_settings = { initialRouteName: '(tabs)' }` em `apps/app/app/(app)/_layout.tsx` para a pilha ter sempre a raiz por baixo, ou esconder o cabeçalho quando não há para onde voltar e oferecer um botão que leve a `/`.
2. **Média. Rota inexistente mostra a tela padrão do expo-router, em inglês:** "Unmatched Route", "Page could not be found.", "Go back", "Sitemap", fundo preto também no tema claro. Quebra "nenhum texto hardcoded" e confunde. Falta `+not-found.tsx` com i18n, mascote e botão para Hoje.
3. **Média. `<html lang="en">`** (medido no documento servido e no `expo export`), com conteúdo em pt-BR: leitores de tela leem em inglês. Definir `pt-BR` (por exemplo com `+html.tsx` ou o `app.config.ts`). Também falta `<meta name="theme-color">` e, sem tema, o fundo do documento é transparente: no escuro, há um lampejo branco antes do JS carregar.
4. **Média/baixa. Seta de voltar do cabeçalho:** alvo de 30x30px (a regra é 44px) e nome acessível "Voltar, back" (a palavra em inglês vem do React Navigation; `headerBackTitle` só muda o texto visível). Além disso, `title: ''` gera um `<h1>` vazio em todas as telas de pilha (axe `empty-heading`, minor), e o documento sempre tem o título "Azkaban" (o leitor de tela não sabe em que tela está).
5. **Baixa. Sem marcos de página** (axe `region` e `landmark-one-main`): nenhuma tela tem `<main>`.
6. **Baixa. PWA:** não há `manifest`; a seção 5.3 pede PWA instalável. Se for de outra fase, registrar no QUADRO.

## Contratos criados ou alterados

Nenhum.

## Bloqueios e dúvidas

Quem é o dono de `apps/app/app`? Hoje cada agente de feature mexe nele de passagem.

## Como testar

`pnpm dev`; entre, crie uma tarefa, abra o detalhe, recarregue a página (F5) e procure uma forma de sair. Abra `/nope`. Rode o axe nas telas (as saídas completas estão no relatório do QA).
