# ADR-0012: Fase 8: LGPD, limites de uso, fila offline e polimento

**Status:** aceito pelo arquiteto para a Fase 8. Fica sujeito à validação do humano na aprovação da fase. Os valores da seção 17 são padrões a confirmar, todos em config ou numa migration.

## Contexto

A Fase 8 da seção 14 do prompt mestre é o polimento: acessibilidade, animações, performance, E2E completo e preparação para iOS e Android. O QUADRO pôs nela também o que a seção 9 pede e nenhuma fase fez: exportar os dados, excluir a conta, transparência para funcionários (F8-3), limites de uso em OTP e convites (F8-4), e a fila offline (F8-5). Os ADRs anteriores deixaram pedidos explícitos para F8-3: ADR-0007, seções 14 e 20, e o handoff `20261101-2339-arquiteto-para-auth-grupos-f8-3-da-prova`; ADR-0008, seção 15; ADR-0009, seção 11; ADR-0010, seções 7 e 14; ADR-0011, consequências. E pedidos para F8-4 e F8-5: ADR-0008, seção 17 (SEG4-1), ADR-0010, seção 14 (SEG6-2), ADR-0011, seções 12 e 16 (SEG7-2).

Este ADR decide o que os agentes precisam para trabalhar em paralelo. Trata as tabelas da Fase 6 (`xp_events` estendida, `user_stats`, `user_day_stats`, `achievements`, `user_achievements`, `groups.ranking_enabled_at`) como existentes: a Fase 6 está em `feat/phase-6-gamification` e entra antes de qualquer migration desta fase (seção 14). Onde houve mais de uma saída boa, ficou a mais fácil de reverter.

## Decisão

### 1. Panorama

| Trilha                       | Onde roda                                                         | Corre em paralelo?                                       |
| ---------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| F8-3 exportar                | Edge Function `account-export` + função SQL só de `service_role`  | Sim, contra o contrato; a integração espera a função SQL |
| F8-3 excluir                 | Edge Function `account-delete` + funções SQL só de `service_role` | Idem                                                     |
| F8-3 revogar e transparência | RPC `revoke_proof_consent`; telas de `auth-grupos`                | Telas já; a revogação espera a migration                 |
| F8-4 limites                 | Painel do Supabase (GoTrue) + `consume_rate_limit` no Postgres    | Sim; o cliente só mapeia `rate_limited`                  |
| F8-5 fila offline            | Cliente: TanStack Query com mutações pausadas e persistidas       | Sim; o stepper idempotente espera a migration            |
| F8-1, F8-6                   | Revisão e metas medidas, sem servidor                             | Sim, desde já                                            |
| F8-7                         | `app.config.ts`, `eas.json`, adapters nativos, sem conta paga     | Sim, desde já                                            |
| F8-8                         | Depende do humano                                                 | Só a pergunta                                            |

Nenhuma trilha importa outra. O que liga as trilhas está em `packages/contracts/src/privacy.ts`, `packages/contracts/src/shopping.ts` (`requestId`), `rateLimitedErrorCode` em `common.ts` e `packages/config/src/limits.ts`.

### 2. Exportar meus dados (F8-3)

**Formato:** um arquivo JSON em UTF-8, `azkaban-dados-AAAA-MM-DD.json`, no envelope de `accountExportSchema`: `format`, `version`, `generatedAt`, `userId`, `photoUrlsExpireAt` e `sections`. Toda seção é uma lista de linhas, com as colunas do banco em snake_case, menos as que a tabela abaixo tira. Uma tabela de uma linha só vira lista de zero ou uma. É legível por máquina, o que atende à portabilidade, e não exige biblioteca nova.

| Seção                      | Origem e filtro                                                                                             | Fica de fora                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `account`                  | `auth.users` do titular: `id`, `email`, `created_at`, `email_confirmed_at`, `last_sign_in_at`               | Senha, tokens, metadados internos do GoTrue                    |
| `profile`                  | `profiles` do titular, inteira (telefone, verificação, opt-in e opt-out, resumo, silêncio, aceite da prova) | Nada                                                           |
| `proof_consents`           | `user_id`                                                                                                   | Nada                                                           |
| `group_memberships`        | `group_members` do titular, com nome e tipo do grupo                                                        | Os outros membros                                              |
| `owned_groups`             | `groups` com `owner_id` do titular                                                                          | Nada                                                           |
| `created_invites`          | `group_invites` com `created_by` do titular                                                                 | `code`: é a credencial do grupo e pode estar valendo           |
| `contexts`                 | `owner_user_id` do titular (pessoais) e `created_by` do titular (de grupo)                                  | Nada                                                           |
| `tasks`                    | `assignee_id` ou `created_by` do titular                                                                    | Nada                                                           |
| `occurrences`              | `task_occurrences` com `assignee_id` do titular                                                             | Nada                                                           |
| `status_history`           | `changed_by` do titular, ou ocorrência dele                                                                 | Nada                                                           |
| `rule_changes`             | `task_rule_changes` com `changed_by` do titular                                                             | Nada                                                           |
| `proofs`                   | `task_proofs` com `user_id` do titular, **inclusive de ex-membro e superadas**, com `photo_url` assinada    | `storage_path`, interno                                        |
| `proof_reviews`            | `task_proofs` com `reviewed_by` do titular e autor diferente: `id`, `occurrence_id`, decisão, data e nota   | Autor, foto, hash, marcas: são dados de outra pessoa           |
| `xp_events`                | `user_id`                                                                                                   | Nada                                                           |
| `user_stats`               | `user_id`                                                                                                   | Nada                                                           |
| `user_day_stats`           | `user_id`                                                                                                   | Nada                                                           |
| `achievements`             | `user_achievements` com `user_id`                                                                           | Nada                                                           |
| `notifications`            | `user_id`                                                                                                   | Nada                                                           |
| `notification_preferences` | `user_id`                                                                                                   | Nada                                                           |
| `push_subscriptions`       | `user_id`, com o host do serviço no lugar do endpoint                                                       | `endpoint`, `p256dh` e `auth`: juntos, enviam push ao aparelho |
| `phone_verifications`      | `user_id` (os números digitados, por até 48 horas)                                                          | `code_hash`                                                    |
| `whatsapp_messages`        | `user_id`, como estão, sem conteúdo                                                                         | Nada                                                           |
| `shopping_lists`           | Pessoais (`owner_user_id`) e de grupo com `created_by` ou `completed_by` do titular                         | Nada                                                           |
| `shopping_list_items`      | Itens das listas pessoais, e itens de grupo com `added_by` ou `checked_by` do titular                       | Nada                                                           |
| `shopping_catalog_items`   | Catálogo pessoal (`owner_user_id`)                                                                          | Nada                                                           |

