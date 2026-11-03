# Handoff: arquiteto para prova-foto, câmera, captura e revisão (F3-4 a F3-6)

**De:** arquiteto
**Para:** prova-foto
**Data:** 2026-11-01 17:08 (BRT)

## Contexto

O [ADR-0007](../../adr/0007-prova-por-foto.md) prevalece sobre este resumo. O app é uma camada de conveniência: o servidor decide tudo, e o ADR diz o que ele não pode confiar em você.

## O que foi entregue

Branch `feat/proof-contracts`, a partir de `feat/phase-3-proof`.

## Contratos criados ou alterados

- `packages/contracts/src/proof.ts`: todas as formas do fluxo, e `proofErrorCodeSchema`.
- `packages/contracts/src/contexts.ts`: `contextLocationSchema`.
- `packages/config/src/proof.ts`: `proofRules` e `proofDefaults`.
- `proof.review` em `packages/core/src/permissions/matrix.ts`: use `can(user, 'proof.review', group)`.

## O que o destinatário precisa fazer

**Adapters em `packages/platform` (F3-4).** `.web` e `.native`, com o padrão de três arquivos da arquitetura.

- Câmera web: `getUserMedia`, sem `<input type="file">` e sem seletor de galeria.
- Câmera nativa: `expo-camera`. O nativo só será rodado em F8-7, mas precisa compilar.
- Foto final, em uma função: recebe a captura e o texto, reduz para `captureLongEdgePx`, desenha o carimbo e devolve JPEG em `captureJpegQuality`. Web com `canvas`. Nativo com `react-native-view-shot`.
- SHA-256: `crypto.subtle` na web, que exige HTTPS ou localhost; `expo-crypto` no nativo.
- Geolocalização: só leitura, com recusa tratada como `null`. Sem rastreio contínuo.

**Dados em `packages/data/src/proof`.** `issueChallenge`, `recordConsent`, `submitProof`, `listReviewQueue`, `review`, `signedUrl`. O envio é um `POST` para `proof-validate`, com os bytes no corpo e `meta` em `proofMetaHeader`, como `encodeURIComponent(JSON.stringify(meta))`.

**Captura (F3-5).** Nesta ordem:

1. Aceite pendente: mostre o aviso da seção 14 do ADR e chame `record_proof_consent`. Recusar volta à tarefa, que ainda pode ir para amarelo ou vermelho.
2. `issue_proof_challenge`. Só com conexão: sem ela, explique e não abra a câmera.
3. Com `checkLocation`, explique e peça a posição. Recusar não impede a foto. Sem isso, nunca peça.
4. Câmera, foto, tela de conferir, carimbo com data e hora do aparelho, título da tarefa e nome do usuário. O hash vem depois do carimbo.
5. `submitProof`. A resposta confirma o verde: nada de atualização otimista.

Regras:

- Nada em disco. A foto vive na memória da tela.
- Passou de `expiresInSeconds` antes do envio: descarte a foto e peça outro desafio, porque ela já não pertence a ele.
- Falha de rede ou 5xx: releia a ocorrência antes de tentar de novo. Se já estiver `done`, é sucesso.
- `proof_duplicate` num reenvio: releia também.
- Com a foto ainda na tela, pode reenviar com um desafio novo. `challenge_rate_limited` e erros de foto voltam à câmera ou à tarefa, com mensagem.
- Nunca entra na fila offline.
- Toda mensagem vem de `proofErrorCodeSchema`, em i18n.

**Revisão (F3-6).**

- Fila por grupo: provas `in_review`, sem `supersededAt`, para quem tem `proof.review`.
- Detalhe: foto por `proof-url`, ao abrir. Ao lado, `receivedAt`, o responsável, os dados do aparelho e as marcas. Esses dados são os oficiais, e o carimbo é só desenho: se forem diferentes, a tela deve deixar isso claro.
- Mostre `distanceM` e `flags`, com ícone e texto.
- Aprovar, e contestar com destino e motivo. O formulário segue `proofReviewInputSchema`.
- O revisor não vê o botão na própria prova. O servidor recusa do mesmo jeito.
- Prova contestada mostra "desfazer contestação", que é aprovar.
- `proof_photo_deleted`: mostre o registro sem a imagem.

**Medição.** Com a primeira foto real, registre no LOG o tamanho médio e o máximo em aparelhos comuns, porque a conta de custo da seção 18 parte de uma estimativa de 0,5 MB. Se `maxBytes` estiver apertado ou folgado demais, avise por handoff.

**Features.** `packages/features/proof` expõe as entradas pelo `index.ts`. Tarefas compõem isso pela rota, por `children`: `tarefas-calendario` deixa o lugar. Deep link: notificação de tarefa com foto abre a câmera.

## Bloqueios e dúvidas

- F3-4 só depende deste handoff. F3-5 depende de F3-3, e F3-6, de F3-5.
- `StatusMark` em análise e tokens estão com `design-system`.
- `expo-camera`, `expo-crypto` e `react-native-view-shot` entram como dependências por `expo install`. Confira a compatibilidade com a versão do Expo. Nenhuma tem custo.

## Como testar

`pnpm check` e `pnpm e2e`, com `--use-fake-device-for-media-stream` no Chromium. Os casos:

1. Concluir com foto, do toque à ocorrência verde (exigido pela seção 10 do prompt).
2. Sem aceite: o aviso aparece uma vez, e subir `consentVersion` o traz de volta.
3. Recusar a câmera mostra o caminho para amarelo ou vermelho.
4. Recusar a localização não impede a prova, e o revisor vê a marca.
5. Desafio vencido descarta a foto.
6. Falha de rede depois do commit não duplica nem mostra erro falso.
7. Offline: a câmera não abre.
8. Tarefa com aprovação fica "em análise", com ícone e rótulo, e sem XP na tela.
9. Admin aprova e o XP aparece. Admin contesta e o motivo aparece ao responsável.
10. Autor com `proof.review` não vê os botões de revisão.
11. A imagem não abre depois de a URL vencer.
12. Busca no código: nenhum `input type="file"` nem seletor de imagem no módulo.
13. 375px, claro e escuro, alvos de 44px.
