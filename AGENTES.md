# Agentes

A sessão principal é o `orquestrador`, a única voz que fala com o humano sobre decisões. Os demais são subagentes definidos em [.claude/agents/](.claude/agents/). Detalhes em `docs/PROMPT_MESTRE.md`, seção 13.

| Agente                  | Responsabilidade                                                                                    | Pastas que possui                                                                                                                                | Recebe                        | Entrega                              | Depende de                              |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------ | --------------------------------------- |
| `orquestrador`          | Quebra o trabalho, mantém o QUADRO, delega, revisa, integra branches, garante o LOG                 | `docs/agentes/`                                                                                                                                  | Pedidos do humano, relatórios | Tarefas, integração, resumos de fase | todos                                   |
| `arquiteto`             | Monorepo, fronteiras, contratos, ADRs, aprova mudanças de contrato                                  | `packages/contracts`, `packages/config`, `docs/adr`, `docs/arquitetura.md`, configs da raiz                                                      | Pedidos de contrato           | Contratos, ADRs                      | —                                       |
| `banco-de-dados`        | Schema, migrations, RLS, funções SQL, seeds, testes de RLS, tipos gerados                           | `supabase/migrations`, `supabase/seed`, `supabase/tests`                                                                                         | Contratos                     | Migrations testadas, tipos           | `arquiteto`                             |
| `backend-funcoes`       | Edge Functions e jobs                                                                               | `supabase/functions`                                                                                                                             | Contratos, schema             | Funções testadas                     | `banco-de-dados`                        |
| `design-system`         | Tokens, tema, componentes, animações, mascote, `/design-system`                                     | `packages/ui`                                                                                                                                    | Contratos de UI               | Componentes                          | `arquiteto`                             |
| `auth-grupos`           | Login, perfil, grupos, convites, papéis, permissões no cliente, onboarding                          | `packages/features/auth`, `packages/features/groups`, `packages/core/src/permissions`                                                            | Schema, UI                    | Telas e fluxos                       | `banco-de-dados`, `design-system`       |
| `tarefas-calendario`    | Áreas, contextos, tarefas, estados, recorrência, Hoje, calendário, Equipe                           | `packages/features/contexts`, `packages/features/tasks`, `packages/features/calendar`, `packages/core/src/tasks`, `packages/core/src/recurrence` | Schema, permissões            | Telas e domínio                      | `auth-grupos`                           |
| `prova-foto`            | Câmera, desafio, marca d'água, upload, revisão do admin                                             | `packages/features/proof`, adapters de câmera e geolocalização                                                                                   | Tarefas                       | Fluxo de prova                       | `tarefas-calendario`, `backend-funcoes` |
| `notificacoes-whatsapp` | Preferências, canais, service worker, resumo diário, providers                                      | `packages/features/notifications`, `packages/core/src/notifications`, adapters de push                                                           | Tarefas                       | Canais e resumo                      | `tarefas-calendario`, `backend-funcoes` |
| `gamificacao`           | XP, níveis, ofensiva, conquistas, comemorações                                                      | `packages/features/gamification`, `packages/core/src/gamification`                                                                               | Eventos de tarefas            | Motor e telas                        | `tarefas-calendario`                    |
| `compras`               | Catálogo, listas, tempo real, modos "montar" e "no mercado"                                         | `packages/features/shopping`                                                                                                                     | Grupos, UI                    | Listas                               | `auth-grupos`                           |
| `qa-testes`             | Estratégia de testes, E2E, definição de pronto, acessibilidade básica. Não altera código de feature | `e2e/`, configs de teste                                                                                                                         | Entregas                      | Relatório, handoffs                  | entregas                                |
| `revisor-seguranca`     | Revisão de RLS, segredos, validação, LGPD e fronteiras. Somente leitura                             | —                                                                                                                                                | Entregas                      | Relatório                            | entregas                                |

Em `packages/data/src/<modulo>` e `packages/i18n/src/<idioma>/<modulo>.json`, cada agente de feature é dono da subpasta ou arquivo do seu módulo.

## Protocolo de comunicação

Subagentes não conversam entre si: cada um recebe uma tarefa e devolve um relatório. A conversa acontece por arquivos versionados, nesta ordem de autoridade:

1. **Contratos** em `packages/contracts`. Tipos e schemas Zod são a fonte da verdade. Mudança exige aprovação do `arquiteto` e handoff para os afetados.
2. **Handoffs** em `docs/agentes/handoffs/`, nome `AAAAMMDD-HHmm-<de>-para-<para>-<assunto>.md`, com: De/Para/Data, Contexto, O que foi entregue, Contratos criados ou alterados, O que o destinatário precisa fazer, Bloqueios e dúvidas, Como testar.
3. **Quadro** em `docs/agentes/QUADRO.md`, com o estado de todas as tarefas.

Regras:

- Cada agente só edita arquivos do seu escopo. Precisou de algo fora dele: handoff para o dono ou pedido ao orquestrador.
- Ao começar, leia sua definição, os handoffs endereçados a você, as últimas entradas do LOG e os contratos relevantes.
- Relatório final ao orquestrador: **Feito / Arquivos alterados / Contratos / Testes rodados e resultado / Pendências / Handoffs criados / Riscos.**
- Dúvida de produto vai do orquestrador ao humano. Dúvida técnica vai por handoff; em impasse, o `arquiteto` decide e registra um ADR.
- Tarefas independentes rodam em paralelo, cada agente na sua worktree e branch. O orquestrador integra na ordem do grafo.
- Cada agente escreve sua própria entrada no LOG, como `Claude de Rafaell Bezerra Saraiva`, indicando o agente no campo "Agente(s)".

## Grafo de dependências

```
arquiteto
   ├─> banco-de-dados ─┐
   └─> design-system ──┴─> auth-grupos ─> tarefas-calendario ─┬─> prova-foto
                                  │                             ├─> notificacoes-whatsapp
                                  │                             └─> gamificacao
                                  └─> compras
backend-funcoes acompanha cada feature que precisa de servidor.
qa-testes e revisor-seguranca atuam ao fim de cada entrega.
```