**Fora da exportação, e por quê:** `proof_challenges` (o nonce é credencial e a linha some em 24 horas); `notification_outbox` (estado de entrega, sem conteúdo, o conteúdo está em `notifications`; some em 30 dias); `rate_limit_counters` e `processed_requests` (técnicas, 48 horas); `whatsapp_console_messages` (só de desenvolvimento, sem `user_id`); o ranking (é derivado do XP de outros, ADR-0010); dados de outros membros; `account_deletions`.

**Fotos por URL assinada, não embutidas.** O pior caso de uma conta são 30 fotos de 2 MiB por dia durante 90 dias (ADR-0007, seção 17), muito acima da memória de uma Edge Function. A URL vale `privacyDefaults.exportPhotoUrlTtlSeconds` (1 hora), e `photoUrlsExpireAt` diz até quando. Foto já apagada pela retenção tem `photo_url` nulo e `photo_deleted_at` preenchido. Exportar de novo gera links novos.

**Onde roda:** Edge Function `account-export`, `verify_jwt = true`, que pede o usuário ao Auth como `proof-url` (uma chave anon ou de serviço não passa). Ela:

1. chama `consume_rate_limit(user, 'data_export')` (seção 4), 3 por 24 horas: a exportação lê todas as tabelas e assina todas as fotos;
2. chama `export_user_data(p_user uuid) returns jsonb`, função SQL executável só por `service_role`, que monta as seções da tabela acima. É service role porque a RLS esconde o que a exportação precisa: a prova de ex-membro, `phone_verifications`, `whatsapp_messages` e `auth.users`;
3. assina as fotos em lote pela API do Storage;
4. responde `Content-Type: application/json`, `Content-Disposition: attachment` e `Cache-Control: no-store`.

O arquivo não é guardado em lugar nenhum. Log: só o resultado e o código de erro, nunca ids, e-mail ou conteúdo. Erros: `rate_limited` (429, com `retryAfterSeconds`) e `export_failed` (500), por `privacyErrorSchema`.

**Teto:** uma conta de 400 dias com 30 ocorrências por dia dá cerca de 12 mil linhas, alguns megabytes. Se uma exportação passar de 50 MB, o caminho é gerar por seções.

**Cliente:** um adapter `saveTextFile(fileName, text)` em `packages/platform`, por `Blob` e `<a download>` na web. No nativo, responde "não suportado" até F8-7, e a tela diz para usar a web.

### 3. Excluir minha conta (F8-3)

**Fluxo:**

1. A tela chama `account-delete` com `{ dryRun: true }` e mostra a prévia (`accountDeletePreviewSchema`): os grupos de que a pessoa é dona e que têm outros membros (bloqueiam) e os que só têm ela (saem junto).
2. **Grupo com outros membros bloqueia.** A pessoa passa a posse (`transfer_group_ownership`, que já existe) ou exclui o grupo antes. Excluir sozinho o grupo de outras pessoas, ou escolher por ela um novo dono, seria pior. `groups.owner_id` já recusa a exclusão do dono (ADR-0004), e isso continua.
3. **Grupo só dela sai junto**, com tudo que a cascata do grupo leva. A prévia lista esses grupos pelo nome antes da confirmação.
4. A confirmação é digitar uma palavra, como em outros apps. É só do cliente; a barreira do servidor é a do passo 5.
5. **Login recente:** a função exige que a última autenticação da sessão tenha no máximo `privacyDefaults.reauthMaxAgeMinutes` (15). Lê o maior `timestamp` de `amr` do JWT, que a renovação do token não muda; sem ele, `auth.sessions.created_at` do `session_id`. Mais velha: 401 `reauth_required`, e a tela pede para entrar de novo (senha ou link mágico) e volta. Uma sessão esquecida aberta não exclui a conta. **A conferir pelo `backend-funcoes` no GoTrue local:** que `amr` traz `timestamp` e que ele não muda no refresh.
6. Com `{ dryRun: false }`, a função, nesta ordem:
   1. `begin_account_deletion(p_user)`, só `service_role`: confere os bloqueios de novo (409 `owns_groups` com a prévia, se mudou), grava ou reaproveita a linha de `account_deletions` e devolve os caminhos do Storage das provas com `user_id` do titular e das provas das ocorrências dos grupos só dele;
   2. remove os objetos pela API do Storage, em lotes. Objeto inexistente não é erro;
   3. `finish_account_deletion(p_user)`, numa transação: apaga os grupos só dele e as linhas de `task_proofs` com `user_id` do titular, e anota as contagens;
   4. `auth.admin.deleteUser(user)`: a cascata de `auth.users` para `profiles` leva o resto;
   5. marca `completed_at` e apaga as linhas de `account_deletions` mais velhas que `privacyDefaults.deletionLogRetentionDays` (365);
   6. responde `{ deleted: true }`. O app sai da conta só neste aparelho (`signOut({ scope: 'local' })`), descarta a fila offline e a chave local do push, e volta às boas-vindas.

Falha no meio: 500 `delete_failed`. Repetir é seguro, porque cada passo pula o que já sumiu. Se a função morrer depois do passo 2, as linhas apontam para objetos que não existem, e `proof-url` responde como foto apagada; se morrer antes do passo 4, a conta continua, e a pessoa tenta de novo. A limpeza de órfãos de `proof-retention` cobre o objeto que escapar, em 24 horas.

**O passo 3 existe por causa do SEG-7 do ADR-0007:** a prova superada de uma ocorrência que passou a outra pessoa tem `user_id` com `on delete set null` e sobreviveria à cascata.

**O que a cascata apaga** (tudo por `user_id`, `assignee_id` ou `owner_user_id`): perfil, aceites, participações, contextos pessoais, tarefas e ocorrências atribuídas a ela (inclusive em grupos, com o histórico e as provas delas), XP e as três tabelas da Fase 6, sino, preferências, inscrições de push, outbox, mensagens do WhatsApp, listas e catálogo pessoais, contadores de limite e pedidos já aplicados.

**O que fica, sem o nome, e por quê:**

