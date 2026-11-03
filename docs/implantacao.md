# Implantação

O que a primeira implantação exige, na ordem. Nada disso foi executado no projeto hospedado: esta lista junta o que estava só em ADRs, handoffs e no LOG. Ao concluir um item, registre no LOG o que foi conferido e o resultado.

`<ref>` é o identificador do projeto. Segredos nunca entram no repositório.

## 1. Banco

```bash
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push
```

## 2. Segredos

Gere um valor aleatório para o segredo do cron. O mesmo valor vai nos dois lugares abaixo.

```bash
pnpm exec supabase secrets set CRON_SECRET=<valor>
```

**Par VAPID do Web Push** (ADR-0008, seção 8). Um par por ambiente, gerado uma vez, na sua máquina. O comando grava o par num arquivo fora do repositório, sem mostrá-lo no terminal:

```bash
node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(async k=>{const d=(await crypto.subtle.exportKey('jwk',k.privateKey)).d;const p=Buffer.from(await crypto.subtle.exportKey('raw',k.publicKey)).toString('base64url');const n=require('os').EOL;require('fs').writeFileSync(require('os').homedir()+'/vapid-<ambiente>.env','VAPID_PRIVATE_KEY='+d+n+'VAPID_PUBLIC_KEY='+p+n,{mode:0o600})})"
pnpm exec supabase secrets set --env-file ~/vapid-<ambiente>.env
pnpm exec supabase secrets set VAPID_SUBJECT=mailto:<email de contato>
```

