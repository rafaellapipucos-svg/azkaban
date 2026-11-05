# ADR-0009: WhatsApp, verificação de telefone, opt-in e resumo diário

**Status:** aceito pelo arquiteto para a Fase 5. Fica sujeito à validação do humano na aprovação da fase. Os itens da seção 16 são padrões a confirmar. **Nenhuma mensagem real sai nesta fase:** o provedor padrão é o `ConsoleProvider`, e ligar a Meta é decisão do humano (seção 10).

## Contexto

A seção 7.8 do prompt mestre pede o resumo diário no WhatsApp, com verificação de telefone, opt-in explícito, "PARAR", webhook de status e o custo explicado. A 7.1 pede o telefone E.164 verificado e as datas do consentimento e do opt-out. O ADR-0004 adotou o padrão da pergunta 2 da seção 15: API oficial da Meta, com mock em desenvolvimento. O ADR-0008, seção 11, já reservou o lugar do WhatsApp na outbox.

Restrições do humano: sem gastar dinheiro e sem contratar fornecedor. Tudo funciona localmente e no CI sem credenciais. O `MetaCloudProvider` é escrito contra a documentação e testado com `fetch` falso; nunca chama a API de verdade nesta fase.

## Decisão

### 1. Provedor

`WhatsAppProvider` é uma interface das Edge Functions, com duas implementações, escolhidas por `WHATSAPP_PROVIDER` (seção 12):

```ts
interface WhatsAppProvider {
  send(message: WhatsAppOutbound): Promise<WhatsAppSendResult>; // contratos em packages/contracts
}
```

- **`ConsoleProvider`** (padrão, sem variável nenhuma): escreve no log uma linha com o tipo e o nome do template, **sem telefone, sem código e sem texto**, grava a mensagem inteira em `whatsapp_console_messages` (seção 8) e responde `accepted` com `providerMessageId = "console.<uuid>"` e `waId = null`. É por essa tabela, só de service role, que a E2E lê o código de verificação e o resumo enviado.
- **`MetaCloudProvider`**: `POST {graphApiBaseUrl}/{graphApiVersion}/{WHATSAPP_PHONE_NUMBER_ID}/messages`, `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}`, `messaging_product: "whatsapp"`, `recipient_type: "individual"`.
  - `template`: `type: "template"`, `language.code`, e um componente `body` com `parameters` nomeados (`type: "text"`, `parameter_name`, `text`).
  - `code`: o template de autenticação leva o código duas vezes, no `body` e no botão (`type: "button"`, `sub_type: "url"`, `index: "0"`), como a documentação pede.
  - `text`: `type: "text"`, só como resposta dentro da janela de 24 horas aberta pela pessoa (a confirmação do PARAR).
  - **Respostas:** 2xx com `messages[0].id` é `accepted`, com `contacts[0].wa_id`. 429, 5xx, falha de rede, tempo esgotado (`sendTimeoutMs`) e os códigos da Meta `130429`, `131056`, `131000` e `133004` são `retry`, com o `Retry-After` quando houver. O resto é `failed`, com `wa_<código da Meta>` ou `wa_http_<status>`. Redirecionamento nunca é seguido (`redirect: "manual"`, um 3xx é `failed` com `wa_redirect`), como no Web Push.
  - Token, corpo e resposta nunca vão a log; só o código.
- Os códigos de erro ficam no formato do contrato (`[a-z0-9_]{1,64}`), que cabe no `last_error` da outbox.

### 2. Canal na outbox

O WhatsApp entra como o ADR-0008, seção 11, previu, sem mudar backoff nem report.

- `notificationRules.activeChannels` passa a `['web_push', 'whatsapp']`. `notificationRules.whatsappTypes = ['daily_summary']` é a lista de tipos que podem ir por WhatsApp, cada um com template aprovado. Uma linha de preferência de outro tipo com `whatsapp` não grava nada. Os avisos da Fase 4 (lembrete, vermelho, revisão) **não** vão por WhatsApp: cada um custaria uma mensagem paga e um template a aprovar. Entram depois, um a um, se o humano pedir (seção 16).
- `enqueue_notification` só cria a linha `whatsapp` com o tipo em `whatsappTypes`, a preferência ligada e o perfil **pronto**: `phone_verified_at` preenchido, `whatsapp_opt_in_at` preenchido e `whatsapp_opt_out_at` nulo ou anterior ao opt-in.
- **`claim_notification_batch`** muda assim:
  - recebe `p_channels text[]`, os canais que a função sabe enviar naquela execução, e só reivindica esses. Sem VAPID, o push espera e o WhatsApp segue. A função só responde 500 se não tiver canal nenhum;
  - confere de novo, para `whatsapp`, o perfil pronto e o tipo na lista: senão, `cancelled` com `whatsapp_not_ready` ou `whatsapp_type_not_allowed`. É o que pega o opt-out que chegou entre a gravação e o envio, e a troca de número;
  - `daily_summary` expira em `scheduled_for + whatsappRules.dailySummary.catchUpMinutes`, não em `maxDelayHours`: um resumo das 8h entregue à noite não serve. Com `daily_summary_skip_empty` e a fonte vazia na hora do envio, `cancelled` com `summary_empty`;
  - o silêncio vale para o WhatsApp como para o push (ADR-0008, seção 5), com a mesma exceção do lembrete. `daily_summary` não passa pelo silêncio: tem horário próprio;
  - cada item ganha `timezone` (do perfil), `overdueAt` e `occurrenceStatus` (da ocorrência, nulos sem ela; seção 9), `phone` (E.164, só em `whatsapp`) e `summary` (`dailySummarySourceSchema`, só em `daily_summary`).
- **`WhatsAppChannel`** implementa `NotificationChannel` em `dispatch.ts`: monta a mensagem a partir do tipo e do item, envia pelo provedor, e devolve `sent` com `{ providerMessageId, waId, template }`, ou `retry`/`failed` com o código. Um provedor que lança é `retry` com `wa_provider_error` (seção 17).
- **`report_notification_results`** aceita, num `sent` de `whatsapp`, o campo `whatsapp: { providerMessageId, waId, template }` e grava a linha de `whatsapp_messages` na mesma transação.
- Entrega pelo menos uma vez, como no push. Se a função morrer entre o envio e o report, o resumo sai duas vezes; não há `tag` que esconda. É raro, e custa uma mensagem.

