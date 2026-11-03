# Arquitetura

Visão geral. Decisões e alternativas ficam em [adr/](adr/); o escopo do produto, em [PROMPT_MESTRE.md](PROMPT_MESTRE.md).

## Camadas

```
apps/app (rotas finas)
   └─> packages/features/*  (telas e fluxos, um módulo por feature)
          ├─> packages/ui        design system
          ├─> packages/i18n      traduções por módulo
          ├─> packages/data      repositórios, único acesso ao Supabase
          ├─> packages/platform  câmera, push, geolocalização, armazenamento
          ├─> packages/config    env validado, feature flags
          ├─> packages/core      domínio puro
          └─> packages/contracts tipos e schemas Zod
supabase/  migrations, seeds, Edge Functions, testes de RLS
```

## Regras verificadas por ferramenta

`pnpm boundaries` (dependency-cruiser, em `.dependency-cruiser.cjs`) falha quando:

- uma feature importa outra feature;
- um pacote importa o `src/` interno de outro em vez do `index.ts`;
- `core` ou `contracts` importam React, React Native ou Supabase;
- algo fora de `packages/data` importa `@supabase/*`;
- `packages/` importa `apps/`.

Uma feature pode depender de `@azkaban/platform` no próprio `package.json`, como `tasks`, `groups` e `contexts`. É o caminho previsto nas camadas: o proibido é usar o recurso de plataforma fora de `packages/platform`.

`pnpm lint` (ESLint) proíbe `any`, e globais de navegador (`window`, `document`, `navigator`) fora de `packages/platform`.

## Configuração e segredos

- `packages/config` valida o ambiente com Zod ao iniciar. `apps/app/src/env.ts` lê as variáveis `EXPO_PUBLIC_*` por nome, porque o Expo só embute acessos estáticos.
- `apps/app/.env.local` guarda só valores públicos do cliente. `.env.local` na raiz guarda valores de servidor, como `SUPABASE_DB_URL`.
- Ambos são ignorados pelo git. O repositório é público: só `.env.example` é versionado.

## Tokens

`packages/ui/src/tokens.ts` é a fonte das cores e medidas. `apps/app/tailwind.config.ts` as expõe ao NativeWind, com um par `<nome>` e `<nome>-dark` para cada cor de tema.

O tema usa `darkMode: 'class'`, porque o modo `media` dispara erro na web no NativeWind 4.2. `useSystemColorScheme`, em `packages/ui`, mantém a classe igual ao tema do sistema.

## Adapters de plataforma

Um adapter visual em `packages/platform` tem três arquivos: `Nome.web.tsx`, `Nome.native.tsx` e o `Nome.tsx`, que só declara os tipos e lança erro, porque o Metro nunca o carrega.

O arquivo-base é `.tsx` de propósito. Com `.ts`, o Metro o escolhe antes do `.web.tsx`, e com `.d.ts` o `pnpm boundaries` não resolve o import. `.tsx` perde para as duas versões de plataforma e continua resolvido pelo TypeScript e pelo dependency-cruiser.

Um adapter sem tela tem dois arquivos: o sem sufixo é a versão nativa, e o `.web.ts` a substitui no Metro. É o caso de `keyboard`, `sha256` e `geolocation`.

`packages/platform/tsconfig.json` inclui a lib `dom`, porque os adapters `.web` usam `MediaStream`, `canvas` e `navigator`. Só esse pacote vê os tipos do DOM.

## i18n

Variável de tradução não pode ter o nome de uma opção do `t()`. `{{lng}}` é o caso conhecido: o i18next lê `lng` como o idioma de destino, e a tela cai com `lng?.toLowerCase is not a function`. Use `latitude` e `longitude`.

## Navegação

As abas são Hoje, uma por área vinda do banco, Calendário e Perfil. As áreas dividem a rota `area/[areaKey]`, e `apps/app/src/AppTabBar.tsx` desenha uma aba para cada linha de `areas`. Grupos fica em Perfil, e Equipe, na página do grupo.