- `VAPID_SUBJECT` é `mailto:` ou uma URL `https:`. O serviço da Apple recusa outro valor. Com qualquer outro, o par conta como ausente (abaixo).
- `VAPID_PUBLIC_KEY` vai também ao app, como `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, na variável do GitHub que o deploy lê (seção 8). As duas têm de ser **iguais**: a seção 5 confere.
- A chave privada fica só no segredo da função e no arquivo da sua máquina. Nunca a commite, nem a local. Guarde o arquivo num cofre de senhas e apague-o do disco.
- Trocar o par invalida todas as inscrições: cada navegador precisa se inscrever de novo, o que o app faz ao abrir, porque a chave do cliente muda junto.
- Sem os três segredos válidos, `dispatch-notifications` não reivindica push: as linhas `web_push` ficam `pending`, sem tentativa gasta, e o WhatsApp segue. A resposta é 200. O 500 `channels_not_configured` só aparece sem canal nenhum: VAPID ausente **e** segredos do WhatsApp que não passam em `parseWhatsAppEnv` (por exemplo, `WHATSAPP_PROVIDER=meta` sem os quatro).

**WhatsApp** (ADR-0009, seção 12). Os nomes são estes, e só os nomes estão no `.env.example`:

| Segredo                    | Quando                 | Valor                                                      |
| -------------------------- | ---------------------- | ---------------------------------------------------------- |
| `WHATSAPP_PROVIDER`        | sempre                 | vazio ou `console` até a decisão do humano; `meta` depois  |
| `WHATSAPP_APP_SECRET`      | sempre, para o webhook | aleatório, 16 caracteres ou mais; com `meta`, o da Meta    |
| `WHATSAPP_VERIFY_TOKEN`    | sempre, para o webhook | aleatório, 16 caracteres ou mais; o mesmo do App Dashboard |
| `WHATSAPP_ACCESS_TOKEN`    | só com `meta`          | token de usuário do sistema, 32 caracteres ou mais         |
| `WHATSAPP_PHONE_NUMBER_ID` | só com `meta`          | o identificador do número, só dígitos                      |

```bash
pnpm exec supabase secrets set WHATSAPP_APP_SECRET=<aleatório> WHATSAPP_VERIFY_TOKEN=<aleatório> --project-ref <ref>
```

- Os valores `local-demo-*` do `.env.example` são só da pilha local. Nunca vão para o projeto hospedado, e o token de acesso e o phone number id nunca têm valor de exemplo.
- Com `console` (vazio também é `console`), nada sai para a Meta: o código de verificação e o resumo vão para `whatsapp_console_messages`, que some em um dia. Em produção, ninguém recebe o código, e ninguém chega a ligar o WhatsApp. É o esperado até a seção 10 do ADR-0009 ser cumprida.
- Sem `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`, o webhook responde 500 ao `POST` e 403 ao `GET`.

**Push nativo** (ADR-0012, seção 11). Vai na mesma linha `web_push` da outbox, então só sai com o VAPID acima configurado: sem ele, a linha nem é reivindicada. Os nomes estão no `supabase/functions/.env.example`, com `fake` para a pilha local:

| Segredo                | Quando        | Valor                                                |
| ---------------------- | ------------- | ---------------------------------------------------- |
| `NATIVE_PUSH_PROVIDER` | sempre        | `expo` em produção (BL-29); `fake` só na pilha local |
| `EXPO_ACCESS_TOKEN`    | só com `expo` | token de acesso da conta Expo, 16 caracteres ou mais |

- Os dois são segredos da função `dispatch-notifications`, gravados por `supabase secrets set`. Nunca vão ao app (nada de `EXPO_PUBLIC_`), às variáveis do GitHub nem ao repositório.
- Vazio, ausente, `expo` sem token válido ou qualquer outro valor (`Expo`, `Fake`, por exemplo) é "não configurado": o log registra `native_push_not_configured`, e as inscrições `expo` repetem até `maxAttempts` e falham, sem atrapalhar os navegadores da mesma pessoa. Enquanto `features.nativePush` estiver desligado não há aparelho inscrito, então deixar vazio no projeto hospedado só custa essa linha de log a cada execução.
- `fake` só quando escrito, e só na pilha local: nada sai da função, o log registra `native_push_fake` com a quantidade de mensagens, e a entrega ao aparelho conta como feita. Nunca no projeto hospedado: marcaria como entregue o que não chegou (BL23-1).
- Quem tem um `supabase/functions/.env` antigo, com `NATIVE_PUSH_PROVIDER=` vazio, troca para `fake` (ou copia de novo o `.env.example`).
- **Não ligue sem a decisão do humano.** `NATIVE_PUSH_PROVIDER=expo` e `EXPO_ACCESS_TOKEN` só depois do BL-29: conta Expo, credenciais FCM (Android) e APNs (iPhone) no EAS, e a conferência em aparelho. `features.nativePush` liga junto, não antes.

```bash
pnpm exec supabase secrets set NATIVE_PUSH_PROVIDER=expo EXPO_ACCESS_TOKEN=<token da conta Expo> --project-ref <ref>
```

No SQL Editor do projeto, crie os quatro segredos do Vault:

| Nome no Vault                | Valor                                                            | Quem lê                                                                                |
| ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `cron_secret`                | o mesmo `<valor>` de `CRON_SECRET`                               | `call_materialize_occurrences`, `call_proof_retention` e `call_dispatch_notifications` |
| `materialize_url`            | `https://<ref>.supabase.co/functions/v1/materialize-occurrences` | `call_materialize_occurrences`                                                         |
| `proof_retention_url`        | `https://<ref>.supabase.co/functions/v1/proof-retention`         | `call_proof_retention`                                                                 |
| `dispatch_notifications_url` | `https://<ref>.supabase.co/functions/v1/dispatch-notifications`  | `call_dispatch_notifications`                                                          |

```sql
select vault.create_secret('<valor>', '<nome>');
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` vêm da própria Supabase. Confirme que `SUPABASE_ANON_KEY` existe no projeto: `proof-url` e `materialize-occurrences` dependem dela.

## 3. Funções

Pelo CLI, com o Docker ligado, sem `--use-api`. O pacote de `materialize-occurrences` tem 15 MB, e o limite é de 20 MB pelo CLI, contra 5 MB no empacotamento pelo servidor (Dashboard, Management API e `--use-api`).

```bash
pnpm exec supabase functions deploy materialize-occurrences proof-validate proof-url proof-retention dispatch-notifications phone-verification whatsapp-webhook account-export account-delete --project-ref <ref>
```

