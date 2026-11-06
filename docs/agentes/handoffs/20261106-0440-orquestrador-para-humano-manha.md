# Handoff: orquestrador para o humano, manhã de 2026-11-06

**De:** orquestrador (sessão da madrugada, autonomia dada às 03:20)
**Para:** Rafaell e a próxima sessão do orquestrador
**Data:** 2026-11-06 04:40 (BRT)
**Branch:** `main` (`c3e4596` e seguintes)

## Estado

O app está no ar em `https://app.tabolao.com`, com login por e-mail funcionando.

- **BL-24 (hospedagem) e BL-26 (SMTP):** feitos.
  - Site `app.tabolao.com` na Hostinger.
  - Deploy por FTP a cada push na `main` com CI verde.
  - E-mail pelo Brevo (`nao-responda@tabolao.com`), com domínio autenticado.
  - Auth de produção conferido no painel.
- **Teste de ponta a ponta no Chrome**, com a conta do humano, de todas as telas e botões. Os dados de teste foram removidos pelo próprio app.
- **Correções da noite, todas na `main`:**
  - **PR #14:** migration `20261106110000_seed_reference_areas.sql`. As áreas só vinham do seed, e em produção ninguém conseguia criar contexto nem tarefa. As 2 linhas já foram inseridas à mão no hospedado.
  - **PR #15:** "Novo contexto" avisa por que não salva, e "Gerenciar contextos" abre na área de origem.
  - **PR #16:** "Criar lista" com nome vazio mostra aviso.
  - **PR #17:** a comemoração não emenda frases ("Conquista: X! Tarefa concluída!").
  - **PR #18:** a E2E intermitente `proof-capture.spec.ts:502`. A segunda leitura da foto vem do cache do `Image` do react-native-web; o teste foi ajustado.
- **Git:** usa sempre a conta `rafaellapipucos-svg`, via `gh auth git-credential`, na config local do repositório. Sem prompt de conta.

## Para o humano

1. **Apagar os 2 arquivos de segredo** e esvaziar a lixeira:
   - `C:\Users\rafae\azkaban-vault.sql`;
   - `C:\Users\rafae\vapid-azkaban-prod.env`.
2. **Chrome:** há um download pendente (`azkaban-dados-2026-11-06.json`, a exportação de dados testada). Pode descartar.
3. **Testes que dependem de você:**
   - prova por foto: aceite do aviso e câmera;
   - push: permissão do navegador e Android;
   - WhatsApp: seu número.

   É o BL-36.

4. **Sua conta no app:** ficaram 10 XP de uma compra de teste e a conquista "Primeira tarefa".

## Para a próxima sessão

- **`supabase db push` no hospedado**, para registrar a migration `20261106110000`. As linhas já existem, e ela é `on conflict do nothing`.
  - O `supabase link` desta madrugada foi barrado pelo classificador. Rode com o humano presente.
- **E-mails do Auth em português:** a sessão "E-mails do Auth em português no Supabase" (worktree `hopeful-noether-29777b`) estava trabalhando nisso. Confira o PR dela e se os modelos foram colados no painel.
- **Brevo:** o link do e-mail passa pelo rastreador de cliques (`*.sendibt3.com`). Não há opção no painel. As saídas são pedir ao suporte do Brevo ou usar código (OTP) no modelo.
- **BL-25:** destravado. Lighthouse nas boas-vindas e a rodada de avisos da CSP Report-Only com o app inteiro.
- **E2E local:** o `.env.development.local` da checkout principal não tem `EXPO_PUBLIC_APP_NAME` nem `EXPO_PUBLIC_APP_SCHEME`, e o app quebra na pilha A sem eles. Quem copiar o arquivo para um worktree precisa acrescentar os dois.
- **`docs/PROMPT_MESTRE.md`, linha 164:** ainda diz que `supabase/seed/` guarda áreas, catálogo e conquistas. Hoje tudo vem de migration.
- **Formulários de item e de catálogo das compras:** ainda desligam o botão sem aviso. Decidir se seguem o padrão do PR #16.