| Fica                                                        | Como                                                         | Por quê                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Tarefas que ela criou para outras pessoas                   | `created_by` nulo                                            | São o trabalho de outra pessoa                                                                             |
| Histórico de status e rastro de regras em tarefas de outros | `changed_by` nulo                                            | É o registro da tarefa de outra pessoa (ADR-0005)                                                          |
| Decisão e nota das provas de outros que ela revisou         | `reviewed_by` nulo                                           | A prova é de outra pessoa; a decisão sustenta o verde ou o vermelho dela                                   |
| Listas e itens de grupo                                     | `created_by`, `completed_by`, `added_by`, `checked_by` nulos | A lista é do grupo; a tela já mostra "conta excluída" (ADR-0011)                                           |
| Convites que ela criou, e quem convidou                     | `created_by`, `invited_by` nulos                             | O convite é do grupo; excluir a conta equivale a sair, e sair não cancela convites (ADR-0004)              |
| `phone_verifications`                                       | `user_id` nulo, até 48 horas                                 | O limite por número precisa sobreviver (ADR-0009, SEG5-4)                                                  |
| `account_deletions`                                         | `user_id` sem chave, 365 dias                                | Responder "minha conta foi excluída?" e auditar a operação. O UUID não liga a mais nada depois da exclusão |
| Ids em `notifications.data` de outras pessoas               | Id solto, até 30 dias                                        | O sino de outra pessoa; o nome some, e a tela mostra "conta excluída"                                      |

**Fora do alcance do app, e dito na política:** os logs da plataforma (API, Auth e funções, com IP, pelo prazo do plano), `auth.audit_log_entries` se a função não puder apagá-las (o `banco-de-dados` confere se guardam e-mail ou IP e se `service_role` as apaga), e cópias de backup até vencerem.

**Consequência a confirmar pelo humano:** excluir a conta de um funcionário apaga as tarefas atribuídas a ele no grupo, com o histórico. O admin perde o registro. Se a base legal exigir guardar registros de trabalho, a saída é reatribuir antes de apagar, e isso muda o schema (seção 17, item 3).

**Para o `banco-de-dados` provar antes de tudo:** um pgTAP que apaga de `auth.users` um usuário com linhas em todas as tabelas acima, inclusive ocorrências que disparam os triggers de status, de XP e de dia (`refresh_user_day` de um perfil que está sumindo não pode tentar gravar `user_day_stats`), e itens de compras sob os guardas (ADR-0011, SEG7-4), e termina sem erro. E `revoke_invites_on_removal`, que hoje cancela todos os convites do grupo quando `auth.uid()` difere de quem sai: na cascata `auth.uid()` é nulo, então excluir a conta de um membro cancelaria os convites de todos os grupos dele. Excluir a conta é sair: o trigger pula quando o perfil de `old.user_id` já não existe.

**Auditoria:** `account_deletions` (`id`, `user_id` sem chave estrangeira, `requested_at`, `completed_at`, `groups_deleted`, `proofs_deleted`, `objects_deleted`), RLS ligada e nenhum `grant` a `anon` nem `authenticated`. A poda vai na própria exclusão seguinte, com o prazo passado pela função, como `notificationDefaults`: sem exclusão nenhuma, linhas velhas ficam, e é só um UUID com contagens.

### 4. Limites de uso (F8-4)

**OTP e senha, pelo GoTrue.** O Supabase já limita, por IP e por projeto, e os valores do projeto hospedado vêm do painel (Authentication, Rate Limits), não do `config.toml`:

| Limite                                          | Padrão hospedado                          | Decisão                                                                |
| ----------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| E-mails por hora (link mágico, cadastro, senha) | 2 por hora no servidor de e-mail embutido | Exige SMTP próprio (seção 17, item 6); com ele, 30 por hora            |
| Intervalo entre e-mails ao mesmo endereço       | 60 s (`max_frequency`)                    | 60 s                                                                   |
| Entradas e cadastros por IP                     | 30 a cada 5 minutos                       | Mantém. Cobre a força bruta de senha                                   |
| Verificações de OTP e link por IP               | 30 a cada 5 minutos                       | Mantém                                                                 |
| Renovações de token por IP                      | 150 a cada 5 minutos                      | Mantém                                                                 |
| Validade do link mágico                         | 1 hora                                    | Mantém: o público abre o e-mail mais tarde                             |
| CAPTCHA                                         | Desligado                                 | Fica desligado; Turnstile é grátis e entra se houver abuso de cadastro |

- **O `config.toml` local continua permissivo** (`max_frequency = "1s"`, confirmação desligada, redirecionamentos com curinga), porque a E2E manda vários e-mails seguidos. **Nunca rode `supabase config push`** com ele: levaria esses valores ao projeto hospedado. `docs/implantacao.md`, seção 4, lista os valores de produção.
- O servidor de e-mail embutido só entrega para os endereços da equipe do projeto e para por volta de 2 por hora. **Sem SMTP próprio não há login por link mágico em produção para mais ninguém.** As opções sem custo ficam na seção 17.
- O cliente mapeia o 429 do GoTrue (`over_email_send_rate_limit`, `over_request_rate_limit`) para um texto de "espere um pouco", em `auth-grupos`.
- O OTP do telefone já tem limites próprios (ADR-0009, seção 3 e SEG5-5). Os desafios de prova também (ADR-0007, seção 17).

**Mecanismo geral no Postgres, sem serviço pago.** Janela fixa por usuário e ação:

```sql
create table public.rate_limit_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits int not null,
  primary key (user_id, action, window_start)
);
```

- `consume_rate_limit(p_user uuid, p_action text)`, `security definer`, executável só por `service_role` e chamada de dentro das RPCs e triggers (um cliente que a chamasse gastaria o limite de outra pessoa). Lê `limit` e `windowSeconds` de `app_settings.rate_limit_rules`, calcula o início da janela a partir da época, faz `insert ... on conflict do update set hits = hits + 1 returning hits` e, acima do limite, `raise exception 'rate_limited' using errcode = 'PT429', hint = <segundos até o fim da janela>`. O PostgREST responde 429. Ação desconhecida é erro de programação e levanta outra exceção.
- A exceção desfaz o `+ 1` do pedido recusado, então o contador para no limite e só conta o que passou. É o que se quer aqui: o limite é de ações feitas. O caso oposto, contar tentativas que falham, não usa este mecanismo (ADR-0009, seção 3, devolve em vez de levantar).
- `p_user` nulo (service role, migrations, seeds) não conta.
- **Teto:** janela fixa deixa passar até o dobro na virada. Barato e suficiente; janela deslizante custa uma linha por ação.
- **Limpeza:** o cron diário de retenção apaga contadores mais velhos que `rateLimitRules.counterRetentionHours` (48) e pedidos de `processed_requests` (seção 5) mais velhos que `idempotencyRetentionHours` (48).
- **Contrato:** `rateLimitedErrorCode` em `packages/contracts/src/common.ts`. Cada módulo mapeia para o próprio `errors.rate_limited`, com o tempo de espera se quiser. Os enums de erro dos módulos não mudam, para não quebrar os testes de cobertura de i18n antes de o texto existir.