`verify_jwt` vem de `supabase/config.toml`: ligado em `proof-validate`, `proof-url`, `phone-verification`, `account-export` e `account-delete`, desligado nas três de cron, que usam `x-cron-secret`, e em `whatsapp-webhook`, que confere a assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`.

URL do webhook, para o App Dashboard da Meta: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`, com o mesmo `WHATSAPP_VERIFY_TOKEN` e o campo `messages` assinado. Só quando o humano ligar a Meta (abaixo).

`materialize-occurrences` vai ao ar antes do app da Fase 4: o app novo lê `failed` e `deferred` da resposta (ADR-0008, seção 12).

## 4. Painel

- **Auth:** confirmação de email ligada. O `config.toml` local a mantém desligada, e isso não vale para produção.
- **Auth:** senha mínima 8.
- **Auth:** URLs de redirecionamento só do domínio do app e do esquema nativo, nunca com curinga no host: `https://app.tabolao.com/**` e `azkaban://**` (seção 8). O `/**` no caminho é o que deixa o link mágico voltar à tela de origem (`?next=`). As do `config.toml`, com `localhost`, são só da pilha local.
- **Auth, nunca `supabase config push`:** o `config.toml` é da pilha local, permissivo de propósito para a E2E (`max_frequency = "1s"`, confirmação desligada, curingas). Os valores de produção são postos no painel (ADR-0012, seção 4).
- **Auth, Rate Limits:** intervalo entre e-mails ao mesmo endereço de 60 s; entradas e cadastros, 30 a cada 5 minutos por IP; verificações de OTP, 30 a cada 5 minutos por IP; renovações, 150 a cada 5 minutos por IP. Com SMTP próprio, 30 e-mails por hora.
- **Auth, SMTP próprio:** o servidor de e-mail embutido só entrega para a equipe do projeto e por volta de 2 por hora. Sem SMTP próprio, ninguém de fora recebe o link mágico. Decisão do humano (ADR-0012, seção 17, item 6).
- **API, Exposed schemas:** só `public` e `graphql_public`. `net`, `cron` e `vault` nunca entram (ADR-0005, seção 12).
- **`pg_graphql`:** o app não usa GraphQL. Confira que `/graphql/v1` não mostra nada além do que a RLS já mostra pelo REST, e desligue a extensão se não houver motivo para mantê-la.

## 5. Conferências depois do deploy

**Cron.** Depois da primeira hora cheia:

```sql
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 20;

select id, status_code, created from net._http_response order by created desc limit 20;
```

Esperado: `succeeded` e `status_code` 200. A tabela de respostas guarda poucas horas, então confira logo depois de uma execução.

**Chave VAPID.** A pública do app e a do servidor têm de ser a mesma. Uma inscrição feita com uma chave só aceita envios assinados por ela, e o serviço de push responde 403 aos outros, que a outbox marca como `failed` com `push_forbidden`, sem apagar a inscrição. Compare sem mostrar as chaves:

```bash
pnpm exec supabase secrets list --project-ref <ref>   # o resumo SHA-256 de VAPID_PUBLIC_KEY
printf %s "<vars.EXPO_PUBLIC_VAPID_PUBLIC_KEY do GitHub>" | sha256sum
```

Os dois resumos têm de ser iguais. Depois, em produção:

```sql
select status, last_error, count(*) from public.notification_outbox
where created_at > now() - interval '1 day' group by 1, 2 order by 3 desc;
```

Muitas linhas `push_forbidden` são chave trocada: corrija o segredo da função, e as inscrições voltam a receber. `push_endpoint_not_allowed` é um host fora de `notificationRules.pushEndpointHosts`.

**Corpo de 2 MiB.** O limite hospedado de corpo não está documentado (ADR-0007, seção 3). Envie uma prova de 2 MiB pelo app ou direto à função. Se não passar, a saída é o upload assinado, com o mesmo `proofUploadMetaSchema`.

