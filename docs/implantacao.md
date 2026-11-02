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

- `VAPID_SUBJECT` é `mailto:` ou uma URL `https:`. O serviço da Apple recusa outro valor, e a função responde `vapid_not_configured` a qualquer outro.
- `VAPID_PUBLIC_KEY` vai também ao app, como `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, no ambiente do build do Netlify. As duas têm de ser **iguais**: a seção 5 confere.
- A chave privada fica só no segredo da função e no arquivo da sua máquina. Nunca a commite, nem a local. Guarde o arquivo num cofre de senhas e apague-o do disco.
- Trocar o par invalida todas as inscrições: cada navegador precisa se inscrever de novo, o que o app faz ao abrir, porque a chave do cliente muda junto.
- Sem os três segredos, `dispatch-notifications` responde 500 `vapid_not_configured` e não reivindica nada da fila.

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
pnpm exec supabase functions deploy materialize-occurrences proof-validate proof-url proof-retention dispatch-notifications --project-ref <ref>
```

`verify_jwt` vem de `supabase/config.toml`: ligado em `proof-validate` e `proof-url`, desligado nas três de cron, que usam `x-cron-secret`.

`materialize-occurrences` vai ao ar antes do app da Fase 4: o app novo lê `failed` e `deferred` da resposta (ADR-0008, seção 12).

## 4. Painel

- **Auth:** confirmação de email ligada. O `config.toml` local a mantém desligada, e isso não vale para produção.
- **Auth:** senha mínima 8.
- **Auth:** URLs de redirecionamento sem curinga. As do `config.toml` usam `/**` só para desenvolvimento.
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
printf %s "<EXPO_PUBLIC_VAPID_PUBLIC_KEY do Netlify>" | sha256sum
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

## Fora desta lista

A prova não vai para funcionários reais sem a decisão de base legal e sem F8-3 (ADR-0007, seção 20).