**Onde entra, `rateLimitRules.actions`:**

| Ação                   | Onde                                       | Limite       | Pedido                             |
| ---------------------- | ------------------------------------------ | ------------ | ---------------------------------- |
| `task_create`          | Trigger `before insert` em `tasks`         | 200 por hora | SEG6-2, criar em massa             |
| `occurrence_status`    | `set_occurrence_status`                    | 600 por hora | SEG4-1, laço de status             |
| `shopping_list_create` | `create_shopping_list`                     | 30 por hora  | SEG7-2, criar e finalizar em série |
| `invite_create`        | Trigger `before insert` em `group_invites` | 30 por dia   | Seção 9 do prompt mestre           |
| `invite_lookup`        | `get_invite_preview`                       | 30 por hora  | Idem                               |
| `data_export`          | `account-export`, pela service role        | 3 por dia    | Seção 2                            |

- **`accept_invite` sem limite próprio:** ele levanta `invite_invalid`, que desfaria o contador. Chutar códigos é inviável (10 caracteres, cerca de 8 × 10^14 combinações, ADR-0004), e a prévia, que é o caminho do app, conta.
- Itens de compras e o stepper não entram: cada lista tem teto de 200 itens, e o modo "no mercado" toca muito.

### 5. Fila offline simples (F8-5)

**Mecanismo: o TanStack Query, que já está instalado.** Mutações com `networkMode` padrão pausam sem conexão e retomam ao voltar. Para sobreviver a um recarregamento, só as mutações da fila vão para o disco, por `dehydrate` e `hydrate`, que já vêm em `@tanstack/react-query`, gravadas com o `storage` de `packages/platform` (AsyncStorage, que na web é o `localStorage`) a cada mudança nas mutações da fila. Nenhuma dependência nova. A alternativa, uma fila própria, reescreveria pausa, retomada e persistência.

**Por que sem `@tanstack/react-query-persist-client` e `@tanstack/query-async-storage-persister`** (a primeira versão deste ADR as escolhia; mudou na entrega, handoff `20261103-0600-tarefas-calendario-para-arquiteto-fila-sem-dependencias`): `persistQueryClientRestore` apaga sem aviso o que passou de `maxAge`, e aqui o aviso é por ação; `PersistQueryClientProvider` não troca de persister quando o usuário muda, e a chave leva o `userId`; o throttle do persister pode gravar depois de um descarte. Gravar direto é barato, porque são poucas mutações pausadas. O lockfile não muda.

- Cada ação da fila tem `mutationKey` e `setMutationDefaults` registrados antes de `resumePausedMutations`, porque a função não é serializada; só as variáveis vão para o disco.
- As variáveis passam de novo pelo contrato antes de executar: o disco é do usuário.
- Descarte por idade: `offlineDefaults.maxAgeHours` (24), contado da hora do toque (`submittedAt` da mutação) e conferido por ação, na hora em que ela iria rodar. Uma ação mais velha sai com aviso. `offlineDefaults.maxItems` (200) limita a fila.
- A chave no `storage` leva o `userId`. Sair da conta com ações pendentes pede confirmação ("N alterações ainda não foram enviadas") e, confirmado, descarta. Outra conta no mesmo aparelho nunca vê a fila de outra.
- `buster` com a versão do formato (`formatVersion`, gravado junto do estado): mudar as variáveis de uma ação descarta a fila antiga em vez de executá-la errada.
- **Nativo:** sem NetInfo, o `onlineManager` acha que está sempre online, e a falha de rede faz a mutação tentar de novo com `retry`. `@react-native-community/netinfo` entra em F8-7, com o build nativo. Até lá, o alvo é a web.

**O que entra, e só isso:**

| Ação                                      | Idempotência                                                                       | Conflito                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Marcar status (`set_occurrence_status`)   | `expectedStatus` gravado na hora do toque                                          | `status_conflict`: relê. Se já está no destino, conta como feito (a resposta se perdeu); senão, descarta com aviso |
| Item avulso (`insert`)                    | `id` gerado no cliente antes de enfileirar; `23505` na repetição conta como feito  | `list_completed` ou `forbidden`: descarta com aviso                                                                |
| Stepper (os dois caminhos)                | `requestId` gerado no cliente por toque (contrato); o banco aplica cada id uma vez | Idem                                                                                                               |
| Marcar item (`set_shopping_item_checked`) | Já é um valor                                                                      | Idem                                                                                                               |

- **Toque desatualizado para o mesmo destino:** a regra do `status_conflict` da tabela (relê; já no destino conta como feito) vale para toda marcação de status, também online, porque toda marcação passa pela mesma ação. Quem marca "feito" numa tela velha, depois de outra pessoa ou outro aparelho já ter marcado "feito", não vê erro: o resultado que queria já está lá.
- **Ordem:** a fila executa em ordem, uma de cada vez (`scope` da mutação com um id fixo). Sem fusão de ações: concluir e reabrir offline vão as duas, e o servidor confere cada transição. Fundir poderia transformar uma sequência válida numa transição inválida.
- **Outros erros de negócio** (`forbidden`, `late_window_expired`, `reason_required`, `invalid_transition`, `proof_required`, `rate_limited`): descarta com aviso, sem tentar de novo. Rede e 5xx: tenta de novo, sem teto de tentativas (a espera entre elas cresce até 30 s). O único limite é o descarte por idade: um defeito do servidor que responda 5xx sempre segura a fila até a ação passar de 24 h e sair com aviso. Aceito, porque um teto de tentativas descartaria ações boas numa queda longa do servidor; se o caso aparecer, o teto entra em `offlineDefaults`. 401: espera a sessão.
- **O horário que vale é o do servidor.** Concluir às 23h50 sem rede e enviar às 0h10 pode virar "concluído atrasado" ou passar da janela. É o mesmo princípio da prova (ADR-0007, seção 5): o relógio do aparelho é declaração.
- **Tela:** o status otimista aparece já, e um aviso discreto diz "sem conexão: N alterações serão enviadas" (`useMutationState` das pausadas). O descarte aparece como aviso com o motivo.