**`WORKER_LIMIT`.** Nos logs das funções, procure `WORKER_LIMIT` ou 546 nas primeiras chamadas de `proof-validate`. O custo de CPU da partida a frio não foi medido fora da máquina local.

**Coordenadas nos logs.** Confira se os logs de requisição do projeto guardam o cabeçalho `x-proof-meta`, que leva as coordenadas. Na pilha local, não guardam.

## 6. Quando a retenção para

O aviso de consentimento promete apagar a foto em 90 dias, então a retenção não pode falhar em silêncio. Há dois sinais:

| Sinal                            | Onde aparece                                                 | O que significa                                                                                                              |
| -------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `proof_retention_not_configured` | `cron.job_run_details`, `status = 'failed'`, de hora em hora | Falta `proof_retention_url` ou `cron_secret` no Vault. Nada é chamado                                                        |
| `proof_retention_overdue`        | Log do Postgres, como `WARNING`                              | Há foto com mais de um dia além do prazo: segredo errado, função fora do ar, ou a função falhando. A chamada continua saindo |

Enquanto não houver alerta automático, a conferência é manual. Enquanto a primeira prova não fizer 91 dias, o segundo sinal não dispara, por isso a seção 5 confere a resposta da função. Para contar as fotos atrasadas:

```sql
select count(*) from public.task_proofs
where photo_deleted_at is null
  and received_at < now() - make_interval(days => (public.proof_rules() ->> 'retentionDays')::int + 1);
```

No ambiente local, sem esses segredos, o job `proof-retention` fica `failed`. É esperado.

O mesmo vale para `materialize_not_configured` (job `materialize-occurrences`, a cada 15 minutos) e `dispatch_notifications_not_configured` (job `dispatch-notifications`, a cada minuto): sem os segredos do Vault, a execução fica `failed` em `cron.job_run_details` e nada é chamado. A consulta a `net._http_response` da seção 5 é o que mostra que a chamada chegou à função.

## 7. Antes de ligar a Meta

Só por decisão do humano. Até lá, `WHATSAPP_PROVIDER` fica `console` em todo ambiente e nada é cobrado. Confira, nesta ordem:

1. Tudo da lista "Para o humano decidir ligar a Meta" do ADR-0009, seção 10: portfólio empresarial, app de desenvolvedor com o produto WhatsApp, conta do WhatsApp Business, número dedicado com nome de exibição aprovado, meio de pagamento no Billing Hub e os dois templates da seção 6 aprovados, com os nomes e o idioma `pt_BR` de `whatsappDefaults.templates`.
2. O custo estimado da mesma seção, com o número de usuários do momento.
3. `WHATSAPP_APP_SECRET` trocado pelo segredo do app da Meta, e `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` gravados, por `supabase secrets set`.
4. A URL do webhook (seção 3) verificada no App Dashboard, com o campo `messages` assinado. O `GET` de verificação tem de responder 200.
5. Só então `WHATSAPP_PROVIDER=meta`. Com `meta` e algum dos quatro inválido, o WhatsApp não é reivindicado; sem VAPID também, o despacho responde 500 `channels_not_configured`.
6. Um teste com o próprio número: pedir o código pela tela, confirmar, aceitar e esperar o resumo. Depois, em produção:

```sql
select purpose, status, error_code, count(*) from public.whatsapp_messages
where created_at > now() - interval '1 day' group by 1, 2, 3 order by 4 desc;

select status, last_error, count(*) from public.notification_outbox
where channel = 'whatsapp' and created_at > now() - interval '1 day' group by 1, 2 order by 3 desc;
```

Na outbox, `wa_<código>` e `wa_http_<status>` são recusas da Meta, e `wa_provider_error` é o provedor que lançou, que volta pelo backoff (ADR-0009, seção 17). `whatsapp_not_ready` é opt-out ou troca de número entre a gravação e o envio, e é normal em pequena quantidade.

## 8. Hostinger (app.tabolao.com)