Features não se importam, então a rota compõe a entrada de uma feature na tela de outra, por `children`. Decisão no [ADR-0006](adr/0006-calendario-equipe-navegacao.md).

## Tarefas

Regras completas no [ADR-0005](adr/0005-tarefas-ocorrencias-recorrencia.md).

- Telas contam dias no fuso do perfil de quem vê, e a agenda fica no fuso da tarefa ([ADR-0006](adr/0006-calendario-equipe-navegacao.md)).

- `tasks` é a definição, e `task_occurrences` guarda o estado de cada instância.
- O cliente lê por RLS, cria tarefa por `insert` e faz o resto pelas RPCs `set_occurrence_status`, `edit_task` e `delete_task`. Triggers gravam histórico e XP em qualquer caminho.
- Ocorrências recorrentes só nascem na Edge Function `materialize-occurrences`, que usa a recorrência de `packages/core`. A de tarefa avulsa vem de um trigger.
- `taskRules` (`packages/config`) e `occurrenceTransitions` (`packages/contracts`) têm espelho no banco, como a matriz de permissões. Os dois arquivos não têm importação em tempo de execução, para o Node carregá-los direto em `pnpm db:check-permissions`.

## Prova por foto

Regras completas no [ADR-0007](adr/0007-prova-por-foto.md).

- O cliente nunca fala com o Storage. A RPC `issue_proof_challenge` entrega um nonce, `proof-validate` recebe os bytes e grava com service role, e `commit_proof` cria a prova e leva a ocorrência a `done` em uma transação.
- `claim_proof_challenge` e `commit_proof` só aceitam `service_role`. O bucket `task-proofs` não tem política para `anon` nem `authenticated`.
- O trigger de status recusa `done` em tarefa com foto sem uma prova corrente, em qualquer caminho.
- "Em análise" é `done` com `proof_review_status = 'in_review'`, não um status.
- Fotos só saem por URL assinada curta, de `proof-url`. Quem vê segue `can_view_proof`, mais restrita que `can_view_task`.
- `proofRules` (`packages/config`) tem espelho em `app_settings`, chave `proof_rules`.

## Notificações

Regras completas no [ADR-0008](adr/0008-notificacoes-push-pwa-vermelho-automatico.md).

- Um evento grava uma linha em `notifications`, o sino, por trigger ou pela varredura de lembretes, em SQL. Vale para qualquer caminho. A linha guarda referências, e o título vem pela RLS.
- Cada canal externo ligado ganha uma linha em `notification_outbox`, única por notificação e canal. `dispatch-notifications`, a cada minuto, reivindica um lote, aplica o horário de silêncio no fuso do perfil, envia pela implementação de `NotificationChannel` e informa o resultado, com backoff.
- O app recebe o sino pelo Realtime (`postgres_changes` em `notifications`, com RLS).
- Web Push usa VAPID: a chave privada é segredo da Edge Function, e a pública vem de `EXPO_PUBLIC_VAPID_PUBLIC_KEY`. Inscrições só por `register_push_subscription`, com lista de hosts de serviços de push. No iPhone, só com o app na Tela de Início, iOS 16.4 ou mais novo.
- `apps/app/public` tem `index.html`, `manifest.webmanifest` e `sw.js`. O service worker só mostra o push e abre o caminho interno; não tem cache.
- O vermelho automático é a função SQL `auto_miss_occurrences`, a cada 5 minutos, por `auto_miss_at`. Os triggers de status gravam histórico, XP e o aviso.
- `notificationRules` (`packages/config`) tem espelho em `app_settings`, chave `notification_rules`. O WhatsApp da Fase 5 entra como mais um canal na mesma outbox.

## WhatsApp

Regras completas no [ADR-0009](adr/0009-whatsapp-verificacao-opt-in-resumo-diario.md).