**Stepper idempotente, no banco:** `adjust_shopping_item_quantity` e `add_catalog_item_to_list` ganham `p_request_id uuid default null`. Com o id, insere em `processed_requests (request_id uuid primary key, user_id uuid not null references profiles on delete cascade, created_at timestamptz not null default now())` com `on conflict do nothing`, na mesma transação; se o id já existia, devolve a linha atual sem somar. A chave primária serializa duas repetições simultâneas. RLS ligada e nenhum `grant`. É genérica no nome porque outro pedido não idempotente pode usá-la; hoje só o stepper usa.

**Fica fora:** criar, editar e excluir tarefa; prova (nunca entra, ADR-0007, seção 16: sem rede, a câmera fica desligada, e `done` em tarefa com foto não passa por `set_occurrence_status`); finalizar lista (fica desligado sem conexão, porque dá XP e não volta atrás); criar, renomear e excluir lista; catálogo; grupos, convites, perfil, preferências e privacidade. Esses mostram o erro de rede de sempre.

### 6. Consentimentos e revogação (F8-3)

- **Prova por foto:** `revoke_proof_consent()`, RPC `authenticated`. A revogação tem marca própria e não apaga o aceite (handoff de 2026-11-01 23:39): `proof_consents` troca a chave `(user_id, version)` por `id`, ganha `revoked_at` e um `unique (user_id, version) where revoked_at is null`. Revogar marca a linha ativa e zera `profiles.proof_consent_version` e `proof_consent_at`; `issue_proof_challenge` já recusa sem aceite. Aceitar de novo grava outra linha, então a história fica inteira. Só há dados de desenvolvimento.
- `claim_proof_challenge` confere o aceite de novo, para um nonce emitido um minuto antes da revogação não servir.
- **As fotos já enviadas seguem a retenção** (90 dias, ADR-0007, seção 14) e saem antes só com a exclusão da conta. Apagar a foto de uma ocorrência verde, ou contestada, tiraria do grupo a evidência em revisão. Depende da base legal (seção 17, item 2).
- `consent.deletion` ganha a frase nova, com `consentVersion` 3, apontando para a tela de privacidade (handoff de 2026-11-01 23:39, item 5).
- **WhatsApp:** já tem `whatsapp_opt_out()` e `remove_phone()`. A tela de privacidade só aponta para elas.
- **Localização:** é a permissão do sistema; o app não guarda coordenadas. A tela diz onde desligar.
- **Push:** já se desliga por aparelho e por tipo.
- **Ranking:** sem opção individual de sair (ADR-0010, seção 13, item 6).

**Tela "Privacidade"** em Perfil (`auth-grupos`): exportar, excluir, o estado do aceite da prova com o botão de revogar, atalhos para as preferências de notificações e WhatsApp (composição pela rota) e a transparência. Política de privacidade: a tela é o esqueleto; quem é o controlador, o contato do encarregado e a base legal esperam o humano (seção 17, itens 1 e 2). Sem isso, nada de inventar um endereço (ADR-0007, seção 20). O link que o aviso do WhatsApp promete (ADR-0009, SEG5-7) aponta para essa tela.

### 7. Transparência para funcionários (F8-3)

Uma tela "O que quem administra vê", aberta de Privacidade, do detalhe de cada grupo e, num grupo `company`, da tela de entrar por convite, antes de aceitar. Textos em i18n, números lidos da config (`proofRules`, `notificationRules`, `gamificationRules`). Por grupo, mostra o que vale ali: o tipo e se o ranking está ligado.

O texto cobre, no mínimo, o que os ADRs pediram:

1. **Quem administra vê** as tarefas do grupo atribuídas a você, com status, horários, atrasos, justificativas do amarelo e o histórico de quem mudou o quê e quando, na Equipe e no detalhe (ADR-0005, ADR-0006), e o rastro de mudanças das regras de foto (ADR-0007, SEG-1).
2. **Não vê** tarefas privadas, contextos pessoais, o que você faz em outros grupos, listas pessoais, seu e-mail, seu telefone, se você recebe o WhatsApp, seu nível, ofensiva, total de XP e conquistas (ADR-0003, ADR-0009, ADR-0010, ADR-0011).
3. **Membros veem** seu nome e seu papel no grupo.
4. **Prova por foto** (ADR-0007, seção 14 e handoff de 2026-11-01 23:39): quem vê (você e quem revisa no grupo, nunca colegas; em tarefa privada, só você); o carimbo com nome, título e horário; que outras pessoas podem aparecer; aparelho, navegador e versão do app; a distância até o local do contexto, nunca as coordenadas; que os membros veem o endereço de um contexto com local; que quem administra pode exigir foto, aprovar e contestar; que a web não garante que a foto veio da câmera (seção 15), e o aviso ao admin diz o mesmo; os prazos de 90 e 365 dias.
5. **Avisos** (ADR-0008): quem criou a tarefa é avisado quando você muda o status dela; quem revisa provas é avisado da prova em análise; o vermelho automático avisa você.
6. **WhatsApp** (ADR-0009, seção 11): é opcional e só seu; quem administra não liga, não desliga e não vê o número.
7. **Ranking** (ADR-0010, seção 14, itens a a d): ligado, os colegas veem seu nome e o XP semanal das tarefas daquele grupo, e quem administra pode ligar a qualquer momento; conta só desde que foi ligado e desde que você entrou, e mostra a semana corrente e a anterior; `user_day_stats` guarda por dia quantas tarefas você planejou, concluiu e perdeu, visível só para você; nível, ofensiva, total e conquistas não aparecem para ninguém.
8. **Compras** (ADR-0011): quem adicionou e quem marcou aparecem para os membros; listas pessoais ninguém vê.
9. **Excluir a conta** apaga suas tarefas, inclusive as do grupo, com o histórico; ficam, sem o seu nome, as tarefas que você criou para outros, as revisões que fez e os itens de listas do grupo (seção 3).

### 8. Retenção consolidada

| Dado                                                              | Prazo                    | Onde                             |
| ----------------------------------------------------------------- | ------------------------ | -------------------------------- |
| Foto da prova                                                     | 90 dias                  | `proofRules.retentionDays`       |
| Registro da prova sem foto                                        | 365 dias                 | `proofRules.recordRetentionDays` |
| Desafio de prova                                                  | 24 horas                 | `proof-retention`                |
| Sino e outbox                                                     | 30 dias                  | `notificationRules`              |
| Inscrição de push sem entrega                                     | 90 dias                  | `notificationRules`              |
| Código de telefone                                                | 48 horas                 | `whatsappRules`                  |
| Status de mensagem do WhatsApp                                    | 30 dias                  | `whatsappRules`                  |
| Caixa de saída de desenvolvimento                                 | 1 dia                    | `whatsappRules`                  |
| Contadores de limite e pedidos aplicados                          | 48 horas                 | `rateLimitRules`                 |
| Registro de exclusões                                             | 365 dias                 | `privacyDefaults`                |
| Arquivo de exportação                                             | Não é guardado           | —                                |
| Tarefas, ocorrências, histórico, XP, gamificação, compras, perfil | Enquanto a conta existir | ADR-0005, ADR-0010, ADR-0011     |

