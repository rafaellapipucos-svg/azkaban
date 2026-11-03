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

**Navegação:** enquanto as tarefas não chegam, as áreas vivem como chips na tela Início, porque a lista vem do banco e as abas do Expo Router são estáticas. A Fase 2 revê isso junto com a tela "Hoje".

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
