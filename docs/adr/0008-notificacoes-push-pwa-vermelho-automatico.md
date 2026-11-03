# ADR-0008: Notificações, Web Push, PWA e vermelho automático

**Status:** aceito pelo arquiteto para a Fase 4. Fica sujeito à validação do humano na aprovação da fase. Os itens da seção 16 são padrões a confirmar.

## Contexto

A seção 7.7 pede lembretes, sino, Web Push, preferências com horário de silêncio, avisos ao admin e o job de vermelho automático, com outbox, idempotência e backoff. O ADR-0007 deixou para esta fase o aviso de contestação ao autor e o de "em análise" ao admin. O ADR-0005 deixou `auto_miss_at` pronto para o job, e a seção 13 dele, duas pendências da materialização. A casca web tem pendências de PWA desde o QA da Fase 2.

Restrições: sem fornecedor pago nem serviço terceiro de push. Web Push é um protocolo aberto (RFC 8030, 8291 e 8292), e os serviços de push dos navegadores são gratuitos. A Edge Function tem 2 s de CPU por requisição e 150 s de duração no plano gratuito.

## Decisão

### 1. O fluxo

1. Um evento no banco (mudança de status, prova, horário de lembrete) grava uma linha em `notifications`, o sino. Triggers e uma varredura SQL fazem isso, então vale para qualquer caminho: RPC, `commit_proof`, `review_proof`, job ou service role.
2. Na mesma transação, para cada canal externo ativo e ligado nas preferências, nasce uma linha em `notification_outbox`.
3. O Realtime entrega a linha de `notifications` ao app aberto, que mostra o aviso e atualiza o sino.
4. O pg_cron chama `dispatch-notifications` a cada minuto. A função reivindica um lote da outbox, envia pelo canal e informa o resultado.

O sino não é um canal da outbox: ele é a própria linha, sempre gravada. Canais externos são os que tocam fora do app: `web_push` agora, `whatsapp` na Fase 5.

### 2. Tipos e destinatários

| Tipo                  | Para quem                                       | Quando                                                                               | Chave do evento                       |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| `task_reminder`       | Responsável da ocorrência                       | Em cada antecedência de `tasks.reminders`, com a ocorrência `pending`                | Ocorrência, instante-âncora e minutos |
| `occurrence_missed`   | Responsável                                     | A ocorrência vira `missed` por outra pessoa ou pelo job                              | Linha de `task_status_history`        |
| `occurrence_resolved` | `tasks.created_by`                              | Outra pessoa leva a `done`, `partial` ou `missed`, a partir de `pending` ou `missed` | Linha de `task_status_history`        |
| `proof_in_review`     | Quem tem `proof.review` no grupo, menos o autor | `proof_review_status` passa a `in_review`                                            | `task_proofs.id`                      |
| `proof_disputed`      | Autor da prova                                  | `proof_review_status` passa a `disputed`                                             | A decisão, uma por contestação        |

- **Prazo** é o `task_reminder` de uma tarefa `deadline`: a âncora é `scheduled_due`, e `taskDefaults.reminderLeadMinutes.deadline` já dá um dia antes e na hora. Nas demais, a âncora é `scheduled_start`.
- **Ninguém é avisado da própria ação.** O ator é `status_changed_by`; nulo é o job.
- `occurrence_resolved` não sai quando a ocorrência fica `in_review`: o aviso de revisão cobre o caso. Também não sai de uma contestação, que parte de `done`.
- Aprovar não avisa ninguém. Um `proof_approved` entra sem perda se for pedido.
- **Acesso.** Na hora de gravar e de novo na hora de enviar, o destinatário precisa ver a tarefa: ser membro atual, e ter `task.view_group` quando não é o responsável, ou `proof.review` em `proof_in_review`. Quem saiu do grupo não recebe mais nada dele.
- Tarefa arquivada e ocorrência `cancelled` não geram lembrete.

### 3. Modelo de dados

**`notifications`** (o sino): `id`, `user_id` (cascata com `profiles`), `type`, `occurrence_id` (nulo, `on delete set null`), `group_id` (nulo), `data` jsonb, `dedupe_key`, `created_at`, `read_at`. `unique (user_id, dedupe_key)`.

- `data` segue `notificationItemSchema`: referências e fatos do momento, **nunca título, nota ou motivo**. O sino lê o título por embed de `task_occurrences` e `tasks`, que segue a RLS. Sem acesso, o título vem nulo, e a tela mostra uma linha genérica.
- RLS: `select` da própria linha; `update` só da coluna `read_at`, da própria linha. Sem `insert` nem `delete` para o cliente.
- Índice parcial `(user_id, created_at desc) where read_at is null`, para o contador.
- Retenção: linhas com mais de `notificationRules.inboxRetentionDays` (30) saem, com a outbox em cascata, por um cron diário em SQL.

**`notification_preferences`**: `user_id`, `type`, `channel`, `enabled`, `updated_at`, chave primária `(user_id, type, channel)`. Sem linha, vale `notificationRules.defaultChannels`. O cliente escreve as próprias linhas por `insert`/`update`/`delete` com RLS e privilégio por coluna.

**Horário de silêncio** fica em `profiles`, ao lado do fuso: `quiet_hours_start time` e `quiet_hours_end time`, os dois nulos ou os dois preenchidos e diferentes (`check`). O padrão de coluna é `notificationRules.defaultQuietHours`, inclusive no preenchimento das linhas existentes. `grant update` nessas duas colunas. Contrato: `quietHoursSchema`.

