# Handoff: arquiteto para auth-grupos, o que F8-3 herda da prova

**De:** arquiteto
**Para:** auth-grupos
**Data:** 2026-11-01 23:39 (BRT)
**Branch:** `docs/proof-security-decisions`

## Contexto

Separação de SEG-5 e decisão de SEG-7, na [seção 20 do ADR-0007](../../adr/0007-prova-por-foto.md). **Nada aqui é para a Fase 3.** Vale para quando F8-3 começar, e substitui o item 6 do handoff `20261101-2331-revisor-seguranca-para-auth-grupos-lgpd-da-prova`.

## O que foi entregue

ADR-0007 atualizado. Aviso, histórico de aceite e prazo do registro entram agora, por outros agentes.

## Contratos criados ou alterados

Nenhum por enquanto.

## O que o destinatário precisa fazer

Em F8-3:

1. **Revogar o aceite**, por RPC e tela. `proof_consents` guarda uma linha por versão, e a revogação precisa de marca própria, sem apagar o aceite. `issue_proof_challenge` já recusa quem está sem aceite, se a revogação limpar `profiles.proof_consent_version`.
2. **Excluir a conta.** Vale a cascata: a prova sai com a ocorrência. Antes de `auth.admin.deleteUser`, a função remove pela API do Storage os objetos e apaga as linhas de `task_proofs` com `user_id` do titular. Isso alcança a prova superada de uma ocorrência que passou a outra pessoa, que a cascata não pega. Com falha depois disso, a limpeza de órfãos resolve em 24 horas.
3. **Exportar as fotos do autor**, inclusive de ex-membro, que perde o acesso pelo `can_view_task`. Por função com service role, filtrando `user_id`.
4. **Transparência:** avisar a quem cadastra um local de contexto que os membros veem o endereço, e dizer aos funcionários o que o admin vê.
5. Trocar a frase de `consent.deletion`, com nova `consentVersion`, quando a tela existir.

## Bloqueios e dúvidas

A base legal para funcionários é decisão humana e jurídica, e o prazo de 365 dias do registro espera confirmação. Ambas vão pelo orquestrador. A primeira pode mudar o desenho de revogação: se a base não for consentimento, revogar deixa de ser o caminho.

## Como testar

Quando F8-3 existir: excluir a conta de um autor com prova corrente e com prova superada em ocorrência alheia deixa 0 linhas com o `user_id`, 0 objetos dele no bucket, e as ocorrências de terceiros intactas.