### 3. Verificação de telefone

Por um código de uso único enviado pelo próprio WhatsApp, num template de autenticação. Sem SMS, sem serviço terceiro. Login por telefone continua fora: é o mesmo código, mas exige o provedor de autenticação do Supabase, e fica para quando o humano pedir (ADR-0004).

**Fluxo:**

1. O app normaliza o número para E.164 (`normalizePhone`, em core) e chama a Edge Function `phone-verification` com `{ phone }` (`phoneVerificationRequestSchema`), com o JWT do usuário. Corpo até 1 KiB.
2. A função chama `start_phone_verification(p_user_id, p_phone)`, só `service_role`, que aplica os limites, invalida o código vivo anterior do usuário, gera um código de `codeLength` dígitos com `gen_random_bytes` e devolve `{ verificationId, code, expiresAt, resendAt }`, ou `{ error: 'phone_rate_limited', retryAfterSeconds }`. Devolver em vez de levantar mantém a resposta simples para a função.
3. A função envia `{ kind: 'code' }` pelo provedor e grava `whatsapp_messages` com `purpose = 'phone_code'`. Responde 200 com `phoneVerificationStartedSchema`, 429 com `phone_rate_limited` e `retryAfterSeconds`, ou 502 com `whatsapp_send_failed`. O envio que falha conta no limite do mesmo jeito.
4. O app chama a RPC `confirm_phone_verification(p_code)` direto, `authenticated`, `security definer`. Ela **devolve** `phoneVerificationConfirmResultSchema`, e não levanta exceção num código errado: a exceção desfaria o `attempts + 1`, e o código poderia ser chutado sem limite.

**`phone_verifications`:** `id`, `user_id` (cascata), `phone_e164` (`check` de E.164), `code_hash`, `attempts`, `expires_at`, `consumed_at`, `created_at`. RLS ligada e nenhum `grant` a `anon` nem `authenticated`.

- `code_hash` = SHA-256 hexadecimal de `id || ':' || código` (`extensions.digest`). O código nunca é gravado. Com seis dígitos, o hash vazado se quebra por força bruta, mas o código vive 10 minutos e só vale com a sessão do dono.
- Limites em `whatsappRules.verification`, com espelho: validade de 10 minutos, 5 tentativas por código, reenvio depois de 60 segundos, 5 envios por usuário e 5 por número em 24 horas corridas. O limite por número impede usar o app para encher de códigos o WhatsApp de outra pessoa. Isso cumpre o rate limiting de OTP do prompt mestre (seção 9); F8-4 fica só com os convites. Há também um teto global diário e uma lista de países (seção 18, SEG5-5).
- Linhas saem depois de `retentionHours` (48), pelo cron diário de retenção.

**Troca e remoção do número.** O número de `profiles` só muda quando o código confere. Confirmar um número diferente do atual grava `phone_e164` e `phone_verified_at`, e zera `whatsapp_opt_in_at` e `whatsapp_opt_in_version`: o consentimento era para o número antigo. `remove_phone()` zera telefone, verificação e opt-in. Nos dois casos, o claim cancela o que estava na fila (seção 2).

O mesmo número pode estar verificado em duas contas (um aparelho da casa, por exemplo). O PARAR vale para todas (seção 7).

### 4. Opt-in e opt-out

**Colunas em `profiles`:** `phone_e164`, `phone_verified_at` (os dois nulos ou os dois preenchidos), `whatsapp_opt_in_at` e `whatsapp_opt_in_version` (idem), `whatsapp_opt_out_at` e `whatsapp_opt_out_source` (`app` ou `webhook`). Sem `grant update` em nenhuma: só as RPCs escrevem. O dono lê a própria linha, como hoje (`whatsappStatusSchema`). `group_member_profiles()` continua sem telefone.

- **Opt-in:** `whatsapp_opt_in(p_consent_version)`, `authenticated`. Levanta `phone_not_verified` sem telefone verificado, e `invalid_consent_version` se a versão não for `whatsappRules.consentVersion`. Grava `whatsapp_opt_in_at = now()` e a versão. Como no ADR-0007, o texto de cada versão está no git (`packages/i18n`, chaves `whatsapp.consent.v1.*`), e subir a versão pede o aceite de novo.
- **O aviso diz:** o nome do app (a política da Meta exige o nome de quem envia), o número, o que chega (o resumo diário com os títulos das tarefas e os nomes das áreas e contextos, e os códigos de verificação), que a mensagem passa pelos servidores da Meta, que não há custo para a pessoa, que o número fica guardado até ser removido no app, e como parar: responder PARAR ou desligar no app. Com a política de privacidade (F8-3), aponta para ela (seção 18, SEG5-7).
- **Opt-out pelo app:** `whatsapp_opt_out()`, `authenticated`, grava `whatsapp_opt_out_at = now()` e `source = 'app'`. Repetir não muda a data.
- **Opt-out pelo webhook:** seção 7. Ele não religa nada: voltar é só pelo app, com o aviso.
- O opt-in e o opt-out mais recentes ficam nas colunas. Um histórico só de acréscimo, como `proof_consents`, entra se o humano pedir.
- **Mensagens pendentes:** não há limpeza ativa. O claim confere o perfil pronto em cada linha e cancela as de quem saiu (seção 2). Uma linha já em `sending` pode sair.

### 5. Resumo diário

**Colunas em `profiles`**, com `grant update` ao dono: `daily_summary_enabled` (padrão `true`), `daily_summary_time` (`time`, padrão `defaultTime`, 08:00), `daily_summary_include_overdue` (`true`), `daily_summary_deadline_days` (`smallint`, 7, `check` de 0 a 30) e `daily_summary_skip_empty` (`true`). Contrato: `dailySummaryPreferencesSchema`. E `daily_summary_last_date` (`date`), do sistema, sem `grant`.

