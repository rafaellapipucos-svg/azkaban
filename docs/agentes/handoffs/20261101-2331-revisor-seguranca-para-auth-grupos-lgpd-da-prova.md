# Handoff: revisor-seguranca para auth-grupos, LGPD da prova

**De:** revisor-seguranca
**Para:** auth-grupos, dona de F8-3 (decisões de base legal vão ao humano pelo orquestrador)
**Data:** 2026-11-01 23:31 (BRT)
**Branch:** `chore/security-phase-3`

## Contexto

Revisão de segurança da Fase 3. A minimização resistiu: nenhuma coluna guarda coordenadas, nenhuma linha contém o texto das coordenadas enviadas, e os logs locais não têm nonce, hash, caminho nem posição. As lacunas abaixo são de direitos do titular. Esta é uma leitura técnica, não um parecer jurídico.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG-5, média, bloqueia o uso com funcionários reais.** Conferido no código e nos documentos, sem PoC:

1. **Não há como revogar.** `record_proof_consent` só grava, e nenhuma tela ou RPC retira o aceite. A LGPD pede revogação por procedimento fácil.
2. **Não há base legal escolhida.** `docs/` só cita LGPD no prompt mestre, no ADR-0007 e no quadro. Para funcionário, o consentimento é frágil, porque recusar custa o verde e o XP diante de quem manda no serviço. O humano precisa decidir se a base é outra, com orientação jurídica.
3. **O aceite não prova o que foi lido.** `profiles` guarda a última versão e a data, sem histórico, e aceitar de novo sobrescreve.
4. **O registro sem a foto fica sem prazo.** `user_id`, horários, `flags` e `task_status_history` ficam para sempre: um histórico de presença, com `out_of_radius`, depois do fim do vínculo. O aviso diz só que "o registro sem a imagem continua".
5. **O aviso omite terceiros.** Foto de ambiente, em casa de família ou empresa, pode mostrar outras pessoas. Também não diz que o nome vai carimbado na imagem, nem como pedir exclusão.
6. **F8-3 precisa cobrir:** exportar fotos do autor, que ao sair do grupo perde o acesso, e remover objetos. Hoje a exclusão de conta deixa o objeto até a limpeza de órfãos (SEG-7).

**Menor:** `distance_m` guarda o valor exato mesmo longe do local (5.669.367 m no teste) por 90 dias, e a faixa bastaria ao revisor. `contexts.location_*` é visível a todo membro que vê o contexto, por decisão do ADR, seção 7: se o local for uma casa, o aviso a quem cadastra deveria dizer isso.

## Bloqueios e dúvidas

Itens 2 e 4 são decisão do humano. Sem F8-3 e sem esses dois, a fase não deveria ir para pessoas reais.

## Como testar

Leitura: `supabase/migrations/20261101171600_issue_proof_challenge.sql`, `packages/i18n/src/pt-BR/proof.json` (chave `consent`) e seção 14 do ADR-0007.