O app web fica na Hostinger Premium, em `https://app.tabolao.com` (BL-24). A cada push na `main`, o workflow `.github/workflows/deploy-web.yml` faz o build e sobe `apps/app/dist/` por FTPS. Enquanto os três secrets de FTP não existirem, ele termina verde, com o aviso "Deploy skipped", e não sobe nada. Nenhum valor desta seção entra no repositório.

A Hostinger ignora `_headers` e `_redirects`. O build grava `dist/.htaccess` (`apps/app/scripts/headers.ts`) com: redirecionamento para HTTPS, fallback de rota para `index.html`, os cabeçalhos de segurança do bloco `/*` de `public/_headers` (a CSP Report-Only com o host exato do Supabase incluída), cache de um ano para os arquivos com hash e `no-cache` para `index.html`, `sw.js` e `manifest.webmanifest`.

**1. Subdomínio.** No hPanel: **Sites** → o site de `tabolao.com` → **Domínios** → **Subdomínios**. Crie `app`. Anote a pasta que o hPanel mostra (por exemplo, `public_html/app`). O DNS do subdomínio é criado junto, se o domínio usa os nameservers da Hostinger.

**2. SSL.** **Segurança** → **SSL**: confirme que `app.tabolao.com` tem o certificado grátis ativo. Se não tiver, instale. Pode levar alguns minutos depois do subdomínio. O `.htaccess` já força HTTPS, então o "Forçar HTTPS" do painel é opcional.

**3. Conta FTP restrita.** **Arquivos** → **Contas FTP** → criar conta, com o diretório na pasta do subdomínio do passo 1 (nunca a raiz `public_html`). Use uma senha longa e aleatória, só para o deploy. Anote o **nome do host FTP** (por exemplo, `ftp.tabolao.com`) e o usuário completo que o painel mostra.

**4. GitHub.** No repositório: **Settings** → **Secrets and variables** → **Actions**.

Aba **Secrets** (New repository secret):

| Secret         | Valor                                       |
| -------------- | ------------------------------------------- |
| `FTP_SERVER`   | o nome do host FTP do passo 3, sem `ftp://` |
| `FTP_USERNAME` | o usuário da conta FTP do passo 3           |
| `FTP_PASSWORD` | a senha da conta FTP do passo 3             |

Aba **Variables** (New repository variable). Tudo o que começa com `EXPO_PUBLIC_` vai para o JavaScript que o navegador baixa, então nada aqui é segredo, e nenhum segredo pode vir para cá:

| Variable                               | Valor                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`             | `https://<ref>.supabase.co`                                                                            |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | a chave publicável (`sb_publishable_...`) de **Project Settings** → **API Keys**. Nunca a `sb_secret_` |
| `EXPO_PUBLIC_VAPID_PUBLIC_KEY`         | a `VAPID_PUBLIC_KEY` da seção 2. Vazia, o app esconde o Web Push                                       |
| `EXPO_PUBLIC_APP_NAME`                 | o nome do app (provisório: `Azkaban`)                                                                  |
| `EXPO_PUBLIC_APP_SCHEME`               | `azkaban`                                                                                              |
| `FTP_SERVER_DIR`                       | `./` quando a conta FTP já abre na pasta do subdomínio; sempre termina com `/`                         |

Com os secrets presentes, o workflow falha (em vez de subir) se faltar variável, se a URL não for `https` ou apontar para `localhost` ou IP local, se a chave for de servidor ou se `FTP_SERVER_DIR` não terminar com `/`.

**5. Primeiro deploy.** **Actions** → **Deploy web** → **Run workflow** na `main`. Depois, cada push na `main` publica sozinho, um de cada vez. Só os arquivos alterados sobem, e os que saíram do build são apagados do servidor. A action grava `.ftp-deploy-sync-state.json` na pasta, e o `.htaccess` nega acesso a ele. Não apague esse arquivo: sem ele, o próximo deploy sobe tudo de novo.