`user_day_stats` antes do piso de `historyDays` não é podado nesta fase (ADR-0010, seção 13, item 15).

### 9. Acessibilidade e reduzir movimento (F8-1)

**Escopo:** todas as telas do app, nos dois temas, a 375 e 1280 px, mais 320 px onde já há percurso.

**Critérios de aceite:**

1. `@axe-core/playwright` (dependência de desenvolvimento de `e2e/`, grátis) com WCAG 2.1 A e AA: zero violações `serious` e `critical` nas telas do percurso de `e2e/walk.ts`.
2. Contraste AA de todo par de cores de texto e fundo dos tokens, nos dois temas, conferido por teste de unidade em `packages/ui`.
3. Todo elemento interativo com nome acessível e papel; avisos que surgem sozinhos (sino ao vivo, descarte da fila, comemoração) anunciados por região viva; folhas e diálogos prendem o foco e o devolvem (`useRestoreFocus`).
4. Tudo alcançável por teclado na web, com foco visível (o percurso já confere o anel).
5. Texto a 200% na web sem corte nem rolagem lateral a 375 px.
6. **Reduzir movimento:** com `prefers-reduced-motion: reduce` (Playwright `reducedMotion: 'reduce'`), nenhuma animação de deslocamento, escala ou confete; o mascote fica parado; texto e retorno continuam (ADR-0010, seção 8). Vale para toda animação, não só a comemoração.
7. Leitor de tela real (NVDA ou VoiceOver) num percurso curto (entrar, concluir uma tarefa, abrir a lista de compras), feito à mão e registrado no LOG. **Para o humano**, se ninguém da equipe tiver o leitor.

### 10. Performance e animações (F8-6)

**Metas medidas**, registradas no LOG com a máquina e o comando:

1. **Pacote web:** o maior JS de `pnpm build:web`, comprimido com gzip, não passa de 110% do tamanho medido no início de F8-6. Um script compara e falha acima do teto. É a única meta que vira barreira, por ser estável. **Na entrega:** `pnpm bundle:size` (`scripts/check-bundle-size.mjs`) comprime com `zlib` (nível padrão) cada `.js` de `apps/app/dist` e falha se o maior passa de 427 641 bytes (110% de 388 765, o `__common` medido pelo `design-system` em 2026-11-03). Roda no CI, no passo seguinte ao `pnpm build:web`, e não no `pnpm check`: o `check` não constrói, e o build leva uns 20 s. Um crescimento deliberado muda o ponto de partida no script, no mesmo commit, com o motivo no LOG.
2. **Requisições:** abrir Hoje com 50 ocorrências faz no máximo 8 chamadas REST (Playwright conta), sem N+1.
3. **Lista longa:** Hoje, mês do calendário e "no mercado" com 200 itens desenham em menos de 1 s depois que os dados chegam, com CPU 4× mais lenta no Chromium. Meta, não barreira: o CI é ruidoso.
4. **Animações:** só `transform` e `opacity` (Reanimated no nativo, CSS na web), nada que mude layout. Durante o confete, com CPU 4× mais lenta, no máximo 2 quadros acima de 50 ms (amostragem por `requestAnimationFrame` na E2E).
5. **Lighthouse** (grátis, por `npx`) nas boas-vindas, que não pedem sessão, em perfil móvel: Performance 80 ou mais, Acessibilidade 95 ou mais.
6. Retorno do toque no `TaskCheck` antes da resposta do servidor (já é otimista).

### 11. Nativo: EAS, ícones, splash, deep links e push (F8-7)

**Sem conta paga e sem gastar, dá para fazer e conferir:**

- `app.config.ts`: ícone e ícone adaptativo do Android, splash (`expo-splash-screen`), `ios.bundleIdentifier` e `android.package` vindos de variáveis de ambiente, com um padrão provisório; `scheme` já existe (`azkaban`).
- Arte original do Broto para ícone e splash, em 1024 px, a partir do SVG (`design-system`). Nada da Duolingo.
- `eas.json` com os perfis `development`, `preview` e `production`. Versionar o arquivo não custa nada.
- `npx expo config --type public` e `npx expo-doctor` no `pnpm check` ou no CI; `npx expo prebuild --platform android --no-install` numa pasta descartável confere os plugins.
- **Deep link de sessão** do link mágico no nativo (ADR-0004): tratar `azkaban://...#access_token=...` com `setSession`, passando o caminho por `safeInternalPath`. Testável por unidade; no aparelho, só com build.
- **Push nativo:** adapter `push.native.ts` com `expo-notifications` e um `NativePushChannel` no despacho, pela API de push da Expo, atrás de uma flag em `features`, com provedor falso nos testes das funções. `push_subscriptions` ganha o tipo de inscrição numa migration quando o canal entrar.
- `expo-haptics` e o som no nativo (ADR-0010, seção 8), `@react-native-community/netinfo` para a fila (seção 5).

**Fica para o humano**, porque exige conta, aparelho ou dinheiro:

| Item                                                | Exige                                                    | Custo                          |
| --------------------------------------------------- | -------------------------------------------------------- | ------------------------------ |
| Build no EAS                                        | Conta Expo                                               | Grátis, com fila e cota mensal |
| APK de teste para Android, instalado à mão          | Conta Expo                                               | Grátis                         |
| Publicar na Play Store                              | Conta de desenvolvedor Google                            | Taxa única                     |
| Build para iPhone de verdade, TestFlight, App Store | Apple Developer Program                                  | Anuidade                       |
| Build para o simulador do iOS                       | Conta Expo (sem Apple)                                   | Grátis                         |
| Push no Android                                     | Projeto Firebase (FCM) e credencial no EAS               | Grátis                         |
| Push no iPhone                                      | Chave APNs, que exige o Apple Developer Program          | Anuidade                       |
| Universal Links e App Links                         | Domínio (F8-8); Team ID da Apple; SHA-256 da assinatura  | Depende do domínio             |
| Identificador do app (`com.<algo>.azkaban`)         | Escolha do humano; muda depois só com app novo nas lojas | —                              |

