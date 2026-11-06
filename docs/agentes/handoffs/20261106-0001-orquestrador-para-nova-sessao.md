# Handoff: orquestrador para nova sessão, colocar no ar

**De:** orquestrador (sessão de 2026-11-01 a 2026-11-05)
**Para:** a próxima sessão do orquestrador, e o humano
**Data:** 2026-11-06 00:01 (BRT)
**Branch:** `main` (`1f9cb2b`, CI verde)

## Estado

- As Fases 1 a 8 estão fechadas, e o backlog dentro dos limites também. PRs #1 a #12 foram mergeados na `main`. Não há PR aberto.
- **Supabase hospedado** (`azkaban`, ref `sofxwwzejdjdhtrjmpoc`, us-east-1):
  - 207 migrations aplicadas (`db push --dry-run` dá `upToDate`).
  - 7 segredos das funções: `CRON_SECRET`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `WHATSAPP_PROVIDER=console`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`. `NATIVE_PUSH_PROVIDER` fica sem definir.
  - 9 funções `ACTIVE`.
  - O CLI desta máquina está logado na conta do humano.
- **GitHub:**
  - Variables do deploy já postas: `EXPO_PUBLIC_*` e `FTP_SERVER_DIR=./`.
  - Os Secrets de FTP faltam, então o `Deploy web` termina verde com "Deploy skipped".
- **QUADRO, backlog pós-Fase 8:**

  | Status       | Itens                                                                          |
  | ------------ | ------------------------------------------------------------------------------ |
  | Em andamento | BL-24 (hospedagem) e BL-26 (SMTP)                                              |
  | Bloqueado    | BL-25 (Lighthouse e CSP), BL-29 (Expo e Firebase) e BL-36 (verificação manual) |
  | Adiado       | BL-30 (WhatsApp real)                                                          |

## O que falta para colocar no ar

### Com o humano

As credenciais ficam com o humano. O Claude nunca digita senha, token ou chave.

1. **Vault.** Abra `C:\Users\rafae\azkaban-vault.sql` e rode o conteúdo no SQL Editor do projeto (**SQL Editor** → **New query**). Depois apague o arquivo. Sem isso os crons não chamam as funções.
2. **VAPID.** Guarde `C:\Users\rafae\vapid-azkaban-prod.env` no gerenciador de senhas e apague o arquivo. Ele é a única cópia da chave privada fora do Supabase.
3. **Hostinger.** Siga os passos 1 a 3 da seção 8 de `docs/implantacao.md`:
   - criar o subdomínio `app`;
   - confirmar o SSL de `app.tabolao.com`;
   - criar uma conta FTP restrita à pasta do subdomínio, nunca à `public_html`.
4. **GitHub Secrets.** Em **Settings** → **Secrets and variables** → **Actions** → **Secrets**, cadastre `FTP_SERVER` (sem `ftp://`), `FTP_USERNAME` e `FTP_PASSWORD`. Se a conta FTP não abrir direto na pasta do subdomínio, ajuste a Variable `FTP_SERVER_DIR` (termina com `/`).
5. **Brevo.** Siga a seção 8, "E-mail (Brevo)":
   - conta grátis;
   - domínio `tabolao.com`, com os registros do Brevo no DNS do hPanel. Um só TXT `v=spf1`, com `include:spf.brevo.com`; DKIM; DMARC `p=none`;
   - remetente `nao-responda@tabolao.com`;
   - uma SMTP key só para o Supabase.
6. **Auth no painel do Supabase.** Seções 4 e 8 de `docs/implantacao.md`:
   - **URL Configuration:**
     - Site URL `https://app.tabolao.com`;
     - Redirect URLs `https://app.tabolao.com/**` e `azkaban://**`, nenhuma outra.
   - **Confirmação de e-mail:** ligada.
   - **Senha mínima:** 8.
   - **SMTP:** o do Brevo (`smtp-relay.brevo.com`, porta 587).
   - **Rate Limits:**
     - 60 s entre e-mails ao mesmo endereço;
     - 30 a cada 5 minutos por IP para entradas e cadastros;
     - 30 a cada 5 minutos por IP para OTP;
     - 150 a cada 5 minutos por IP para renovações;
     - 30 e-mails por hora.
   - **API → Exposed schemas:** só `public` e `graphql_public`.
   - **Nunca** use `supabase config push`.

### Com o Claude, depois dos itens acima

Cada comando no hospedado vem com a confirmação do humano.

1. **Primeiro deploy.** **Actions** → **Deploy web** → **Run workflow** na `main`. Depois, os `curl -sI` do passo 6 da seção 8, mais o `Cache-Control` dos arquivos com hash.
2. **Crons.** Depois da primeira hora cheia com o Vault, rode as duas consultas da seção 5. Esperado: `succeeded` e `status_code` 200.
3. **Chave VAPID.** Compare os resumos SHA-256 da seção 5, sem exibir as chaves.
4. **E-mail.** O humano pede um link mágico para um e-mail fora da equipe e confere que ele chega e não cai no spam.
5. **Resto da seção 5:**
   - prova de 2 MiB;
   - `WORKER_LIMIT` nos logs de `proof-validate`;
   - se os logs guardam o cabeçalho `x-proof-meta`.
6. **Fechar no QUADRO e no LOG:** BL-24 e BL-26 como feitos. Isso desbloqueia o BL-25: Lighthouse nas boas-vindas e a rodada de avisos da CSP Report-Only, que decide quando ela vira obrigatória (ADR-0012, seção 13, item 1).

## Depois do lançamento web (backlog)

- **BL-29 (só Android):** o humano cria as contas Expo e Firebase, de graça, e o Claude gera o APK de teste.
  - O identificador é `com.tabolao.app`.
  - É preciso ligar `features.nativePush` e definir `NATIVE_PUSH_PROVIDER`.
- **BL-36:** o humano testa o push real e o app no Android e no computador. Sem iPhone e sem leitor de tela.
- **BL-30:** WhatsApp real pela Meta. Adiado por decisão do humano. Ele já tem a conta e o número. Antes de ligar, veja a seção 7 de `docs/implantacao.md`.
- **Fora da lista:** a prova não vai para funcionários reais sem a decisão de base legal e sem a F8-3 (ADR-0007, seção 20).

## Cuidados para a próxima sessão

- **Antes de qualquer alteração**, leia o `CLAUDE.md`, o cabeçalho e as últimas 10 entradas do LOG, o `AGENTES.md`, a arquitetura e os ADRs.
- **Liberado:** merge na `main` e comandos no hospedado com confirmação.
- **Proibido:**
  - gastar dinheiro;
  - commitar segredos;
  - desativar RLS;
  - `supabase functions serve` no Windows;
  - remover worktrees antigos. O classificador nega, e há uns 160.
- **Pilhas:** pilha A para a E2E. Pilha B enxuta com `pilha-b.sh db`. O `.env` das funções precisa existir antes de `pnpm db:start`, e o Docker pode estar fechado: confira com `docker info`.
- **Specs que fecham a aba offline:** use `page.goto('about:blank')` antes de `page.close()`. Senão a emulação offline cai e a aba que está fechando manda a fila.