**`push_subscriptions`**: `id`, `user_id` (cascata), `endpoint` (único, até 1024), `p256dh`, `auth`, `user_agent` (até 256), `created_at`, `last_success_at`.

- O cliente lê só `id`, `user_agent`, `created_at` e `last_success_at` (`pushDeviceSchema`), por privilégio de coluna. O endpoint é uma capacidade: com ele e as chaves, qualquer um empurra para aquele navegador. Nunca vai a log.
- O cliente apaga a própria linha. Inserir só pela RPC `register_push_subscription(pushSubscriptionInputSchema)`, `security definer`:
  - recusa com `push_endpoint_not_allowed` um host fora de `notificationRules.pushEndpointHosts` (o próprio host ou um subdomínio). A função faria um `POST` para esse endereço, e sem a lista seria uma requisição do nosso servidor para onde o cliente quisesse;
  - faz upsert por `endpoint`. O mesmo navegador com outra conta passa a ser da conta nova, porque é o mesmo aparelho, desde que as chaves sejam as mesmas (seção 17, SEG4-2);
  - acima de `maxPushSubscriptionsPerUser` (10), apaga a mais antiga.
- Ao sair da conta, o app cancela a inscrição no navegador e apaga a linha, para o próximo usuário do mesmo navegador não receber avisos de outro.

**`notification_outbox`**: `id`, `notification_id` (cascata), `user_id`, `channel`, `status`, `scheduled_for`, `next_attempt_at`, `attempts`, `locked_until`, `last_error`, `sent_at`, `created_at`. `unique (notification_id, channel)`.

- `status`: `pending`, `sending`, `sent`, `failed`, `cancelled`, `expired`.
- `last_error` é um código curto (`check` até 64 caracteres), nunca uma mensagem do provedor, que pode trazer o endpoint.
- Sem nenhum `grant` a `anon` nem `authenticated`.
- Índice parcial `(next_attempt_at) where status in ('pending', 'sending')`.

**Idempotência.** A seção 7.7 pede uma chave por ocorrência, tipo e canal. Aqui ela tem duas partes: `notifications.dedupe_key` é `<tipo>:<chave do evento>` (seção 2), única por usuário, e `(notification_id, channel)` é única na outbox. Juntas equivalem à chave pedida, e ainda separam dois eventos legítimos da mesma ocorrência, como concluir, reabrir e concluir de novo, ou dois lembretes de antecedências diferentes. Um `insert ... on conflict do nothing` torna toda gravação repetível. O mesmo aviso não se repete em 10 minutos (seção 17, SEG4-1).

### 4. Gravação

- **Eventos de status e prova:** um trigger `after update of status, proof_review_status` em `task_occurrences` chama a função interna `enqueue_notification(...)`. Ela grava a linha do sino e, se a linha nasceu agora, uma linha de outbox por canal em `notificationRules.activeChannels` com a preferência ligada. Em `web_push`, só se o usuário tiver ao menos uma inscrição.
- **Lembretes:** não são gravados com antecedência. A função SQL `enqueue_due_reminders()`, chamada pelo pg_cron a cada minuto, procura as antecedências cujo instante `âncora − minutos` caiu em `(agora − reminderCatchUpMinutes, agora]` e grava como acima. Assim, editar, reagendar, cancelar ou concluir não precisa apagar lembretes já programados: a varredura lê o estado do momento. Um cron que falhou por até uma hora não perde lembrete, e a chave impede duplicata.
- O teto de `tasks.reminders` é 43.200 minutos, então a varredura olha ocorrências pendentes com âncora até 30 dias à frente. O índice parcial por `status = 'pending'` cobre isso no volume atual. Se um dia pesar, um teto menor de antecedência resolve.

### 5. Horário de silêncio

- Vale para os canais externos, no fuso do perfil. O sino grava na hora, porque não faz barulho.
- A janela pode cruzar a meia-noite: dentro é `início ≤ hora < fim` quando `início < fim`, e `hora ≥ início ou hora < fim` quando não. O fim é calculado como data local + `quiet_hours_end` no fuso do perfil, o que atravessa a virada de horário de verão pelo Postgres.
- É aplicado no despacho, não na gravação, para valer a preferência atual: uma linha devida dentro da janela recebe `next_attempt_at` = fim da janela, sem contar tentativa.
- **Exceção:** um `task_reminder` cuja âncora está dentro da janela toca mesmo assim. Quem marcou academia às 6h com silêncio até 7h quer o aviso das 5h30, e entregá-lo às 7h não serve para nada.
- O WhatsApp da Fase 5 segue a mesma regra. O resumo diário tem horário próprio, escolhido pelo usuário, e não passa pelo silêncio.

### 6. Despacho

`dispatch-notifications` é uma Edge Function só de cron, com `x-cron-secret`, como `proof-retention`. Uma execução repete até `dispatchBudgetMs`:

1. `claim_notification_batch(p_limit, p_lease_seconds, p_max_delay_hours)`, `security definer`, só `service_role`. Com `for update skip locked`, pega linhas `pending` com `next_attempt_at <= now()`, ou `sending` com `locked_until` vencido. Antes de devolver, aplica, nesta ordem:
   - mais de `maxDelayHours` além de `scheduled_for`: `expired`;
   - destinatário sem acesso, ou lembrete de ocorrência que já não está `pending`: `cancelled`;
   - silêncio: adia, como na seção 5;
   - sem inscrição de push: `cancelled`, com `no_subscription`.

   As que sobram vão a `sending`, com `attempts + 1` e `locked_until`. A resposta traz o que a função precisa para montar a mensagem: tipo, `data`, idioma do perfil, título da tarefa, se ela pede foto, e as inscrições.