Os valores das taxas não foram conferidos nesta data; o humano confere nas páginas da Google, da Apple e da Expo antes de decidir.

### 12. Hospedagem web (F8-8)

Depende do humano. O ADR-0004 adotou a Netlify como padrão, e `apps/app/public` já tem `_headers` e `_redirects` no formato dela. Opções sem custo, sem decidir contratar nada:

| Opção                          | `_headers` e `_redirects` | Observação                                                                |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------- |
| Netlify, plano grátis          | Sim, como estão           | Padrão do ADR-0004. Conferir o limite do plano grátis no dia              |
| Cloudflare Pages, plano grátis | Sim, mesmo formato        | Uso comercial permitido no grátis, pelo que se sabe; conferir             |
| Vercel Hobby                   | Não; usa `vercel.json`    | O plano grátis é só para uso não comercial; um app para empresas não cabe |
| GitHub Pages                   | Não                       | Sem cabeçalhos: `frame-ancestors` e a CSP ficam impossíveis. Descartado   |

**Pergunta ao humano:** Netlify (o padrão) ou outro serviço que você já use? Vai ter domínio próprio? O domínio é o que permite Universal Links e App Links (seção 11) e um remetente de e-mail com SPF e DKIM para o SMTP (seção 4).

Lembrete do projeto Supabase: o plano grátis pausa depois de uma semana sem uso (ADR-0007, seção 18). Para produção com gente de verdade, é uma decisão de custo do humano.

### 13. Backlog que entra se couber

1. **CSP completa como `Content-Security-Policy-Report-Only`** (ADR-0008, SEG4-7). O host do Supabase vem de `EXPO_PUBLIC_SUPABASE_URL`: um script depois de `expo export` grava o `_headers` final em `dist/`, sem curinga, porque a CSP só tem dente com o host exato (`*.supabase.co` deixaria vazar para o projeto de qualquer um). O `_headers` da pilha local não muda: o servidor da E2E não o lê. Vira `Content-Security-Policy`, junto com `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`, depois de uma rodada sem violação no ambiente hospedado, com o app inteiro. Depende de F8-8. Dono: `notificacoes-whatsapp`, com `qa-testes` na conferência.
2. **`PushSetupCard` no onboarding.** O onboarding não tinha passo com sessão. Entra como um passo depois do primeiro login (uma chave no aparelho diz se já foi oferecido), com "Agora não", por composição de rota. Dono: `auth-grupos`.
3. **Limite diário de prova contando nonces emitidos.** Hoje o limite olha só `used_at`, e nonces emitidos juntos chegam a 59 no dia. `issue_proof_challenge` passa a contar os usados nas últimas 24 horas mais os emitidos ainda vivos e não usados. Dono: `banco-de-dados`.
4. **SEG6-7: `gamificationRules.closeJob.batchSize` para 64**, para o job de fechamento não estourar o cache de subtransações. Muda na config e no espelho, depois de a Fase 6 entrar (a config da Fase 6 não existe nesta base). Dono: `arquiteto` na config, `banco-de-dados` no espelho.
5. **Zero no singular ("0 pacote").** Segue o CLDR de pt-BR, que põe 0 em `one`. É pergunta ao humano (seção 17, item 10). Até a resposta, fica como está; mudar é `_zero` nas chaves de contagem, por módulo, com a E2E junto.

### 14. Migrations da fase

**Risco da integração das Fases 6 e 7, antes desta fase:** as duas branches usam os mesmos prefixos de versão (`20261103170000` a `20261103180300`) para arquivos diferentes, por exemplo `20261103170000_gamification_rules.sql` e `20261103170000_shopping_vocabulary.sql`. O CLI do Supabase identifica a migration pelo prefixo, então a base integrada não sobe assim. Nenhuma das duas foi para o projeto hospedado nem para `main` (conferido em 2026-11-03: nenhuma branch contém as duas), então renomear as de uma fase, antes do merge, não fere a regra de não editar migration mergeada. Decisão: **as da Fase 7 ganham novos prefixos depois do último da Fase 6** (`20261103180600`), na ordem atual, sem mudar o conteúdo. A Fase 7 vem depois porque F7-5 (XP de compra) precisa das tabelas da Fase 6 antes dela. Dono: `banco-de-dados`, na integração, com `db reset` e `db:test` provando.

**Faixas desta fase**, para os ramos paralelos do `banco-de-dados` não colidirem de novo, todas depois da base integrada:

| Faixa             | Trilha                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| `20261104100000`+ | F8-4: `rate_limit_rules`, `rate_limit_counters`, `consume_rate_limit`, os usos, limpeza |
| `20261104110000`+ | F8-5: `processed_requests` e `p_request_id` no stepper                                  |
| `20261104120000`+ | F8-3: exportação, exclusão, `account_deletions`, `proof_consents`, convites na cascata  |
| `20261104130000`+ | Backlog: limite de nonces, espelho do `batchSize`                                       |

As três primeiras podem rodar em ramos separados; só a de F8-3 depende de outra, a de F8-4 (`consume_rate_limit` para `data_export`), e entra depois dela.

### 15. Contratos e config

- `packages/contracts/src/privacy.ts` (novo): `accountExportSections`, `accountExportSchema`, `accountDeleteRequestSchema`, `accountDeletePreviewSchema`, `accountDeleteResultSchema`, `privacyErrorCodeSchema`, `privacyErrorSchema`.
- `packages/contracts/src/common.ts`: `rateLimitedErrorCode`.
- `packages/contracts/src/shopping.ts`: `requestId` opcional nos dois ramos de `shoppingQuantityAdjustSchema`.
- `packages/config/src/limits.ts` (novo): `rateLimitRules` (espelho em `app_settings.rate_limit_rules`; `pnpm db:check-permissions` acusa a chave até a migration), `offlineDefaults` (só do cliente) e `privacyDefaults` (só das funções).

### 16. Divisão do trabalho