`daily_summary_enabled` nasce ligado, mas o job só olha perfis prontos para o WhatsApp. Na prática, o resumo começa no opt-in e para no opt-out, e a pessoa pode desligá-lo sem desligar o WhatsApp.

**Job:** `enqueue_daily_summaries()`, uma função SQL chamada pelo pg_cron **a cada minuto**, como `enqueue_due_reminders`. Não é Edge Function: só seleciona e grava, e o banco já tem fuso e hora (o mesmo argumento do ADR-0008, seção 10).

- Seleciona até `batchSize` perfis com o resumo ligado e o WhatsApp pronto, em que `agora` no fuso do perfil está em `[data local + daily_summary_time, + catchUpMinutes)` e `daily_summary_last_date` é anterior à data local, com `for update skip locked`.
- Grava `daily_summary_last_date = data local`. Se a fonte não está vazia, ou se `daily_summary_skip_empty` está desligado, chama `enqueue_notification` com o tipo `daily_summary`, `data = { localDate }` e a chave `daily_summary:<data local>`.
- A idempotência é por usuário e data local, nas duas pontas: a coluna impede reprocessar, e a chave impede a linha duplicada. Mudar o horário depois de receber não manda outro no mesmo dia.
- Um cron parado por mais de `catchUpMinutes` (120) perde o resumo daquele dia. Um horário perto da meia-noite com o cron parado também.

**A linha do sino nasce lida** (`read_at = created_at`). O sino a lista como "Resumo do dia", com toque para Hoje (`/`), mas ela não soma no contador nem aparece no aviso ao vivo. A linha existe porque a outbox pende dela.

**O resumo só sai por WhatsApp nesta fase.** `defaultChannels.daily_summary` é `{ web_push: false, whatsapp: true }`, e o job ignora quem não tem WhatsApp. Um resumo por push, de graça, é decisão do humano (seção 16), e hoje nem seria possível (seção 17).

**Fonte** (`dailySummarySourceSchema`), montada pelo banco no claim, na hora do envio, com o mesmo acesso do sino: ocorrências de que a pessoa é **responsável**, de tarefas não arquivadas, em grupos de que ainda é membro (ADR-0005, seção 9):

- `today`: `pending` cuja data no fuso do perfil é hoje, por início;
- `overdue`: `pending` com `overdue_at` passado, e `missed` ainda dentro de `taskRules.lateCompletionWindowHours`, como em "Atrasadas" de Hoje. Nulo com `include_overdue` desligado;
- `deadlines`: `deadline` com vencimento depois de hoje e até `deadline_days` dias, do mais próximo;
- cada lista cortada em `whatsappRules.dailySummary.maxItems`, com as contagens inteiras em `totals`;
- `streak`: nulo até a Fase 6 criar `user_stats`. A Fase 6 passa a preencher `{ current, goalToday }`, sem mudar o template.

A visão de equipe do admin fica fora: o resumo é das tarefas da própria pessoa (seção 16).

**Montagem:** `buildDailySummary(source, { locale, budgets, now }, t)` em `packages/core/src/notifications`, função pura, devolve `dailySummaryRenderSchema` (`date`, `today`, `overdue`, `deadlines`, `footer`), um parâmetro de uma linha por seção, cada um dentro de `whatsappDefaults.summaryBudgets`.

- Hoje agrupado por área e contexto, com hora no fuso da fonte (`dia todo` em `all_day`, `até HH:mm` em prazo do dia). Atrasadas com o dia de origem. Prazos como "Relatório, sexta (em 4 dias)", como pede a seção 7.8.
- O que não cabe vira "+N", e o botão leva ao app: é o "resuma e mande o link" do prompt mestre.
- Títulos e contextos passam por limpeza: caractere de controle vira espaço, e espaços seguidos viram um.
- Lista vazia vira um texto curto ("Nada marcado"), e `footer` é a linha da ofensiva ou, até a Fase 6, um fecho neutro.
- O `t` do despacho é o equivalente curto do ADR-0008, seção 17, item 5: só chave com ponto, `{{nome}}` e plural.

### 6. Templates

Mensagem iniciada pela empresa fora da janela de 24 horas exige template aprovado. Os nomes ficam em `whatsappDefaults.templates`, e o idioma, em `templateLanguages` (`pt-BR` → `pt_BR`). Texto novo é nome novo (`_v2`), porque um template em revisão não pode ser enviado.

**`daily_summary_v1`**, categoria **utilidade**, `parameter_format: named`, `pt_BR`, `message_send_ttl_seconds: 7200`:

```text
Corpo:
Seu resumo de {{date}}.

Hoje: {{today}}

Atrasadas: {{overdue}}

Próximos prazos: {{deadlines}}

{{footer}}

Rodapé: Para parar, responda PARAR.
Botões: URL "Abrir o app" → https://<domínio de produção>/ ; resposta rápida "Parar".
```

- O texto fixo tem menos de 180 caracteres, e a soma dos orçamentos é 840: o corpo fica abaixo dos 1.024 da Meta.
- A quebra de linha fica no template, nunca no parâmetro.
- O TTL de 2 horas acompanha `catchUpMinutes`.
- O botão de URL é fixo e aponta para Hoje.

**`phone_code_v1`**, categoria **autenticação**, `pt_BR`, botão "copiar código", `add_security_recommendation: true`, `code_expiration_minutes: 10` e `message_send_ttl_seconds: 600`, iguais a `codeTtlMinutes`. O texto é o fixo da Meta ("<código> é seu código de verificação"). Só template de autenticação pode levar código de uso único.

**Restrições de parâmetro** (resumo; a lista completa está em <https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components>):

- Corpo de até 1.024 caracteres, cabeçalho e rodapé de até 60, rótulo de botão de até 25, URL de até 2.000 com uma variável no fim.
- Parâmetro nomeado só com minúsculas e `_`. O código de uso único tem até 15 caracteres e vai duas vezes no envio.
- Parâmetro sem quebra de linha, tab ou mais de quatro espaços seguidos. `whatsappTextParamSchema` recusa isso, e também U+2028 e U+2029.
- Template de utilidade sem tom promocional. Se a Meta o julgar de marketing, ele é aprovado como marketing, que custa mais.