- Se o passo do FTP falhar por certificado (`is not in the cert's altnames`), o log mostra os nomes que o certificado do servidor aceita. Troque `FTP_SERVER` por um deles. Não troque `security: strict` por `loose`: a senha passaria a aceitar qualquer servidor no caminho.
- Durante o upload, por alguns segundos, quem abrir o app pode receber o `index.html` novo antes dos arquivos dele. Recarregar resolve.

**6. Conferir.** Depois do primeiro deploy:

```bash
curl -sI http://app.tabolao.com/                     # 301 para https://
curl -sI https://app.tabolao.com/tasks               # 200, text/html, Cache-Control: no-cache e os cabeçalhos de segurança
curl -sI https://app.tabolao.com/sw.js               # JavaScript, Cache-Control: no-cache
curl -sI https://app.tabolao.com/manifest.webmanifest  # application/manifest+json, no-cache
curl -sI https://app.tabolao.com/.ftp-deploy-sync-state.json  # 403
```

No navegador, abra um arquivo de `/_expo/static/js/web/` pela aba Rede: `Cache-Control: public, max-age=31536000, immutable`. No console, com o app inteiro (login, Realtime, câmera e foto, sino, push), anote cada aviso `Content-Security-Policy-Report-Only`: é a rodada que decide quando a CSP vira obrigatória (ADR-0012, seção 13, item 1). HSTS ainda não é enviado; fica para depois de o HTTPS estar estável.

### E-mail (Brevo)

Sem SMTP próprio, ninguém de fora recebe o link mágico (seção 4).

1. Crie uma conta grátis no Brevo (brevo.com). O plano grátis basta para o volume do começo; confira o limite diário no dia.
2. **Senders, Domains & Dedicated IPs** → **Domains** → **Add a domain**: `tabolao.com`. O Brevo mostra os registros a criar.
3. No hPanel, **Domínios** → `tabolao.com` → **DNS / Nameservers**, crie exatamente os registros que o Brevo mostrou:
   - o TXT de verificação (`brevo-code:...`);
   - os de **DKIM** (`brevo1._domainkey` e `brevo2._domainkey`, ou o TXT `mail._domainkey`, conforme o Brevo pedir);
   - **SPF**: um domínio só pode ter **um** TXT `v=spf1`. Se já existir um (o e-mail da Hostinger cria `v=spf1 include:_spf.mail.hostinger.com ~all`), acrescente `include:spf.brevo.com` nele, em vez de criar outro;
   - **DMARC**: TXT em `_dmarc` com `v=DMARC1; p=none; rua=mailto:<seu e-mail>`, se ainda não existir. `p=none` só observa; endureça depois de algumas semanas de relatórios limpos.
4. Volte ao Brevo e clique em **Authenticate** até o domínio ficar verificado. O DNS pode levar algumas horas.
5. **Senders** → adicione o remetente `nao-responda@tabolao.com`, com o nome do app.
6. **SMTP & API** → aba **SMTP**: anote o servidor (`smtp-relay.brevo.com`), a porta (587) e o login, e gere uma **SMTP key** só para o Supabase. A chave vai direto para o painel do Supabase, nunca para o repositório nem para o GitHub.
7. No Supabase: **Authentication** → **SMTP Settings** (em algumas versões do painel, dentro de **Emails**). Ligue o SMTP próprio e preencha: remetente `nao-responda@tabolao.com`, nome do app, host, porta 587, usuário = o login do Brevo, senha = a SMTP key. Depois, em **Rate Limits**, os 30 e-mails por hora da seção 4.
8. Teste: peça um link mágico para um e-mail seu fora da equipe do projeto e confira que chega, e que não cai no spam.

### Auth no painel do Supabase

**Authentication** → **URL Configuration**:

- **Site URL:** `https://app.tabolao.com`
- **Redirect URLs:** `https://app.tabolao.com/**` e `azkaban://**`. Nenhuma outra, e nenhuma com `localhost`.

O resto da configuração de Auth de produção está na seção 4.

## Fora desta lista

A prova não vai para funcionários reais sem a decisão de base legal e sem F8-3 (ADR-0007, seção 20).