| Agente                  | Entrega                                                                                                                                                                                                                                                                                                                                                       | Depende de                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `banco-de-dados`        | Renomear as migrations da Fase 7 (seção 14). F8-4: espelho, tabela, função, usos, limpeza. F8-5: `processed_requests` e `p_request_id`. F8-3: `export_user_data`, `begin_`/`finish_account_deletion`, prévia, `account_deletions`, `proof_consents` e `revoke_proof_consent`, aceite no claim, convites na cascata, o pgTAP da exclusão. Backlog 3 e 4. Tipos | Este ADR; a integração das Fases 6 e 7                          |
| `backend-funcoes`       | `account-export` e `account-delete`, com `verify_jwt = true`, testes de função (incluindo exclusão repetida e falha no meio), lista de implantação; conferir `amr`                                                                                                                                                                                            | As funções SQL; até lá, dublês                                  |
| `auth-grupos`           | Tela Privacidade, exportar (adapter `saveTextFile`), excluir com prévia e novo login, revogar o aceite, transparência, o 429 do GoTrue, `PushSetupCard` depois do primeiro login, `rate_limited` nos convites                                                                                                                                                 | Telas desde já; integração das funções e da RPC                 |
| `tarefas-calendario`    | F8-5: persister, chaves de mutação, `setMutationDefaults`, retomada, descarte, aviso de pendências, sair com pendências; status na fila; `rate_limited` em tarefas                                                                                                                                                                                            | Desde já                                                        |
| `compras`               | `requestId` no repositório, item avulso com id do cliente, stepper e marcar pela fila, finalizar desligado sem rede, `rate_limited` ao criar lista                                                                                                                                                                                                            | A parte de F8-5 de `tarefas-calendario`; a migration do stepper |
| `design-system`         | F8-6, contraste dos tokens, reduzir movimento em todo componente animado, aviso de pendências e de descarte como componentes, arte de ícone e splash                                                                                                                                                                                                          | Desde já                                                        |
| `notificacoes-whatsapp` | F8-7 (config nativa, deep link de sessão, push nativo atrás de flag, haptics, NetInfo), CSP Report-Only, "conta excluída" no sino                                                                                                                                                                                                                             | Desde já; a CSP valendo depende de F8-8                         |
| `qa-testes`             | F8-1 (axe, reduzir movimento, teclado, zoom), F8-2 (E2E completo), as metas medidas de F8-6, E2E de exportar, excluir e fila offline (`context.setOffline`)                                                                                                                                                                                                   | Cada entrega                                                    |

`revisor-seguranca` revê ao fim de F8-3 e F8-4: `service_role` só nas funções certas, a exclusão por outra pessoa (JWT de A, conta de B), a prévia sem vazar grupos alheios, a exportação sem dados de outros, e a recusa de `consume_rate_limit` ao cliente.

### 17. A confirmar pelo humano

1. **Controlador e contato:** quem responde pelos dados (pessoa ou empresa) e o e-mail do encarregado, para a política de privacidade.
2. **Base legal para funcionários** (pendência do ADR-0007, seção 20, ainda bloqueante para a prova com funcionários reais). Muda a revogação: se a base não for consentimento, revogar deixa de ser o caminho, e as fotos já enviadas podem ter outro prazo.
3. **Excluir a conta apaga as tarefas do funcionário no grupo**, com o histórico (seção 3). A alternativa é reatribuir antes de apagar, com mudança de schema.
4. **Grupo com outros membros bloqueia a exclusão** até passar a posse; grupo só da pessoa sai junto.
5. **Registro de exclusões por 365 dias**, só com o UUID e contagens.
6. **SMTP próprio para o e-mail de login em produção.** Sem ele, o link mágico só chega à equipe do projeto. Há planos grátis (por exemplo Brevo, Resend, ou o SMTP de uma conta de e-mail existente), uns pedem domínio verificado; os limites e termos não foram conferidos nesta data.
7. **Limites da seção 4:** 200 tarefas e 600 mudanças de status por hora, 30 listas por hora, 30 convites por dia, 30 consultas de convite por hora, 3 exportações por dia.
8. **Fila offline** só com status e compras, descarte em 24 horas, e o horário do servidor valendo.
9. **Fotos na exportação por link de 1 hora**, não embutidas.
10. **"0 pacote" ou "0 pacotes"** no stepper e nas contagens (seção 13, item 5).
11. **Hospedagem e domínio** (seção 12).
12. **Contas de loja e de push** da tabela da seção 11, e o identificador do app.
13. **CAPTCHA** desligado até haver abuso de cadastro.
14. **Leitor de tela real** no percurso curto da seção 9, se ninguém da equipe tiver um.

## Alternativas

- **Exportar pela RLS, no cliente:** perderia a prova de ex-membro, `phone_verifications`, `whatsapp_messages` e o e-mail, que a RLS esconde de propósito.
- **Fotos embutidas em base64 ou num zip:** gigabytes no pior caso, além da memória da função, e um zip pede biblioteca nova.
- **Exclusão só por RPC:** a RPC não fala com o Storage nem com `auth.admin.deleteUser`; ficariam objetos e a conta do Auth.
- **Exclusão assíncrona por job, com carência de 30 dias:** mais um estado na conta e um job, para o caso raro de arrependimento. A prévia e o novo login seguram o engano.
- **Anonimizar o perfil em vez de excluir:** sobra uma conta que não é de ninguém, e as tabelas da Fase 6 continuariam crescendo para ela.
- **Escolher sozinho o novo dono do grupo:** decide pela pessoa quem administra os outros.
- **Rate limit em serviço externo ou na borda:** custa ou pede conta nova; o Postgres já está em cada chamada.
- **Janela deslizante:** uma linha por ação, com contagem a cada chamada, para fechar uma brecha de 2× na virada.
- **Fila offline própria:** reescreveria pausa, retomada e persistência que o TanStack Query já tem.
- **Converter os deltas pendentes num valor final ao reconectar** (ADR-0011, seção 12): perderia o toque de outra pessoa feito no meio, que é a razão de o stepper somar deltas.
- **Horário do aparelho na fila:** adulterável, e o atraso e o XP dependem dele.
- **CSP com `*.supabase.co`:** funciona em todo ambiente, mas deixa o script injetado mandar dados para qualquer projeto Supabase.

## Consequências

- `pnpm db:check-permissions` acusa `rate_limit_rules` até a migration de F8-4.
- `proof_consents` muda de chave primária; quem lê a tabela pela chave antiga muda junto.
- A integração das Fases 6 e 7 renomeia as migrations da Fase 7 antes do merge.
- Nenhuma dependência nova: a fila usa `dehydrate` e `hydrate` do `@tanstack/react-query`. A fila só existe na web até F8-7 trazer o NetInfo.
- Toda RPC com limite pode responder `rate_limited`; cada módulo precisa do texto.
- Duas Edge Functions novas com service role, `account-export` e `account-delete`, entram na lista de implantação.
- Sem SMTP próprio, o login por link mágico em produção não funciona para usuários de fora da equipe.
- A política de privacidade e a prova com funcionários reais continuam esperando o humano.