- `WhatsAppProvider` tem duas implementações nas Edge Functions. `ConsoleProvider` é o padrão, sem credenciais, e grava em `whatsapp_console_messages`, que só a service role lê e a E2E consulta. `MetaCloudProvider` fala com a Cloud API e só entra com `WHATSAPP_PROVIDER=meta`, por decisão do humano.
- O WhatsApp é mais um canal da outbox: `WhatsAppChannel` em `dispatch-notifications`, só para os tipos de `notificationRules.whatsappTypes` (hoje, `daily_summary`) e só para perfis com telefone verificado e opt-in mais novo que o opt-out. O claim confere de novo.
- O telefone é verificado por um código num template de autenticação: `phone-verification` envia, `confirm_phone_verification` confere. O código só existe como hash, com limites por pessoa e por número.
- O resumo diário é a função SQL `enqueue_daily_summaries`, a cada minuto, uma vez por usuário e data local. O claim lê a fonte na hora do envio, e `buildDailySummary`, em core, monta os parâmetros do template.
- `whatsapp-webhook` não usa JWT: confere a assinatura dos bytes brutos, grava os status em `whatsapp_messages` e trata PARAR. O resto das mensagens é ignorado sem guardar.
- `whatsappRules` tem espelho em `app_settings`, chave `whatsapp_rules`. Telefone, código e texto nunca vão a log.

## Compras

Regras completas no [ADR-0011](adr/0011-lista-de-compras.md).

- Lista e catálogo têm dois escopos: grupo (`group_id`) ou pessoal (`owner_user_id`). Lista pessoal usa o catálogo pessoal, e nenhum admin os vê.
- O seed do catálogo é `packages/config/src/shopping-catalog-seed.ts`, espelhado em `shopping_catalog_seed` por migration e copiado para cada grupo e perfil novo por trigger. Cada grupo edita a própria cópia.
- O item da lista é uma cópia do catálogo no momento em que entra. O stepper soma um delta no banco, numa instrução, para dois toques simultâneos contarem os dois. Marcar é um valor, não uma troca.
- Criar, finalizar, stepper e marcar são RPCs; o resto é `insert` e `update` com RLS e colunas liberadas. Triggers carimbam quem adicionou e quem marcou, e recusam escrita em lista finalizada.
- Tempo real por `postgres_changes` em `shopping_lists` e `shopping_list_items`, com RLS, como o sino. Os modos "montar" e "no mercado" são só do cliente.
- O vínculo com tarefa é só navegação. O XP de compra é um trigger ao finalizar, com limites contra repetição, e entra depois da Fase 6.
- `shoppingRules`, as categorias, as unidades e o seed têm espelho no banco, conferido por `pnpm db:check-permissions`.

## Gamificação

Regras completas no [ADR-0010](adr/0010-gamificacao-xp-ofensiva-conquistas-ranking.md).

- `xp_events` é a fonte, e só o banco escreve. `user_stats`, `user_day_stats` e `user_achievements` são cache derivado, e `recompute_user_gamification` os refaz. O nível não é guardado: `packages/core` o deriva do total.
- `occurrence_award_xp` concede o base, o bônus de prova e aplica o teto diário, no dia local do perfil. O dia perfeito é conciliado por dia, e concluir e reabrir em laço soma zero.
- O trigger de status refaz o dia da ocorrência e a ofensiva dali até hoje. O job `close_gamification_days`, a cada 15 minutos, fecha os dias no fuso do perfil.
- `packages/core/src/gamification` é o motor puro e a especificação: o banco repete as mesmas contas, com os mesmos casos de teste.
- Só o dono lê os próprios dados. O ranking, pela RPC `group_ranking`, mostra só nome e XP semanal do grupo, e fica desligado por padrão em grupos `company`.
- As comemorações vêm do Realtime de `xp_events`, num `CelebrationHost` que a rota monta; `tasks` não conhece `gamification`.
- `gamificationRules` (`packages/config`) tem espelho em `app_settings`, chave `gamification_rules`. `gamificationDefaults` é só do cliente.

## Banco

Desenvolvimento em Supabase local (`pnpm db:start`, exige Docker), nas portas 544xx para conviver com outros projetos locais: `apps/app/.env.development.local` aponta o `pnpm dev` para ele. O projeto hospedado recebe migrations por `supabase db push --db-url "$SUPABASE_DB_URL"`, e só após revisão.
