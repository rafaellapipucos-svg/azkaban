# Handoff: qa-testes para prova-foto, achados do QA da Fase 3

**De:** qa-testes
**Para:** prova-foto (itens 2 e 7 também para `tarefas-calendario`; item 2 depende de decisão do `arquiteto`)
**Data:** 2026-11-01 22:40 (BRT)
**Branch:** `chore/qa-phase-3`

## Contexto

QA do estado integrado da Fase 3. Tudo abaixo foi reproduzido na pilha local, com a câmera falsa do Chrome. Nenhum item deixa uma tarefa verde sem prova: são falhas de tela e de lacuna de requisito.

## O que foi entregue

`e2e/proof-paths.spec.ts`: ex-membro, contestação para vermelho com XP, reabrir exige foto nova, recusa real do servidor e foto mantida sem conexão.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

Em ordem de severidade.

### Média

**1. Prova em análise de tarefa excluída fica presa na fila.** Passos: o admin cria tarefa com foto e aprovação para Duda; Duda envia; o admin exclui a tarefa e abre "Revisar fotos". A prova continua na lista, e "Aprovar" e "Contestar" respondem "Você não pode fazer isso nesta tarefa", porque `can_review_proof` exige `archived_at is null`, e nem `listReviewQueue` nem `canReviewProof` olham isso. Ela só sai pela retenção, em 90 dias, quando vira aprovada e paga o XP. O `arquiteto` decide o que vale: tirar da fila ou deixar revisar. O mínimo é a fila e os botões baterem com o servidor.

**2. A Equipe não mostra as provas aguardando revisão.** A seção 7.1 do prompt mestre pede isso na tela de Equipe. Hoje o único caminho é a página do grupo, por `ProofQueueLink`. `TeamScreen` não tem contagem nem link. A rota pode compor `ProofQueueLink`, como já acontece em `groups/[id]`.

### Baixa

**3. O link da foto fica na tela depois de reabrir.** Em `/tasks/<id>`, "Voltar para pendente" não invalida `proof-current`, e "Ver a foto da prova" continua até recarregar, levando à foto que não conta mais. `useStatusChange` não conhece essa chave. O último bloco de "reopening drops the photo", em `e2e/proof-paths.spec.ts`, reproduz com `test.fail()`. Apague essa linha ao corrigir.

**4. Em 1280x800, o botão "Tirar foto" fica abaixo da dobra.** O quadrado ocupa toda a largura da coluna, e quem usa o computador rola a página para disparar, perdendo parte da imagem. A decisão de quadrado resolveu o celular: em 375x812 o botão aparece, mesmo com título de três linhas. Limitar a altura do quadrado à da janela resolve os dois.

**5. O canto arredondado corta o carimbo na tela.** Em "Confira a foto" e na revisão, `borderRadius` come a primeira letra do nome, na faixa inferior ("Duda"). A foto gravada está inteira. Isso importa porque o carimbo existe para o revisor bater o olho.

**6. Sobras de hardcode.** `ProofCamera.web.tsx:66,70,168` e `ProofCamera.native.tsx:188,199,226` têm cores soltas, contra a seção 10. `ProofReviewScreen.tsx:158` usa `'?'` e mostra `proof.platform` cru ("Enviada de web, versão 0.0.0").

**7. Falta o aviso ao administrador da limitação da web.** O ADR-0007, seção 15, diz que o aviso deve explicar que a web não garante que a foto veio de uma câmera. O formulário de tarefa não diz, e `review.stampNote` só fala do carimbo.

## Bloqueios e dúvidas

O item 1 precisa da decisão do `arquiteto`.

## Como testar

`pnpm db:start` e `pnpm exec playwright test e2e/proof-paths.spec.ts`. Exige Chrome instalado.