### 7. Webhook

`whatsapp-webhook`, Edge Function **sem JWT** (`verify_jwt = false` em `supabase/config.toml`), porque quem chama é a Meta.

- **`GET`:** `hub.mode = subscribe` e `hub.verify_token` igual a `WHATSAPP_VERIFY_TOKEN` em tempo constante (`sameSecret`) dão 200 com `hub.challenge` em `text/plain`, se o desafio for `[A-Za-z0-9_-]{1,128}`. Qualquer outra coisa dá 403, inclusive sem o segredo configurado.
- **`POST`**, nesta ordem:
  1. Sem `WHATSAPP_APP_SECRET`: 500 `whatsapp_not_configured`.
  2. O corpo bruto é lido com `readLimited` até `webhookMaxBytes` (1 MiB; a Meta junta até 1.000 eventos num `POST`). Passou: 413.
  3. `X-Hub-Signature-256` no formato de `whatsappSignatureSchema` e um HMAC-SHA256 dos **bytes brutos** com o segredo do app, conferido por `crypto.subtle.verify`, que compara em tempo constante. O corpo nunca é reserializado antes. Falhou: 401.
  4. JSON e `whatsappWebhookSchema`. Assinado e inválido é 200, com `invalid_payload` no log. Cada status e cada mensagem é validado à parte, e o inválido soma em `ignored` (seção 18, SEG5-3). Um 4xx faria a Meta repetir por sete dias algo que nunca vai passar.
  5. Com `meta`, só valem as mudanças de `field = messages` com `metadata.phone_number_id` igual ao nosso.
  6. **Status:** `sent`, `delivered`, `read` e `failed` vão de uma vez a `record_whatsapp_statuses(p_events jsonb)`, só `service_role`, por `provider_message_id`. O status só avança: `accepted` < `sent` < `delivered` < `read`, e `failed` vale sobre qualquer um. O erro vira `wa_<código>`. Id desconhecido e status de outro nome são ignorados. Isso torna o evento repetido inofensivo. A linha da outbox continua `sent`, porque registra o despacho, e a entrega mora em `whatsapp_messages`.
  7. **Mensagens recebidas:** só `text.body` e `button.text` são lidos. O texto inteiro, normalizado (sem acento, pontuação e espaço nas pontas, em minúsculas), igual a uma das `whatsappDefaults.stopWords` (`parar`, `pare`, `stop`, `sair`, `cancelar`, `descadastrar`) chama `whatsapp_stop_by_wa_id(p_wa_id)`, só `service_role`.
     - A busca é pelos dígitos de `phone_e164`, com a regra do nono dígito, porque o `wa_id` de um número brasileiro pode vir sem ele. Não procura mais em `whatsapp_messages` (seção 18, SEG5-1).
     - Grava o opt-out com `source = 'webhook'` em todo perfil pronto daquele número, e devolve quantos mudaram.
     - Se algum mudou, a função responde com um texto curto de confirmação (`kind: 'text'`, dentro da janela aberta pela pessoa), por tentativa única. Repetir o evento não muda ninguém, então não confirma de novo.
     - Qualquer outra mensagem é ignorada: nada é gravado nem logado.
  8. Erro do banco: 500, para a Meta repetir. As duas RPCs são idempotentes.
  9. Fim: 200 sem corpo.
- **Log:** contagens (status, ignorados, paradas) e códigos. Nunca telefone, `wa_id`, texto, assinatura, corpo ou token.

### 8. `whatsapp_messages` e `whatsapp_console_messages`

**`whatsapp_messages`**: `id`, `user_id` (cascata), `outbox_id` (nulo, `on delete set null`), `purpose` (`notification`, `phone_code` ou `stop_reply`), `template` (nulo no texto), `provider` (`console` ou `meta`), `provider_message_id` (único, até 128), `recipient_wa_id` (nulo, só dígitos), `status` (`whatsappMessageStatusSchema`, nasce `accepted`), `status_at`, `error_code` (até 64), `created_at`.

- Sem conteúdo: nem parâmetros, nem texto, nem telefone. O `wa_id` é dado pessoal e fica pela busca do PARAR.
- RLS ligada e **nenhum `grant` a `anon` nem `authenticated`**: o cliente não vê nada. A tela não precisa do status de entrega. Se precisar, entra uma RPC que devolva só o último status do próprio usuário.
- Índices: `provider_message_id` (único), `recipient_wa_id` parcial e `created_at`, para a retenção.
- Retenção: `whatsappRules.messageRetentionDays` (30), no cron diário.

**`whatsapp_console_messages`**: `id`, `to_e164`, `message` (jsonb, `whatsappOutboundSchema`), `created_at`. Só o `ConsoleProvider` grava, e só a service role lê: é a caixa de saída de desenvolvimento, que a E2E consulta. Em produção, com `meta`, fica vazia. Retenção de `consoleRetentionDays` (1). Guarda o código e o texto de propósito, porque é ali que o teste os encontra; a proteção é o acesso e o prazo.

### 9. O prazo do vermelho no push (handoff 1451)

Decisão: **o claim devolve `overdueAt` e `occurrenceStatus`** da ocorrência, lidos na hora do envio, mais o `timezone` do perfil (seção 2), sem mudar `data`. É a opção que acompanha um reagendamento.

- `PushSource` ganha os três campos, opcionais.
- `buildPushPayload` acrescenta "Ainda dá para concluir até <dia, mês, hora>" ao `occurrence_missed` do job quando `missedLateUntil` não é nulo, com a data no fuso do perfil. A frase cabe no corpo de 300 caracteres e no limite de `pushPayloadMaxBytes`.
- A seção 10 do ADR-0008 fica certa como está: o aviso diz até quando, no sino e no push.
- Donos: `banco-de-dados` (o claim, junto com o resto da seção 2), `notificacoes-whatsapp` (core e i18n) e `backend-funcoes` (o despacho repassa os campos).

### 10. Custos

Conferido em 2026-11-03, em <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing>, com as mudanças que valem desde 1º de outubro de 2026:

