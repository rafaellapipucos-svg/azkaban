# Log de Alterações

## ⚠️ Instruções para qualquer IA que trabalhar neste repositório

(Claude, GPT/Codex, Gemini, Copilot, Cursor ou qualquer outra — leia antes de alterar qualquer coisa)

1. Antes de começar, leia: este cabeçalho, as últimas 10 entradas deste log, o `AGENTES.md`, o `CLAUDE.md`/`AGENTS.md`, `docs/arquitetura.md` e os ADRs em `docs/adr/`.
2. Ao terminar cada bloco de trabalho (antes de cada commit/PR), adicione UMA entrada NO FINAL deste arquivo.
3. Identifique-se no título da entrada exatamente neste formato:
   `### [Nome da IA] de [Nome da pessoa] — AAAA-MM-DD HH:mm (BRT)`
   Exemplos:
   `### Claude de Rafaell — 2026-11-01 14:32 (BRT)`
   `### GPT de Davi — 2026-11-02 09:10 (BRT)`
4. Como obter os dados (nunca invente):
   - Nome da pessoa: pergunte a ela ou use `git config user.name`.
   - Data e hora: rode `TZ=America/Sao_Paulo date "+%Y-%m-%d %H:%M"`. No Git Bash do Windows esse comando devolve UTC; lá, use o PowerShell: `(Get-Date).ToString('yyyy-MM-dd HH:mm')` se o fuso da máquina for o de Brasília.
   - Nome da IA: o nome do seu modelo/ferramenta (Claude, GPT, Gemini...).
5. Nunca edite nem apague entradas antigas. Correções viram uma nova entrada.
6. Em conflito de merge neste arquivo, mantenha as duas entradas, em ordem de data.
7. Seja específico: o que mudou, por quê, onde, como testar e o que ficou pendente.
8. Respeite a arquitetura e os ADRs. Se discordar, crie um ADR propondo a mudança — não mude silenciosamente.

### Modelo de entrada

```markdown
### [IA] de [Pessoa] — AAAA-MM-DD HH:mm (BRT)

- **Branch:**
- **Agente(s):** (se aplicável)
- **Resumo:** 1–2 frases
- **Alterações:**
  - ...
- **Arquivos/módulos principais:**
- **Migrations:** (nome ou "nenhuma")
- **Decisões/ADRs:**
- **Como testar:**
- **Pendências / próximos passos:**
```

---

## Entradas

### Claude de Rafaell Bezerra Saraiva — 2026-11-01 08:29 (BRT)

- **Branch:** chore/phase-0-foundation
- **Agente(s):** orquestrador
- **Resumo:** Fase 0 entregue: documentação base, monorepo, app Expo rodando na web com tokens e i18n, fronteiras verificadas, CI e Supabase local.
- **Alterações:**
  - Documentação: `CLAUDE.md`, `AGENTS.md`, `AGENTES.md`, 12 subagentes em `.claude/agents/`, `docs/arquitetura.md`, ADRs 0001 a 0003, `docs/agentes/QUADRO.md` com o backlog das Fases 0 a 8, e cópia da especificação em `docs/PROMPT_MESTRE.md`.
  - Monorepo pnpm + Turborepo, com pacotes base e nove features. Expo SDK 58, React Native 0.88, TypeScript 6.
  - `packages/config` com env validado por Zod, que recusa chave secreta em variável pública.
  - `packages/ui` com tokens próprios e `StatusBadge`; `packages/i18n` com pt-BR por módulo; tela inicial em `packages/features/auth`.
  - dependency-cruiser, ESLint, Prettier, Husky, lint-staged, commitlint e GitHub Actions.
- **Arquivos/módulos principais:** `apps/app`, `packages/*`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `supabase/config.toml`
- **Migrations:** nenhuma
- **Decisões/ADRs:** ADR-0001, ADR-0002 e ADR-0003, todos aguardando validação. `darkMode: 'class'` no NativeWind, porque `media` dispara erro na web; `useSystemColorScheme` acompanha o sistema. Playwright fica para a primeira entrega com fluxo real, F8-2 ou antes.
- **Como testar:** `pnpm install`, copiar os dois `.env.example` para `.env.local`, `pnpm check` e `pnpm dev`. O app abre em http://localhost:8081.
- **Verificado:** `pnpm check` e `pnpm build:web` passam. Tela conferida em 375px, nos temas claro e escuro, com console limpo. Importações proibidas plantadas de propósito foram barradas por `pnpm boundaries`. `supabase db reset` funcionou no banco local. O projeto hospedado respondeu, sem migrations aplicadas.
- **Não verificado:** o CI nunca rodou, porque nada foi enviado ao GitHub. O app não foi testado em iOS nem Android.
- **Pendências / próximos passos:** respostas do humano às perguntas da seção 15 e aprovação para a Fase 1. O nome do app é provisório.
