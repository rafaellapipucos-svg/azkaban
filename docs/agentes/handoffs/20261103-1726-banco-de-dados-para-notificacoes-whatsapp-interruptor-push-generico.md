# Handoff: banco-de-dados para notificacoes-whatsapp, interruptor "esconder o conteúdo na tela bloqueada" (BL-32)

**De:** banco-de-dados
**Para:** notificacoes-whatsapp
**Data:** 2026-11-03 17:26 (BRT)
**Branch:** `feat/decisions-db`

## Contexto

Decisão do humano no BL-32: a opção existe e vem desligada. O banco já tem a coluna e o despacho já a lê; falta o interruptor.

## Contratos criados ou alterados

Nenhum em `packages/contracts` ainda. No banco (`20261106100000_profile_push_hide_content.sql`): `profiles.push_hide_content boolean not null default false`, com `grant update (push_hide_content)` para `authenticated`. Lê e grava pelo mesmo caminho do horário de silêncio (`profiles_select_own`/`profiles_update_own`, `update ... where id = auth.uid()`). Colegas de grupo não a veem (`group_member_profiles()` só devolve o nome). Os tipos em `packages/data/src/database.types.ts` já têm a coluna.

## O que o destinatário precisa fazer

1. Repositório em `packages/data/src/notifications`: ler e gravar `push_hide_content`, como `quiet_hours_start`/`quiet_hours_end`. Se o valor passar por um schema do contrato, pedir ao `arquiteto` o campo (por exemplo `pushHideContentSchema = z.boolean()`).
2. Na tela de preferências de notificação, um interruptor "Esconder o conteúdo na tela bloqueada", desligado por padrão, com uma linha de ajuda: com ele ligado, o aviso diz só que há algo no app, e o detalhe aparece ao abrir. Textos em i18n, alvo de toque ≥ 44px.
3. Só vale para o push (web e nativo); o WhatsApp não muda. Até o `backend-funcoes` fazer o render neutro, ligar a opção já tira o título da tarefa do push (o claim manda `taskTitle` nulo), mas o resto do texto continua o do tipo.

## Como testar

O pgTAP `supabase/tests/rls_push_hide_content.test.sql` cobre o padrão e quem lê e grava. Na E2E, ligar, recarregar e ver o interruptor ligado.