- **Cobrança por mensagem entregue**, por categoria e país do destinatário. Mensagem enviada e não entregue não é cobrada. Mensagem da pessoa para a empresa é grátis.
- **Categorias que usamos:** utilidade (o resumo) e autenticação (o código). As duas têm o mesmo preço no Brasil, e a página cita **0,68 centavo de dólar por mensagem** para o Brasil. A tabela completa (CSV e PDF, com o preço em reais desde julho de 2026) não foi baixada.
- **Janela de atendimento** de 24 horas, aberta quando a pessoa escreve: dentro dela, a empresa pode mandar texto livre. Desde 1º de outubro de 2026, a utilidade dentro da janela voltou a ser cobrada.
- **Grátis:**
  - as primeiras 1.000 mensagens de serviço (texto livre dentro da janela) por mês e por número, que é o caso da confirmação do PARAR;
  - mensagens na janela que nasce de um anúncio "clique para o WhatsApp", que não usamos.
- **Faixas de volume** baixam o preço de utilidade e autenticação a partir de um volume mensal que não alcançamos.
- Mensagem de serviço depois da faixa grátis, e qualquer mensagem cobrada, exige um meio de pagamento cadastrado no Billing Hub.

Estimativa, um resumo por dia, 30 dias, ao preço citado:

| Usuários | Resumos por mês | Custo por mês |
| -------- | --------------- | ------------- |
| 1        | 30              | ~US$ 0,20     |
| 10       | 300             | ~US$ 2,04     |
| 50       | 1.500           | ~US$ 10,20    |

Cada verificação de telefone soma uma mensagem de autenticação por código pedido (até 5 por dia por pessoa). Ligar outros avisos no WhatsApp multiplica o total pelo número de avisos.

**Para o humano decidir ligar a Meta, precisa ser verdade:**

- um portfólio empresarial da Meta, um app de desenvolvedor com o produto WhatsApp e uma conta do WhatsApp Business;
- um número dedicado, fora do aplicativo WhatsApp comum, com o nome de exibição aprovado;
- um meio de pagamento no Billing Hub;
- os dois templates da seção 6 aprovados;
- um token de usuário do sistema, o segredo do app, o token de verificação do webhook e a URL do webhook configurada.

A verificação da empresa não é obrigatória para começar: sem ela, o limite é de 250 destinatários únicos em 24 horas fora da janela, e de 250 templates, o que cobre 50 usuários. Ela libera 2.000 e o nome de exibição. Até essa decisão, `WHATSAPP_PROVIDER` fica `console` em todo ambiente, e nada é cobrado.

**Alternativas de provedor, só citadas, sem recomendação de contratar:**

- revendedores da mesma API oficial (Twilio, 360dialog, Zenvia, Gupshup e outros): mesmos templates e preços da Meta, com taxa por cima;
- bibliotecas não oficiais que imitam o WhatsApp Web violam os termos e podem banir o número: estão descartadas;
- o resumo por push ou por e-mail não custa por mensagem (seção 16).

### 11. LGPD

- **Finalidade e mínimo:** o telefone serve para o resumo e para o código. Nenhum outro uso, e ninguém mais o vê. O admin do grupo não vê o telefone de ninguém: nenhuma tela precisa disso, e `group_member_profiles()` continua sem ele. O convite por telefone (ADR-0004) fica fora desta fase. Quando vier, procura o número sem devolvê-lo.
- **Consentimento:** versão e data no perfil. Opt-out a qualquer hora, pelo app ou por PARAR, com data e origem. O aviso diz que a Meta processa as mensagens, inclusive os títulos das tarefas.
- **Retenção:** códigos por 48 horas, status de mensagem por 30 dias, caixa de saída de desenvolvimento por 1 dia. O telefone fica enquanto a pessoa quiser, e `remove_phone()` o apaga.
- **Exportar e excluir** (F8-3): a exportação inclui telefone, verificação, opt-in e opt-out, preferências do resumo, as linhas de `phone_verifications` do usuário (os números digitados, por até 48 horas, sem o hash do código) e as de `whatsapp_messages` (sem conteúdo, como estão). Excluir a conta apaga o resto por cascata de `user_id`. As linhas de `phone_verifications` sobrevivem sem `user_id` até a retenção de 48 horas, para o limite por número continuar valendo (seção 18, SEG5-4). `whatsapp_console_messages` não tem `user_id` e some em um dia.
- **Logs:** seções 1 e 7.
- **Funcionários:** o WhatsApp é opcional e só da própria pessoa; o admin não liga nem vê. A transparência de F8-3 diz isso.

### 12. Regras, padrões e ambiente

