# Handoff: revisor-seguranca para arquiteto, WhatsApp

**De:** revisor-seguranca
**Para:** arquiteto
**Data:** 2026-11-03 01:58 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-5`, a partir de `feat/phase-5-whatsapp` (`9f88a68`)

## Contexto

Primeira passada da revisão de segurança da Fase 5, diff `feat/phase-4-notifications..feat/phase-5-whatsapp`, sem pilha. Achados técnicos foram para `banco-de-dados` (SEG5-1, SEG5-4), `backend-funcoes` (SEG5-2, SEG5-3) e `notificacoes-whatsapp` (SEG5-6). Aqui ficam as decisões e as partes que são suas (contrato, `packages/config`, ADR-0009). Varredura de segredos no diff: só valores de teste (`EAAG-test-token-...`, `app-secret-for-tests-...`, um hex de exemplo no teste do contrato); `supabase/functions/.env.example` só com nomes.

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum. Pedido abaixo (SEG5-3).

## O que o destinatário precisa fazer

**SEG5-3 (contrato), baixa.** Exportar os schemas de elemento do webhook (`webhookStatus` e `webhookMessage`, hoje constantes locais em `packages/contracts/src/whatsapp.ts:205-227`) e afrouxar `whatsappWebhookSchema` para que `statuses` e `messages` sejam arrays de `unknown`, validados um a um pela função. Hoje um elemento fora do formato descarta o lote assinado inteiro, com os PARAR dentro (detalhe no handoff do `backend-funcoes`).

**SEG5-5, baixa, decisão de custo. Não há teto global de envios pagos nem lista de países.** Os limites são 5 por usuário e 5 por número em 24 horas. Contas novas são grátis, então N contas mandam 5N mensagens de autenticação por dia para números de qualquer país (o preço da Meta varia por país, e o bombeamento de códigos de autenticação para números de tarifa alta é um abuso conhecido). Sugestões, a decidir com o humano: `whatsappRules.verification.maxSendsPerDay` global, conferido em `start_phone_verification`, e `allowedCountryCodes` com `["55"]` por padrão, com espelho. Registrar também, como risco aceito ou não: o limite por número deixa qualquer conta bloquear por 24 horas a verificação do número de outra pessoa (5 pedidos), e o `phone_rate_limited` revela que alguém pediu códigos para aquele número há pouco. Não revela conta.

**SEG5-6 (decisão), baixa. URL e controle bidirecional nos parâmetros do resumo.** Títulos e contextos escritos por outra pessoa chegam do número da empresa, com URL clicável. O `notificacoes-whatsapp` vai tirar os controles bidirecionais em `cleanParam`. Falta decidir: (a) aceitar e registrar a URL no ADR-0009, ou (b) desarmar (por exemplo, sem o esquema e com o ponto do domínio trocado). Vale considerar que denúncias de destinatários derrubam a nota de qualidade do número na Meta. Se quiser a regra também no contrato, `whatsappTextParamSchema` pode recusar U+202A a U+202E e U+2066 a U+2069.

**SEG5-7, baixa, LGPD. O aviso v1 e a lista de exportação.** O aviso ainda é rascunho, então mudar não exige `_v2`:

- diz "títulos", mas o resumo leva também o nome dos contextos e das áreas;
- não diz que o número fica guardado e que pode ser removido no app (`remove_phone`);
- não aponta para a política de privacidade (F8-3).

E o ADR-0009, seção 11, na exportação de F8-3, não cita `phone_verifications` (os números que a pessoa digitou, por até 48 horas). Com o SEG5-4 corrigido (`on delete set null`), a seção 11 precisa dizer que essas linhas sobrevivem à exclusão da conta, sem `user_id`, até a retenção.

**SEG5-8, baixa, preventivo. Segredo de demonstração aceito em produção.** `parseWhatsAppEnv` (`packages/config/src/whatsapp-env.ts`) aceita qualquer texto com 16 ou mais caracteres. Se o `.env.example` ganhar `WHATSAPP_APP_SECRET` ou `WHATSAPP_VERIFY_TOKEN` com `local-demo-` para a E2E, e esse valor for copiado para o projeto hospedado, qualquer um assina um webhook e desliga o WhatsApp de quem tiver o número conhecido (o PARAR casa pelos dígitos do telefone). Sugestão: recusar o prefixo `local-demo-` com `meta`, e a função recusar com `console` fora da pilha local. O mesmo vale para o `CRON_SECRET=local-demo-cron-secret` que já existe, se ainda não houver guarda.

**Para registro, sem achado.** O webhook é a única porta de `whatsapp_stop_by_wa_id` e de `record_whatsapp_statuses` (só `service_role`), e forjar um `wa_id` exige o segredo do app. A fonte do resumo usa `can_view_task_for` e o responsável; nada de outro membro (telefone, opt-in, `wa_id`) sai por `group_member_profiles()`, `team_overview`, embed, view ou Realtime.

## Bloqueios e dúvidas

SEG5-5 e a parte (a)/(b) do SEG5-6 são do humano, com a sua recomendação. Sugiro registrar as decisões como seção "Revisão de segurança da Fase 5" no ADR-0009, como a seção 17 do ADR-0008.

## Como testar

Conforme cada decisão; o pgTAP de SEG5-5 entra no `banco-de-dados` se o teto for aprovado.