2. A função monta o payload com `buildPushPayload`, uma função pura em `packages/core/src/notifications`, com os textos de `packages/i18n` no idioma do perfil (seção 8), e envia.
3. `report_notification_results(p_results jsonb)`, só `service_role`, grava `sent` e `sent_at`, ou `pending` com o próximo `next_attempt_at`, ou `failed`, apaga as inscrições mortas e atualiza `last_success_at`.

**Backoff:** a n-ésima nova tentativa espera `baseDelaySeconds × 2^(n−1)`, até `maxDelaySeconds`, ou o `Retry-After` de um 429, se for maior, com o mesmo teto. Depois de `maxAttempts`, `failed`. Os valores ficam em `notificationDefaults`, e a função os passa ao banco: nenhum trigger os lê.

**Entrega é pelo menos uma vez.** Se a função morrer depois de enviar e antes de informar, a linha volta à fila quando a concessão vence, e o aviso sai de novo. O `tag` do payload é o id da notificação, então o navegador substitui a primeira pela segunda, e a pessoa vê uma só.

**Interface de canal**, dentro da função:

```ts
interface NotificationChannel {
  channel: DeliveryChannel;
  send(message: OutboundMessage): Promise<SendResult>;
}
type SendResult =
  | { kind: 'sent' }
  | { kind: 'retry'; code: string; retryAfterSeconds?: number }
  | { kind: 'failed'; code: string }
  | { kind: 'gone'; subscriptionIds: string[] };
```

`sent`, `retry` e `failed` levam também as listas `delivered` e `gone` (seção 17). Uma implementação por canal: `WebPushChannel` agora, `WhatsAppChannel` na Fase 5. Canal novo não muda claim, report, backoff nem silêncio.

Logs: contagens e códigos. Nunca endpoint, título, `user_id` ou payload.

### 7. Canal in-app

- `notifications` entra na publicação `supabase_realtime`. O app assina `postgres_changes` em `notifications` com filtro `user_id=eq.<id>`, e o Realtime confere a política de `select` para cada assinante. A linha não tem nada além do que o próprio usuário vê. O `DELETE` é exceção: vai a todos, só com o `id` (seção 17, SEG4-4).
- `insert` mostra um aviso curto, sem bloquear a tela, e atualiza o contador. `update` de `read_at` sincroniza o contador entre abas.
- O contador lê `count` das linhas sem `read_at`. Marcar como lida é um `update` em `read_at`; "marcar todas" é o mesmo `update` com filtro.
- O sino mora no cabeçalho de Hoje, com o contador, e abre a lista em `/notifications`. Um item leva ao mesmo endereço do push (seção 8).
- Teto: `postgres_changes` faz uma checagem de RLS por assinante e por linha. Com muitos usuários simultâneos, o caminho é Broadcast a partir do banco, com canais privados. Não é o caso agora.

### 8. Web Push e VAPID