| Onde                | O quê                                                                                                                                                             | Espelho                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `whatsappRules`     | Versão do consentimento, limites da verificação, padrões e janela do resumo, lote, cortes da fonte, retenções                                                     | `app_settings`, chave `whatsapp_rules`                  |
| `notificationRules` | `activeChannels` com `whatsapp`, `whatsappTypes`, `defaultChannels.daily_summary`                                                                                 | `app_settings`, chave `notification_rules`              |
| `whatsappDefaults`  | Base e versão da Graph API, tempo de envio, nomes e idiomas dos templates, orçamentos, palavras de parada, limite do webhook                                      | Nenhum: só as funções e o core leem                     |
| `parseWhatsAppEnv`  | `WHATSAPP_PROVIDER` (`console` ou `meta`; vazio é `console`), `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Segredos das Edge Functions; só nomes no `.env.example` |

- Com `meta`, os quatro são obrigatórios.
- Com `console`, o segredo do app e o token de verificação são opcionais. Sem eles, o webhook responde 500 ao `POST` e 403 ao `GET`.
- `graphApiVersion` é `v26.0`, a versão dos exemplos da documentação em 2026-11-03.
- Uma função geral `parseServerEnv` não foi criada: o VAPID já tem `loadVapid`, e o que é do WhatsApp fica junto.
- `pnpm db:check-permissions` passa a comparar `whatsapp_rules`. Até a migration do espelho, acusa `notification_rules` e `whatsapp_rules`.

### 13. Contratos

Em `packages/contracts/src/whatsapp.ts`:

- `phoneE164Schema`, `phoneCodeSchema`;
- `phoneVerificationRequestSchema`, `phoneVerificationStartedSchema`, `phoneVerificationErrorSchema`, `phoneVerificationConfirmSchema`, `phoneVerificationConfirmResultSchema`;
- `whatsappOptInSchema`, `whatsappStatusSchema`, `dailySummaryPreferencesSchema`;
- `dailySummaryNotificationDataSchema`, `dailySummaryTaskSchema`, `dailySummarySourceSchema`, `dailySummaryRenderSchema`;
- `whatsappTextParamSchema`, `whatsappOutboundSchema`, `whatsappSendResultSchema`, `whatsappMessageStatusSchema`;
- `whatsappSignatureSchema`, `whatsappWebhookSchema`, `whatsappWebhookStatusSchema`, `whatsappWebhookMessageSchema`, `whatsappErrorCodeSchema` (com `phone_country_not_allowed`, seção 18).

**Mudança pré-aprovada:** `daily_summary` entra em `notificationTypeSchema` e em `notificationItemSchema`, com `data = dailySummaryNotificationDataSchema`. Quem faz é `notificacoes-whatsapp`, no mesmo commit dos casos em `buildPushPayload`, `notificationUrl` (→ `/`) e no sino, porque o `switch` de core deixa de compilar sem eles.

Os códigos novos de `last_error`, todos dentro dos 64 caracteres:

- do claim: `whatsapp_not_ready`, `whatsapp_type_not_allowed`, `summary_empty`;
- do provedor: `wa_<código>`, `wa_http_<status>`, `wa_rate_limited`, `wa_network`, `wa_timeout`, `wa_redirect`, `wa_bad_response`;
- do canal: `wa_provider_error` (seção 17).

### 14. Divisão do trabalho

| Dono                    | Entrega                                                                                                                                                                                                                                                                                                                                                                                                     | Depende de                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `banco-de-dados`        | Espelhos; colunas de `profiles` e `grant`s; `phone_verifications` e RPCs; opt-in e opt-out; `whatsapp_messages`, `whatsapp_console_messages`, `record_whatsapp_statuses` e `whatsapp_stop_by_wa_id`; `enqueue_notification` com WhatsApp; `enqueue_daily_summaries` e o cron; claim (`p_channels`, rechecagens, expiração, campos novos, fonte) e report; retenção; `check-permission-mirror`; tipos; pgTAP | Este ADR                                                                                         |
| `backend-funcoes`       | `WhatsAppProvider`, `ConsoleProvider`, `MetaCloudProvider` (testes com `fetch` falso); `WhatsAppChannel` e o despacho por canal; `phone-verification`; `whatsapp-webhook`; `verify_jwt = false`; testes                                                                                                                                                                                                     | Este ADR. A integração, das migrations. O canal usa `buildDailySummary`, com um dublê até chegar |
| `notificacoes-whatsapp` | `daily_summary` no contrato e em core; `buildDailySummary`, `normalizePhone` e `isWhatsAppReady` em core, com testes; prazo no push (seção 9); i18n; repositório; telas de telefone, código, opt-in e preferências do resumo                                                                                                                                                                                | Este ADR. As telas, das RPCs e de `phone-verification`                                           |

O que é puro (core, provedores, verificação de assinatura, palavras de parada) corre em paralelo desde já.

### 15. Documentação da Meta: o que foi e o que não foi conferido

Em 2026-11-03, por `curl`, nas páginas novas em `developers.facebook.com/documentation/business-messaging/whatsapp/`. As antigas, em `/docs/whatsapp/`, responderam 400 ou redirecionaram.

**Conferido:**

- preços e regras de cobrança da seção 10;
- limites de componentes, parâmetros nomeados e posicionais, e nome de template (até 512, minúsculas e `_`);
- template de autenticação com botão de copiar (código até 15 caracteres, duas vezes no envio, validade de 1 a 90 minutos);
- TTL: autenticação de 30 segundos a 15 minutos, padrão de 10 minutos; utilidade de 30 segundos a 12 horas, padrão de 30 dias;
- código de idioma `pt_BR`;
- webhook: `GET` com `hub.*`, `X-Hub-Signature-256` sobre o corpo com o segredo do app, até 1.000 eventos por `POST`, novas tentativas por 7 dias, e o formato de status e de mensagem de texto;
- limites de envio: 250 destinatários em 24 horas sem verificação, e 2.000 com ela;
- regras de opt-in da política (nome da empresa, deixar claro o que se recebe, honrar o opt-out);
- categorização de utilidade e risco de virar marketing;
- códigos de erro usados na seção 1.

**Não conferido:**

- a proibição de quebra de linha, tab e mais de quatro espaços seguidos dentro de um parâmetro: a página de erros atual só diz "There's an issue with the parameters in your template" (132018). A regra fica no contrato por precaução, porque recusar a mais não custa nada;
- um limite de tamanho por parâmetro, além do corpo de 1.024;
- a tabela de preços em reais;
- se o número de teste do app de desenvolvedor envia de graça para destinatários cadastrados;
- o formato exato de `button` numa resposta rápida recebida;
- o comportamento do `wa_id` brasileiro sem o nono dígito, que é conhecimento anterior e não está na página.

### 16. A confirmar pelo humano

Padrões reversíveis, escolhidos para não travar a fase:

1. **Provedor:** a Cloud API oficial da Meta, com `console` em todo ambiente até o humano cumprir a seção 10. Ligar custa por mensagem e exige meio de pagamento.
2. **Só o resumo diário vai por WhatsApp.** Lembretes e outros avisos ficam no push e no sino.
3. **Dia vazio não envia** (`daily_summary_skip_empty` nasce ligado). A mensagem curta motivacional custa uma mensagem por dia e pode levar o template à categoria marketing.
4. **Atrasadas entram, e prazos olham 7 dias**, editáveis por pessoa.
5. **Resumo às 8h**, editável. Ele não respeita o silêncio.
6. **O resumo é só das tarefas da própria pessoa.** Uma linha com a equipe para o admin entra se for pedida, e muda o template.
7. **Sem resumo por push ou e-mail.** Seria a alternativa sem custo para quem não quer o WhatsApp.
8. **Ofensiva e meta** entram quando a Fase 6 criar `user_stats`. Até lá, um fecho neutro. Definidas no [ADR-0010](0010-gamificacao-xp-ofensiva-conquistas-ranking.md), seção 9.
9. **Palavras de parada:** parar, pare, stop, sair, cancelar e descadastrar, a mensagem inteira. "Quero parar amanhã" não para.
10. **O mesmo número pode estar em mais de uma conta**, e o PARAR desliga todas.
11. **Sem login por telefone** nesta fase.
12. **Verificação:** 5 códigos por dia por pessoa e por número, 10 minutos de validade, 5 tentativas.
13. **Só números do Brasil** (`allowedCountryCodes: ["55"]`) e **no máximo 200 códigos por dia no total** (`maxSendsPerDay`), seção 18, SEG5-5.
14. **URL em título vai como está** no resumo, clicável no WhatsApp (seção 18, SEG5-6).

**Decisão do humano (2026-11-03): confirmado pelo humano em 2026-11-03.** Os catorze padrões valem como estão. Sobre o item 1 (BL-30): o WhatsApp real pela Meta fica no backlog. O humano tem conta na Meta e número, mas não liga agora; o provedor `console` continua em todo ambiente, e a seção 10 segue valendo para quando ligar.

### 17. Diferenças da implementação

O que a implementação fez diferente deste texto, aceito pelo orquestrador em 2026-11-03. Vale sobre as seções anteriores onde há diferença, e os trechos afetados remetem para cá.

**Provedor que lança vira `retry` com `wa_provider_error`.** Só o `ConsoleProvider` lança, quando o `insert` em `whatsapp_console_messages` falha; o `MetaCloudProvider` responde códigos (seção 1). Nada chegou a ninguém, então repetir não duplica: a linha volta pelo backoff e pelo `maxAttempts` de sempre (ADR-0008, seção 6). Uma falha de **montagem** (tipo fora de `whatsappTypes`, resumo que o contrato recusa) continua `failed` com `send_error`, porque repetir não a conserta. Na `phone-verification`, o provedor que lança é 502 `whatsapp_send_failed`, e o código conta no limite, como o envio que falha (seção 3).

**A tela não mostra o WhatsApp na lista de tipos.** Em `/settings/notifications`, as chaves por canal são só do push. O resumo, único tipo de `whatsappTypes`, é ligado e desligado por `daily_summary_enabled`, na seção do WhatsApp, junto do horário e das outras preferências da seção 5: a mesma escolha não mora em dois lugares. A linha `(daily_summary, whatsapp)` de `notification_preferences` fica no padrão (ligada, por `defaultChannels`) e nenhuma tela a grava. **Teto:** se um segundo tipo entrar em `whatsappTypes`, a chave por canal do WhatsApp volta à lista para ele, e o resumo continua na seção própria.

**O resumo nunca vai por push.** `notificationUrl` leva o resumo a Hoje (`/`), e `internalPathSchema` recusa `/` sozinho, então `buildPushPayload` lança para `daily_summary`. Com `defaultChannels.daily_summary.web_push = false` e o `enqueue_notification` que não grava push para ele, a linha nunca nasce. Um resumo por push (seção 16, item 7) exige uma rota própria para Hoje que passe no contrato, e o texto do push.

### 18. Revisão de segurança da Fase 5

Decisões sobre os achados da primeira passada da revisão de segurança (handoffs `20261103-0158-revisor-seguranca-*`), em 2026-11-03. Valem sobre as seções anteriores onde há diferença, e os trechos afetados remetem para cá.

**SEG5-1 (média): o PARAR só acha o perfil pelo número atual.** `whatsapp_stop_by_wa_id` deixa de procurar o `wa_id` em `whatsapp_messages`. Hoje, uma linha `phone_code` de um número digitado errado, ou o resumo de um número antigo ou reciclado, desligaria quem já usa outro número. A busca passa a ser só pelos dígitos de `phone_e164`, com a regra do nono dígito do Brasil: os dois lados passam por `regexp_replace(…, '^(55[0-9]{2})9([6-9][0-9]{7})$', '\1\2')`, então `+55 DD 9XXXXXXXX` casa com o `wa_id` `55DDXXXXXXXX` só quando o dígito depois do 9 é de 6 a 9, o de celular. Um fixo (2 a 5) nunca perde dígito, e um celular de nove dígitos não casa com o fixo de mesmos oito finais (SEG5-9, migration `20261103160000_whatsapp_stop_ninth_digit_mobile_only.sql`). É determinística, vale antes do primeiro resumo e cobre o PARAR em resposta ao próprio código. A seção 7 fica corrigida assim. Dono: `banco-de-dados`.

**SEG5-2 (baixa): PARAR com caractere invisível para.** A normalização da resposta usa NFKD e tira também `\p{Cf}`. "Não quero parar" continua não parando. Dono: `backend-funcoes`.

**SEG5-3 (baixa): um elemento fora do formato não descarta o lote.** `whatsappWebhookSchema` valida só o envelope, com `statuses` e `messages` como `unknown[]`. A função valida cada elemento com `whatsappWebhookStatusSchema` ou `whatsappWebhookMessageSchema` e soma os inválidos em `ignored`. Um opt-out dentro de um lote com um status estranho não se perde. Feito no contrato; a função é do `backend-funcoes`.

**SEG5-4 (baixa, média com F8-3): o limite por número sobrevive à exclusão da conta.** `phone_verifications.user_id` passa a `on delete set null`, como as provas no SEG-3 da Fase 3. A linha guarda o número e a data até a retenção de 48 horas. A seção 11 fica corrigida assim. Dono: `banco-de-dados`.

**SEG5-5 (baixa, custo): teto global e lista de países.** Padrões reversíveis, a confirmar pelo humano (seção 16, item 13):

- `whatsappRules.verification.allowedCountryCodes = ["55"]`. `start_phone_verification` devolve `{ error: 'phone_country_not_allowed' }` para outro código de país, sem gravar linha nem contar no limite, e a função responde 400 com esse código. Os códigos de país do E.164 não são prefixo uns dos outros, então basta comparar o começo do número. O preço da Meta varia por país, e mandar códigos de autenticação para números de tarifa alta é um abuso conhecido.
- `whatsappRules.verification.maxSendsPerDay = 200`: todos os códigos de todos os usuários em 24 horas corridas, contados em `phone_verifications`. Acima disso, `phone_rate_limited` com `retryAfterSeconds` até a linha mais antiga sair da janela. Contas novas são grátis, então o limite por usuário sozinho não segura a conta. 200 códigos custam uns US$ 1,36 por dia ao preço da seção 10, e cobrem 50 usuários com folga. **Teto:** quem atinge o teto trava a verificação de todos por até um dia. Se acontecer, o caminho é um limite por endereço IP na função.
- Espelho em `app_settings.whatsapp_rules`, pela migration do `banco-de-dados`. Até ela entrar, `pnpm db:check-permissions` acusa `whatsapp_rules`.
- **Riscos aceitos:** o limite por número deixa qualquer conta bloquear por 24 horas a verificação do número de outra pessoa, com 5 pedidos; e `phone_rate_limited` revela que alguém pediu códigos para aquele número há pouco, sem revelar a conta. A alternativa, limitar só por usuário, abriria o assédio por códigos, que é pior.

**SEG5-6 (baixa): os controles bidirecionais saem, e a URL vai como está.**

- `cleanParam` remove `\p{Cf}` (controles bidirecionais, caracteres de largura zero e afins), exceto U+200D, que une os emojis compostos. Dono: `notificacoes-whatsapp`.
- `whatsappTextParamSchema` recusa U+202A a U+202E e U+2066 a U+2069. Feito no contrato: um parâmetro com eles é falha de montagem (`send_error`), nunca uma mensagem disfarçada.
- **URL aceita e registrada.** Um título com URL chega clicável, do número do Azkaban. Quem escreve o título é membro do grupo com permissão de criar tarefa, e o mesmo texto já aparece no app. Desarmar (tirar o esquema, trocar o ponto) estragaria títulos legítimos ("Relatório.pdf", "site.com.br") e não pegaria todas as formas que o WhatsApp transforma em link. Sem o controle bidirecional, o link não se disfarça. **Teto:** denúncias de destinatários baixam a nota de qualidade do número na Meta. Se isso acontecer, ou se um grupo passar a ter membros que não se conhecem, o resumo passa a desarmar URLs. A confirmar pelo humano (seção 16, item 14).

**SEG5-7 (baixa, LGPD): o aviso v1 muda antes de valer.** Ainda é rascunho e nenhuma mensagem real saiu, então muda sem `v2`. O texto de `whatsapp.consent.v1.*` passa a dizer:

- no que chega: os títulos das tarefas **e os nomes das áreas e contextos**;
- numa linha nova: o número fica guardado enquanto você quiser, e pode ser removido a qualquer hora aqui no app;
- quando F8-3 publicar a política de privacidade, um link para ela. Até lá, nada.

As seções 4 e 11 (a exportação de `phone_verifications`) ficam corrigidas assim. Dono do texto: `notificacoes-whatsapp`.

**SEG5-8 (baixa, preventivo): segredo de demonstração recusado com `meta`.** `parseWhatsAppEnv` recusa `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN` que começam com `local-demo-` quando o provedor é `meta`. Feito em `packages/config`, com teste. Com `console` eles continuam aceitos, porque a pilha local e o CI precisam deles. **Risco aceito:** com `console` no projeto hospedado e o valor de demonstração copiado, alguém forja um PARAR; mas com `console` ninguém recebe o código, nenhum perfil fica pronto, e não há o que desligar. O `CRON_SECRET=local-demo-cron-secret` fica como está: quem o tem chama as funções de cron, que só fazem o trabalho que o cron já faria, e a implantação manda gerar um valor aleatório.

## Alternativas

- **Código por SMS:** custa por mensagem e pede outro fornecedor. O código pelo WhatsApp prova também que o número tem WhatsApp, que é o que importa.
- **Verificação pelo próprio usuário mandando uma mensagem ao número** ("envie OK para..."): grátis dentro da janela, mas exige o número real ligado, e não funciona com o `console` nem no CI.
- **Resumo montado e gravado pelo job:** guardaria títulos na outbox e ficaria velho até o envio. A fonte lida no claim segue a regra do ADR-0008: o título vem na hora, pelo acesso do momento.
- **Job do resumo numa Edge Function:** uma ida pela rede para um `select` e um `insert` que o banco faz sozinho.
- **Resumo como `notification` comum, contando no sino:** um aviso diário a mais no contador de quem já o leu no WhatsApp.
- **Parâmetros posicionais no resumo:** funcionam, mas trocar a ordem no template quebraria o envio em silêncio. Os nomeados falham alto.
- **Um template por combinação de seções:** evitaria "Atrasadas: nenhuma", mas multiplicaria aprovações.
- **PARAR por substring:** "não quero parar" pararia.
- **`whatsapp_messages` visível ao dono:** nenhuma tela precisa, e o `wa_id` é dado pessoal.
- **Ler o código da E2E no log da função:** o log teria o código, e a E2E dependeria do Docker. A tabela de console é só de service role e some em um dia.
- **Bibliotecas não oficiais:** violam os termos e arriscam o número.

## Consequências

- `banco-de-dados` entrega antes da integração de `backend-funcoes` e das telas. `pnpm db:check-permissions` acusa `notification_rules` e `whatsapp_rules` até lá.
- O despacho passa a funcionar sem VAPID para o WhatsApp, e o push sem VAPID espera em vez de falhar.
- A tela de preferências não mostra o WhatsApp na lista de tipos; o resumo tem a seção própria (seção 17).
- Nenhuma mensagem real sai até o humano decidir. A E2E do resumo com o provedor de teste (definição de pronto) usa `whatsapp_console_messages`.
- Entrega pelo menos uma vez: um resumo pode, raramente, chegar duas vezes.
- O título das tarefas passa pelos servidores da Meta quando o WhatsApp estiver ligado, e o aviso de consentimento diz isso.
- O handoff 1451 fica resolvido pela seção 9.
