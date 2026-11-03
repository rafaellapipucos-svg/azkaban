# ADR-0004: Decisões da Fase 1 e padrões da seção 15

**Status:** aceito. Rafaell aprovou a Fase 0 sem alterar os padrões propostos.

## Contexto

O modelo de dados do prompt mestre é um ponto de partida. A Fase 1 o refinou, e as perguntas da seção 15 ficaram com os padrões sugeridos.

## Decisão

**Padrões da seção 15:** WhatsApp pela API oficial da Meta, com mock em desenvolvimento; hospedagem web na Netlify; e-mail e link mágico agora, telefone na Fase 5; ranking opcional em família e desativado em empresa; amarelo sempre com justificativa; vermelho automático no fim do dia ou na data limite; tela "Hoje" antes das abas. O nome do app segue provisório.

**Modelo de dados:**

- `profiles` tem só o que a Fase 1 usa. Telefone, resumo diário e opt-in do WhatsApp chegam na Fase 5, e avatar quando houver upload.
- A linha de `profiles` é visível só ao dono. Colegas de grupo veem nome e papel por `group_member_profiles()`, que nunca expõe telefone ou preferências.
- `group_members` não tem `status`: convite aceito cria a linha, e sair apaga a linha. Recusar um convite não grava nada.
- `group_types` é tabela, para um tipo novo não exigir mudança de constraint.
- Localização de `contexts` entra na Fase 3, que é quem a usa.
- A matriz de permissões fica em migration, não em seed: `db push` não roda seeds, e as regras de acesso de produção dependem dela. `pnpm db:check-permissions` compara a matriz com o espelho em `packages/core`.
- Mudanças sensíveis usam privilégio por coluna além de RLS: `owner_id`, papéis e `use_count` não são graváveis pelo cliente.

**Navegação:** enquanto as tarefas não chegam, as áreas vivem como chips na tela Início, porque a lista vem do banco e as abas do Expo Router são estáticas. A Fase 2 revê isso junto com a tela "Hoje". Superado pelo [ADR-0006](0006-calendario-equipe-navegacao.md), seção 5.

**Mascote:** Broto, um personagem original, uma semente com folhas na cabeça, porque o app é sobre coisas crescendo dia a dia. Em SVG com quatro humores; Lottie fica para a Fase 6.

**Decisões da revisão de segurança:**

- Remover alguém cancela todos os convites ativos do grupo. É mais simples que manter uma lista de removidos, e o custo é gerar um convite novo. Sair por conta própria não cancela nada.
- Convite de admin só é visível e revogável por quem pode dar esse papel. Revogar é irreversível, e a validade máxima é de 30 dias.
- `owner_id` continua bloqueando a exclusão da conta de propósito: o dono precisa passar a posse antes, em F8-3. Colunas `created_by` usam `on delete set null`.
- O fluxo de autenticação continua implícito, sem PKCE. PKCE exige abrir o e-mail no mesmo navegador que pediu o link, e o público do app costuma abrir no navegador interno do aplicativo de e-mail. A proteção é `safeInternalPath` em todo `next`, mais a lista de redirecionamentos do Supabase, que **não pode ter curingas em produção**.

## Consequências

- Convite por telefone fica para a Fase 5, depois da verificação de telefone.
- Sem rate limiting em convites até F8-4. O código tem 10 caracteres, cerca de 8×10^14 combinações, e o RPC exige login.
- No projeto hospedado, confirmação de e-mail precisa ficar ligada e a senha mínima deve ser 8, como no `config.toml`.
- No app nativo o link mágico só funcionará com o deep link de sessão, previsto em F8-7. Na web já funciona.

## Revisão de 2026-11-03: login CSRF pelo link de sessão (BL23-2)

**Status desta seção:** proposta, à espera do humano. A decisão do fluxo implícito, acima, segue valendo até lá.

**Risco.** No fluxo implícito, o link traz `access_token` e `refresh_token` no fragmento, e nada liga o link ao aparelho que o pediu. Um atacante faz login numa conta descartável, monta `azkaban:///<caminho>#access_token=…&refresh_token=…` (ou a URL web equivalente) com os próprios tokens e manda à vítima. Ao tocar, o aparelho passa para a conta do atacante, por cima da sessão dela, e o que a vítima registrar dali em diante (tarefas, fotos de prova com local, telefone verificado, aparelho de push) fica legível pelo atacante em outro aparelho. É dado pessoal entregue a terceiro (LGPD). `safeInternalPath` e a lista de redirecionamentos protegem o destino, não a origem dos tokens. Origem: revisão de segurança do backlog, LOG de 2026-11-03 11:04.

**Mitigação no nativo (em andamento, auth-grupos, `setSessionFromLink`/`useSessionFromLink`):**

1. Com sessão ativa, o link de sessão é ignorado: no máximo vai para o caminho, sem trocar a conta.
2. A sessão só é aceita se este aparelho pediu um link há pouco: um marcador com validade no `storage`, gravado em `signInWithOtp`, `signUp` e na reautenticação por link, e apagado ao usar. Sem marcador, vai para `/sign-in` sem sessão.

No nativo isso custa pouco: o deep link abre o próprio app, que tem o marcador, venha o e-mail de onde vier no mesmo aparelho.

**O que fica aberto no web.** O cliente usa `detectSessionInUrl: true` no web (`packages/data/src/client.ts`), e o `auth-js` grava a sessão do fragmento na inicialização, sem olhar a sessão atual. O mesmo link troca a conta de quem já está logado no navegador. Isso é anterior ao backlog.

**Opções para o humano:**

- **A. Manter o implícito no web, com a mitigação do nativo.** `detectSessionInUrl: false` e o fragmento passa pelo mesmo `setSessionFromLink`: não troca sessão ativa e exige o marcador do pedido no `localStorage`. Atenção: o marcador mora no armazenamento do navegador que pediu. Se o link abrir no navegador interno do app de e-mail (o caso que motivou o implícito), o marcador não está lá e o login falha, o mesmo custo do PKCE. Uma variante **A'** só aplica o item 1 (não trocar sessão ativa): mantém o navegador interno funcionando, mas um navegador sem sessão ainda aceita a conta do atacante.
- **B. PKCE (`flowType: 'pkce'`).** O link traz `?code=`, e só o navegador ou app que guardou o `code_verifier` troca o código pela sessão (`exchangeCodeForSession`). Fecha o caso na raiz, no web e no nativo, e dispensa o marcador. Custo: o link precisa abrir no mesmo navegador (ou app) que pediu, inclusive a confirmação de cadastro e a reautenticação da exclusão de conta. No Android, Custom Tabs costuma dividir o armazenamento com o Chrome; o navegador interno de apps de e-mail no iOS, em geral, não. Quem abrir em outro lugar vê erro e precisa pedir de novo nesse navegador.

**Recomendação do arquiteto.** B, porque A com marcador tem o mesmo custo de B e protege menos, e A' deixa o caso do navegador sem sessão aberto. Se o humano priorizar o navegador interno do e-mail, A' no web é o mínimo, com o risco residual registrado aqui. Qualquer escolha exige uma tela de erro clara ("abra o link no mesmo navegador em que você pediu" ou "peça outro link") e teste: um link com tokens válidos, sem pedido e com sessão ativa, não troca a sessão.