- **Chaves.** Um par VAPID P-256 por ambiente, gerado uma vez por um comando local documentado em `docs/implantacao.md`. A chave privada vive só em segredo da Edge Function (`VAPID_PRIVATE_KEY`), junto de `VAPID_PUBLIC_KEY` e `VAPID_SUBJECT`. A pública vai ao cliente por `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, já em `parseClientEnv`, opcional: sem ela, o app funciona e esconde o push. **Nenhuma chave é commitada**, nem a local: `supabase/functions/.env` e `apps/app/.env.local` são ignorados, e os `.env.example` trazem o nome sem valor.
- `VAPID_SUBJECT` é um `mailto:` ou uma URL `https:`. O serviço da Apple recusa outros valores.
- A chave pública do cliente e a do servidor precisam ser iguais. Inscrições feitas com uma chave só aceitam envios assinados por ela. Por isso um 403 **não** apaga a inscrição: marca `failed` com `push_forbidden`, e corrigir o segredo do servidor restaura tudo. A lista de implantação confere as duas.
- **Envio:** `aes128gcm` (RFC 8291), `Authorization: vapid t=<jwt>, k=<pública>` (RFC 8292), com `aud` = origem do endpoint e validade de até 12 horas, `TTL` e `Urgency`. A biblioteca é decisão de `backend-funcoes`, com uma condição: passar no vetor de teste do apêndice A da RFC 8291. Sem dependência paga, e sem serviço terceiro.
- **TTL:** o de um lembrete vai até a âncora, nunca menos que `minPushTtlSeconds` nem mais que `pushTtlSeconds` (seção 17); os outros tipos, `pushTtlSeconds`. `Urgency: high` para lembrete, `normal` para o resto.
- **Respostas:** 201 é `sent`. 404 e 410 apagam a inscrição. 429, 5xx e falha de rede são nova tentativa. 413 e outros 4xx são `failed`, porque é defeito nosso. Com várias inscrições, uma entrega basta para `sent`, e as falhas transitórias das outras não se repetem, para não duplicar onde já chegou.
- **Payload:** `pushPayloadSchema`, até `pushPayloadMaxBytes` (3072) em UTF-8. Leva título e corpo já no idioma do perfil, um caminho interno e o `tag`. O título da tarefa vai cifrado de ponta a ponta: o serviço de push não o lê, mas a tela bloqueada mostra. A pessoa controla isso nas preferências.
- **Endereço do toque:** lembrete de tarefa com foto abre `/tasks/<ocorrência>/proof`; os outros tipos de tarefa abrem `/tasks/<ocorrência>`; `proof_in_review` abre `/proofs/<prova>`.
- **Ações** ("Concluir", "Adiar 10 min") ficam para F8, com o push nativo. O iPhone não as mostra na web, e concluir de dentro do service worker exigiria uma sessão que ele não tem. Na Fase 4, tocar abre o app no endereço certo.

### 9. PWA, service worker e iPhone

- `apps/app/public/sw.js`, JavaScript puro, servido na raiz com escopo `/`. Três eventos:
  - `push`: lê o JSON e chama `showNotification` **sempre**. O iPhone revoga a inscrição de quem recebe push sem mostrar nada, e o Chrome exige `userVisibleOnly`;
  - `notificationclick`: aceita só caminho interno (a mesma regra do contrato, e a mesma origem depois de resolver, seção 17), foca uma janela do app e navega, ou abre uma nova;
  - nenhum `fetch`. Cache offline é de F8-5, com a fila. Um `fetch` vazio só atrasa toda requisição.
- O registro do service worker, a permissão e a inscrição ficam num adapter de `packages/platform` (`push.web.ts`; o nativo lança "não suportado" até F8). A permissão só é pedida a partir de um toque, nunca ao abrir.
- Toda vez que o app abre com permissão concedida, ele chama `register_push_subscription` com a inscrição atual. É idempotente e cobre a inscrição renovada pelo navegador, já que o service worker não tem sessão para avisar o servidor em `pushsubscriptionchange`. Se `applicationServerKey` da inscrição difere da chave atual, o app cancela e se inscreve de novo.
- **iPhone e iPad:** Web Push só a partir do iOS 16.4, e só com o site adicionado à Tela de Início e aberto pelo ícone. No Safari comum não existe `PushManager`. O app detecta isso (`display-mode: standalone` e `'PushManager' in window`) e mostra o passo a passo: Compartilhar, "Adicionar à Tela de Início", abrir pelo ícone e ativar. Em iOS anterior a 16.4, diz que não há como, e que o sino continua funcionando. A explicação fica em `PushSetupCard`, mostrado nas preferências e no onboarding.
- Android, Windows, macOS e Linux recebem também na aba do navegador.

### 10. Vermelho automático

Uma função SQL, `auto_miss_occurrences()`, chamada pelo pg_cron a cada 5 minutos. Não é Edge Function: não há RRULE nem rede, só um `update`, e o banco já tem o instante.

- **Quando:** `status = 'pending'` e `auto_miss_at <= now()`. `auto_miss_at` já é calculado pelo banco no fuso da tarefa, com `taskRules.autoMiss`: fim do dia local em `timed` e `all_day`, a data limite em `deadline`, mais a tolerância. O job não faz conta de fuso. É ele que lê `auto_miss_at`, e não `overdue_at`, pelo ADR-0005, seção 11: uma ocorrência reagendada não fica vermelha pela agenda antiga.
- **Fica de fora:** tarefa arquivada; tarefa de grupo cujo responsável não é mais membro (ADR-0005, seção 9); ocorrência cujo status mudou há menos de `taskRules.autoMissJob.reopenGraceMinutes` (60), para quem reabriu poder reagendar antes do job agir.
- **Como:** `update ... set status = 'missed'`, sem usuário, em lotes de `taskRules.autoMissJob.batchSize`, com `for update skip locked`. Os triggers fazem o resto: a transição `pending → missed` do ator `system`, o histórico com autor nulo, o XP zero, e o aviso `occurrence_missed` ao responsável. Rodar duas vezes não muda nada, porque o filtro é `pending`.
- **Janela de atraso:** não muda. `late` e a janela de 72 horas vêm de `overdue_at`, então `missed → done` continua valendo pela regra do ADR-0005, e o aviso diz até quando.
- **Tarefa com foto:** igual. O ator `system` pode `pending → missed` (ADR-0007, seção 9). Uma prova que chega depois leva de `missed` a `done` dentro da janela, com `late`, e `commit_proof` já trava a ocorrência, então a corrida com o job só decide o caminho, não o resultado. `in_review` é `done`, e o job não o toca.
- O aviso de vermelho cai perto da meia-noite, dentro do silêncio padrão, e sai de manhã. Ele nasce desligado no push e ligado no sino (seção 16).

### 11. WhatsApp na Fase 5

Entra sem mudar o que foi feito aqui:

- `whatsapp` já está em `deliveryChannelSchema`. A Fase 5 o acrescenta a `notificationRules.activeChannels`, com a migration do espelho.
- `WhatsAppChannel` implementa `NotificationChannel` em cima de `WhatsAppProvider` (`ConsoleProvider` e `MetaCloudProvider`), com o template e as variáveis montados a partir do mesmo tipo e de `data`.
- `enqueue_notification` passa a exigir, para esse canal, telefone verificado, `whatsapp_opt_in_at` e nenhum opt-out. O claim confere de novo, porque o opt-out pode chegar entre os dois.
- O resumo diário é um tipo novo, `daily_summary`, com chave `daily_summary:<data local>`, gravado pelo job da Fase 5 e entregue pela mesma outbox.
- `whatsapp_messages` guarda o id do provedor e o status, ligada à linha da outbox; o webhook atualiza ali.

### 12. Materialização: o que volta ao cliente (F4-8)

- `materializeResponseSchema` passa a `{ inserted, failed, deferred }`, todos inteiros ≥ 0, com **status 200** mesmo com `failed > 0`: o que foi inserido fica, e é um resultado parcial, não uma falha da chamada.
  - `failed`: tarefas que o banco recusou, ou cuja regra não expande.
  - `deferred`: tarefas que ficaram para a próxima execução pelo orçamento de CPU.
- O cliente mostra o erro com "tentar de novo" quando `failed > 0`. Com `deferred > 0`, chama de novo com os mesmos argumentos, até `taskDefaults.materializeMaxFollowUps` (2) vezes, e o cron faz o resto. As tarefas já feitas custam só a leitura, porque o cursor delas está no limite.
- `failed` e `deferred` têm padrão 0 no contrato só para ler uma função anterior a F4-8. A função sempre envia os dois, e deve ir ao ar antes do cliente novo.
- `taskDefaults.materializationPastDays` (30) substitui a constante local `PAST_DAYS`. Fica em `taskDefaults`, sem espelho, porque nenhum trigger a lê.
- **Corpo sem limite.** `materialize-occurrences/index.ts:290` lê o corpo com `req.text()`, sem limite, e qualquer usuário autenticado alcança isso. Corrige como o SEG-6 de `proof-url`: `readLimited`, que passa para `_shared`, com teto de 8 KiB (100 ids e um instante cabem em cerca de 4 KiB) e o mesmo tempo de leitura.
- **Vault vazio.** `call_materialize_occurrences` retorna em silêncio sem os segredos. Passa a levantar `materialize_not_configured`, como `call_proof_retention`, e a execução aparece como `failed` em `cron.job_run_details`. O mesmo vale para `call_dispatch_notifications`.

Isso fecha a seção 13 do ADR-0005.

### 13. Casca web (F4-9)

- **Dono.** Esta fase decide a pergunta do QA sobre `apps/app`: cada rota em `apps/app/app` é do dono do módulo que ela monta; `apps/app/src` e `app.config.ts` são da casca, que o orquestrador delega. Na Fase 4, `notificacoes-whatsapp` fica com `apps/app/public/` e com a parte `web` de `app.config.ts`.
- **Documento.** `web.output` continua `single`. O `index.html` passa a ser próprio, em `apps/app/public/index.html`, que o Expo usa como modelo nesse modo (`+html.tsx` não vale, como já se viu). Ele traz:
  - `<meta name="theme-color">` duas vezes, com `media="(prefers-color-scheme: light)"` e `dark`, nos valores de `background` e `background-dark` dos tokens. O tema segue o sistema (`useSystemColorScheme`), então o `media` basta, sem JavaScript. Se um dia houver tema escolhido pelo usuário, o adapter atualiza a tag;
  - `<meta name="color-scheme" content="light dark">` e um `<style>` com o fundo do `html` e do `body` nas mesmas duas cores, para não piscar branco no escuro;
  - `<link rel="manifest">`, `apple-touch-icon` de 180 px e `lang` vindo de `web.lang`.
- **Manifest** em `apps/app/public/manifest.webmanifest`: `name` e `short_name` iguais ao nome do app, `lang: pt-BR`, `start_url` e `scope` `/`, `display: standalone`, `orientation: portrait`, `background_color` e `theme_color` = `background` claro, e ícones de 192 e 512 px, mais um de 512 `maskable`, gerados a partir de `assets/icon.png`. `standalone` é o que libera o push no iPhone.
- As cores e o nome nesses dois arquivos estáticos repetem os tokens e o nome provisório. Um teste de unidade compara as cores com `packages/ui/src/tokens.ts`. O nome é provisório; quando for definido, ou se passar a variar por ambiente, os dois arquivos passam a ser gerados no build.
- **Netlify:** `apps/app/public/_headers` com `Cache-Control: no-cache` para `/sw.js` e `/manifest.webmanifest`, e `_redirects` com `/* /index.html 200`, para um endereço de notificação abrir direto na rota. Os cabeçalhos de segurança estão na seção 17 (SEG4-7).
- **Título por tela:** `Screen`, em `packages/ui`, ganha a propriedade `title`, e um adapter de `packages/platform` (`useDocumentTitle`, que só age na web) define `document.title` como `"<tela> · <nome do app>"`, com o formato em `common.json`. Sem `title`, o documento fica com o nome do app. Cada feature passa o título das próprias telas.
- **Marcos de página:** o conteúdo de `Screen` recebe `role="main"`, e a barra de abas, `role="navigation"` com nome acessível. O React Native Web transforma `role` no atributo, que é o que o leitor de tela usa. Um `main` por tela.
- Os rótulos das abas cortados a 320 px seguem com `design-system`.

### 14. Regras e espelhos

| Onde                    | O quê                                                                                                                                           | Espelho                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `notificationRules`     | Canais ativos, padrões por tipo e canal, silêncio padrão, varredura de lembretes, inscrições e retenção delas, hosts, sino, janela de repetição | `app_settings`, chave `notification_rules` |
| `notificationDefaults`  | Lote, orçamento, concessão, backoff, atraso máximo e TTL do despacho                                                                            | Nenhum: a função passa os valores ao banco |
| `taskRules.autoMissJob` | Lote e carência do vermelho automático                                                                                                          | `app_settings`, chave `task_rules`         |
| `taskDefaults`          | `materializationPastDays` e `materializeMaxFollowUps`                                                                                           | Nenhum                                     |
| `parseClientEnv`        | `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, opcional                                                                                                        | —                                          |

`pnpm db:check-permissions` passa a comparar também `notification_rules`. Até a migration de F4-1 entrar, ele acusa `task_rules` diferente.

### 15. Segurança e LGPD

- RLS em todas as tabelas novas. A outbox não tem acesso de cliente, e as funções de despacho só aceitam `service_role`.
- O host do endpoint é conferido na RPC e de novo na função, antes do `POST`.
- O sino guarda referências, não conteúdo. O título é lido pela RLS, então quem saiu do grupo não o vê mais.
- O push leva o título cifrado, e a pessoa escolhe por tipo se quer push.
- Linhas do sino e da outbox somem em 30 dias. A inscrição some ao sair da conta, com 404 ou 410, com a conta e depois de 90 dias sem entrega (seção 17).
- Exportar e excluir a conta, em F8-3, precisam cobrir `notifications`, `notification_preferences` e `push_subscriptions`. A cascata por `user_id` já apaga.

### 16. A confirmar pelo humano

Padrões reversíveis, escolhidos para não travar a fase:

1. **Silêncio padrão de 22h a 7h**, ligado para todos. Desligado, a pessoa receberia o aviso de vermelho à meia-noite.
2. **Push por tipo:** lembrete, "em análise" e contestação ligados; vermelho automático e avisos ao criador só no sino. Um admin com dez pessoas e cinco tarefas por dia receberia cinquenta pushes.
3. **O aviso ao criador vale só para mudança feita por uma pessoa.** O vermelho do job vai ao responsável, não ao admin. O resumo diário da Fase 5 dá a visão do dia.
4. **Lembrete de tarefa marcada dentro do silêncio toca.**
5. **Sem ações na notificação** na Fase 4.
6. **Sem antecedência padrão por usuário:** o padrão continua o de `taskDefaults` por tipo de agendamento, e cada tarefa tem a própria lista. Entra como coluna em `profiles` se for pedido.
7. **O sino guarda 30 dias.**
8. **O push mostra o título da tarefa na tela bloqueada** (seção 17, risco de produto). Uma opção "esconder o conteúdo na tela bloqueada" fica para depois.
9. **O mesmo aviso não se repete em 10 minutos** (seção 17, SEG4-1).
10. **Inscrição de push sem entrega há 90 dias sai** (seção 17, SEG4-5).

### 17. Revisão de segurança da Fase 4

Decisões sobre os achados da revisão de segurança e sobre o que o despacho fez diferente deste texto, em 2026-11-02. Valem sobre as seções anteriores onde há diferença, e os trechos afetados remetem para cá.

**SEG4-1: o mesmo aviso não se repete dentro de `notificationRules.renotifyCooldown.minutes` (10).**

- Em `enqueue_notification`, para os tipos de `renotifyCooldown.types` (`occurrence_missed`, `occurrence_resolved`, `proof_disputed`): se o mesmo usuário já tem uma linha do mesmo tipo, da mesma ocorrência e com o mesmo `data`, criada há menos de 10 minutos, nada é gravado. Sem linha no sino, sem outbox, sem evento de Realtime e, portanto, sem aviso na tela.
- "O mesmo `data`" é o mesmo fato: mesmo status e mesma pessoa em `occurrence_resolved`, mesma pessoa em `occurrence_missed`, mesma prova e mesmo destino em `proof_disputed`. O laço `pending → done → pending → done` do mesmo membro gera um aviso a cada 10 minutos, no máximo. Um fato diferente (outro status, outra pessoa) é avisado na hora, então a reabertura honesta que termina em `partial`, ou a conclusão por outra pessoa, não se perde.
- A reabertura honesta que volta a `done` em menos de 10 minutos não avisa de novo. O criador já leu "concluiu", e o estado é o mesmo.
- `task_reminder` e `proof_in_review` ficam de fora: a chave deles já é a antecedência e a prova, e duas antecedências próximas (5 e 0 minutos) são legítimas. Uma prova nova por volta é limitada pelo teto diário de `proofRules`.
- A chave do evento continua a linha do histórico, e `on conflict do nothing` continua valendo para a repetição exata. A janela é uma checagem a mais, não uma chave nova: com balde de tempo na chave, dois eventos nos dois lados da virada do balde passariam, e o teste precisaria mexer no relógio. Aqui o teste recua o `created_at` da primeira linha.
- Corrida: as transições da mesma ocorrência já passam pelo bloqueio da linha em `task_occurrences`, então duas transações não leem a janela ao mesmo tempo.
- **Teto:** um membro que alterna devagar, a cada 11 minutos, gera seis avisos por hora no sino do criador, que só vão a push se ele ligou `occurrence_resolved`. É o custo de manter a reabertura. Um limite por usuário em `set_occurrence_status` entra se for preciso.
- Espelho em `app_settings.notification_rules`, pela migration de `banco-de-dados`. Até ela entrar, `pnpm db:check-permissions` acusa a diferença.

**SEG4-2: trocar o dono de uma inscrição exige as mesmas chaves.** No `on conflict (endpoint)`, a linha só muda de `user_id` se `p256dh` e `auth` forem iguais aos guardados; o mesmo dono atualiza as chaves como hoje. Senão, `register_push_subscription` levanta `forbidden`, que o cliente trata como falha genérica, sem código novo no contrato. O mesmo navegador com outra conta chega com as mesmas chaves, e `syncThisDevice` já cancela a inscrição de outra conta antes de criar a sua. **Risco aceito:** quem tem endpoint e as duas chaves tem a inscrição inteira, o que equivale a ter o navegador.

**SEG4-3: `proof_in_review` passa por `can_view_task_for` e `archived_at is null`**, além de `proof.review`, em `can_receive_notification`. Alinha com `can_review_proof` e fecha o dia em que um papel tiver só `proof.review`.

**SEG4-4: risco aceito.** O Realtime entrega a todo assinante o `DELETE` de `notifications`, com só a chave primária, e o cliente o ignora. Não há conteúdo. A seção 7 fica corrigida assim: o Realtime só entrega `insert` e `update` das linhas do próprio usuário, e o `DELETE` vai a todos com o `id`. O caminho, se o volume da limpeza diária pesar, é o Broadcast em canal privado já previsto.

**SEG4-5: `push_subscriptions` ganha retenção.** O cron diário de `delete_expired_notifications` apaga também as inscrições com `coalesce(last_success_at, created_at)` mais velho que `notificationRules.pushSubscriptionRetentionDays` (90), com espelho. **Teto:** quem abre o app todo dia mas não recebeu push nenhum em 90 dias tem a linha apagada e recriada na próxima abertura, porque `register_push_subscription` faz upsert. Entre as duas, um push daquela conta não sai. Uma coluna `last_registered_at` resolve, se for pedido.

**SEG4-6 e SEG4-9: caminho interno sem caractere de controle.**

- O contrato passa a exportar `internalPathSchema`: até 200 caracteres, começa com `/`, o segundo caractere não é `/`, e nenhum é `\` ou de controle (`\p{Cc}`, que inclui tab, LF, CR, U+0000 a U+001F e U+007F a U+009F). O parser de URL remove tab, LF e CR em qualquer posição, então `"/\t/evil.com"` resolvia para `https://evil.com/`. `pushPayloadSchema.url` usa o novo schema, com teste que recusa `"/\t/evil.com"`, `"/\n/evil.com"`, `"/\r/evil.com"`, `//evil.com` e `/\evil.com` e confere com `new URL` que cada recusado sai da origem e cada aceito fica nela.
- `safeInternalPath` em `packages/core/src/navigation`, do login e anterior à Fase 4, passa a ser `internalPathSchema.safeParse(path).success ? path : undefined`. Dono: `auth-grupos`, que a criou e a usa nas telas de entrar e criar conta. A regra fica num lugar só para o TypeScript, e o `?next=` ganha o teto de 200.
- `sw.js` não importa o contrato. Ele resolve o caminho contra a própria origem e só aceita a mesma origem: `const u = new URL(path, self.location.origin); return u.origin === self.location.origin ? u.pathname + u.search + u.hash : '/'`, com o teto de 200 e a regex do contrato antes, como cinto. Dono: `notificacoes-whatsapp`.

**SEG4-7: cabeçalhos de segurança em `_headers`, em dois passos.**

- **Agora**, para `/*`, sem nada que toque script, estilo ou conexão:

  ```text
  /*
    Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
  ```

  `frame-ancestors 'none'` fecha o app num iframe, que exporia as ações de um toque (concluir, revisar) a clique sequestrado. `object-src` e `base-uri` não afetam o Expo web, que não usa `<object>` nem `<base>`. `apps/app/public.test.ts` confere que as três linhas existem.

- **Depois**, a CSP completa, primeiro como `Content-Security-Policy-Report-Only`, conferida no console do navegador com o app inteiro (login, Realtime, câmera e foto, sino, push):

  ```text
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://<projeto>.supabase.co; connect-src 'self' https://<projeto>.supabase.co wss://<projeto>.supabase.co; font-src 'self' data:; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
  ```

  `style-src 'unsafe-inline'` é o preço do react-native-web, que escreve estilos em tempo de execução, e do `<style>` do `index.html`. O host do Supabase muda por ambiente, então o `_headers` passa a ser gerado no build a partir de `EXPO_PUBLIC_SUPABASE_URL`, ou usa `https://*.supabase.co` e `wss://*.supabase.co`, que é mais largo. Só vira `Content-Security-Policy` depois de uma rodada sem violação. Dono: `notificacoes-whatsapp`, com `qa-testes` na conferência.

- `Permissions-Policy` fica para o mesmo passo: a câmera e a localização da prova precisam de `self`, e um valor errado quebraria a prova sem teste no navegador.
- HSTS fica com a Netlify, que o envia nos domínios dela. Num domínio próprio, a lista de implantação confere.

**SEG4-8: sessão que acaba sem o botão Sair desliga o push.** Quando a sessão some por qualquer motivo (expirada, revogada, cookies limpos), o módulo de notificações chama `unsubscribePush()` e limpa a chave local `{ userId, deviceId }`, se ela existir. O gatilho é o `onSessionChange` que `packages/data/src/auth` já expõe, com sessão nula. Sem sessão a linha não é apagada, mas o endpoint morre, o serviço responde 404 ou 410, e o despacho a apaga. Dono: `notificacoes-whatsapp`; se precisar do tipo do evento, e não só da sessão, pede a `auth-grupos`.

**Risco de produto: o título da tarefa na tela bloqueada.** Mantido como padrão: o valor de um lembrete é dizer o quê ("Academia em 30 minutos"), e o título vai cifrado até o aparelho. Quem não quer, desliga o push por tipo. A opção "esconder o conteúdo na tela bloqueada" (título genérico, o detalhe só ao abrir) custa uma preferência por usuário e um ramo em `buildPushPayload`, e fica **a confirmar pelo humano** (seção 16, item 8). Não entra na Fase 4.

**Diferenças do despacho (handoff de `backend-funcoes`), todas aceitas:**

1. **`SendResult`**: os quatro tipos da seção 6 ficam, e `sent`, `retry` e `failed` levam também `delivered` e `gone`, as listas de inscrições que entregaram e que morreram. Com várias inscrições, o report precisa das duas. `gone` sozinho é "todas morreram" e vira `failed` com `push_gone`.
2. **TTL do lembrete** vai até a âncora, com mínimo `minPushTtlSeconds` e teto `pushTtlSeconds`. Alguns serviços recusam TTL longo, e a outbox desiste em `maxDelayHours` de qualquer forma.
3. **Redirecionamento nunca é seguido**: um 3xx é `failed` com `push_redirect`. Seguir levaria o `POST` a um host que a lista não conferiu.
4. **Host conferido na função** exige também `https:`, porta padrão e URL sem usuário e senha.
5. **`t` sem i18next**, um equivalente curto com chave por ponto, `{{nome}}` e plural por `Intl.PluralRules`. Vale enquanto as chaves `push.*` usarem só isso; uma chave com formatação ou contexto do i18next pede a biblioteca.

Os códigos de `last_error` (`push_gone`, `push_forbidden`, `push_too_large`, `push_redirect`, `push_http_<status>`, `push_rate_limited`, `push_server_error`, `push_network`, `push_endpoint_not_allowed`, `push_bad_keys`, `no_subscription`, `no_channel`, `send_error`, `invalid_item`) ficam registrados aqui. Todos cabem nos 64 caracteres do `check`.

**Donos:**

| Achado                         | Dono                    | Handoff                                                               |
| ------------------------------ | ----------------------- | --------------------------------------------------------------------- |
| SEG4-1, SEG4-2, SEG4-3, SEG4-5 | `banco-de-dados`        | `20261102-1430-arquiteto-para-banco-de-dados-seguranca-fase-4`        |
| SEG4-6, SEG4-7, SEG4-8         | `notificacoes-whatsapp` | `20261102-1430-arquiteto-para-notificacoes-whatsapp-seguranca-fase-4` |
| SEG4-9 (`safeInternalPath`)    | `auth-grupos`           | `20261102-1430-arquiteto-para-auth-grupos-caminho-interno`            |
| SEG4-9 (contrato)              | `arquiteto`             | Feito nesta revisão                                                   |
| SEG4-4                         | Ninguém                 | Risco aceito                                                          |

## Alternativas

- **Serviço terceiro de push (OneSignal, Firebase Cloud Messaging direto):** contraria a restrição, e põe um terceiro com o conteúdo e a lista de aparelhos.
- **Gravar os lembretes na outbox ao materializar:** cada edição, reagendamento, cancelamento ou conclusão teria de apagar ou mover linhas futuras, e a janela de 60 dias multiplicaria as linhas.
- **O sino como linha da outbox de um canal `in_app`:** um despacho a mais para algo que o Realtime já entrega quando a linha nasce.
- **Silêncio na gravação:** congelaria a preferência do momento do evento.
- **Título guardado no sino:** vazaria para quem saiu do grupo e ficaria velho depois de uma edição.
- **Preferências em jsonb no perfil:** o trigger leria um documento sem estrutura no banco, e o padrão por tipo teria de ser mesclado em cada leitura.
- **Vermelho automático numa Edge Function:** uma ida pela rede para um `update` que o banco faz sozinho.
- **Vermelho sem carência:** o job, a cada 5 minutos, desfaria o "reabrir para reagendar" do ADR-0005.
- **`deferred` como 202 ou erro:** a chamada fez o que pôde, e o cliente precisaria tratar dois formatos.
- **`failed` e `deferred` obrigatórios no contrato:** o cliente novo quebraria com a função antiga, e a ordem de implantação viraria uma condição de corrida.
- **`output: 'static'` para usar `+html.tsx`:** muda a forma de servir todas as rotas por um arquivo de cabeçalho.
- **Gerar manifest e `index.html` no build agora:** um script a mais para um nome que ainda é provisório.
- **Broadcast em vez de `postgres_changes`:** escala melhor, mas exige canal privado e trigger de envio. Fica como caminho.

## Consequências

- `banco-de-dados` entrega as tabelas, as RPCs, os triggers, as duas varreduras e o espelho antes de qualquer outro. `pnpm db:check-permissions` falha até lá.
- F4-6 sai de `backend-funcoes` e vai para `banco-de-dados`, porque é só SQL.
- A publicação de Realtime deixa de ser vazia: `notifications` é a primeira tabela. Toda tabela nova nela precisa de RLS de `select` revista.
- O app passa a ter um service worker. Um erro nele afeta o push de todo mundo até a próxima versão, então ele fica mínimo e com `no-cache`.
- O título da tarefa aparece na tela bloqueada de quem ativou o push.
- A entrega é pelo menos uma vez, com repetição escondida pelo `tag`.
- As cores do `index.html` e do manifest repetem os tokens, com um teste para não divergir.
- O ADR-0005, seção 13, fica resolvido pela seção 12.
