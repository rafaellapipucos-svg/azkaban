# PROMPT MESTRE — App de Organização Pessoal e Interpessoal

> **Responsável humano desta sessão:** [SEU NOME] (use este nome nas entradas do log: "Claude de [SEU NOME]")
> **Fuso padrão do projeto:** America/Sao_Paulo

---

## 1. Seu papel e como trabalhar

Você é o **tech lead e orquestrador** deste projeto. Vai planejar, dividir o trabalho entre subagentes, escrever código, revisar e manter a documentação viva.

Regras de trabalho:

1. Trabalhe **em fases** (seção 14). Nunca pule a Fase 0.
2. Antes de escrever qualquer funcionalidade, crie a documentação base: `LOG_DE_ALTERACOES.md`, `AGENTES.md`, `CLAUDE.md`, `AGENTS.md`, `.claude/agents/*`, ADRs e quadro de tarefas (seções 12 e 13).
3. Quando algo não estiver coberto aqui, escolha a opção **mais flexível e mais fácil de reverter**, registre num ADR e siga em frente.
4. **Pare e pergunte** apenas para decisões caras de reverter: troca de stack, provedor de WhatsApp, modelo de permissões, qualquer coisa que gere custo.
5. Ao fim de cada fase: resuma o que foi feito, diga como testar, atualize LOG e QUADRO, e **aguarde validação** antes da próxima fase.
6. Código, nomes de variáveis, tabelas e commits em **inglês**. Interface em **português (pt-BR)** via i18n. Documentação em português.

---

## 2. Visão do produto

Um app (web primeiro, depois iOS e Android com o mesmo código) para **uma pessoa organizar a própria vida, a da família e a dos seus funcionários**, para que tudo flua.

- Cada pessoa tem login próprio e cadastra suas pendências.
- As pendências ficam separadas em abas: **Trabalho** (subdividido por local de trabalho) e **Doméstico**.
- A pessoa é notificada na hora de fazer cada tarefa e recebe **todo dia às 8h um resumo no WhatsApp** com as pendências do dia e os prazos mais longos que estão chegando.
- **Administradores** criam pendências para os membros do seu grupo e acompanham o cumprimento.
- Algumas tarefas só podem ser concluídas com uma **foto tirada no próprio app**.
- Tudo é **gamificado e bonito**, com estética inspirada na sensação de apps de idiomas gamificados (estilo Duolingo): cores vivas, mascote, XP, ofensiva, comemorações.
- Há **lista de compras** com itens pré-selecionados e quantidades.

### Personas

- **Gestor/Admin** — organiza a casa e/ou a empresa, cria tarefas para outras pessoas, acompanha quem fez o quê.
- **Familiar** — membro do grupo família; tarefas domésticas; usa a lista de compras compartilhada.
- **Funcionário(a)** — ex.: funcionária doméstica ou de empresa; pode trabalhar em **mais de um lugar**; recebe tarefas e comprova com foto. Pode ter pouca familiaridade com tecnologia → a interface precisa ser muito simples.
- **Usuário solo** — usa só para organizar a própria vida.

---

## 3. Glossário (termo em português → nome no código)

| Termo | Código | Significado |
|---|---|---|
| Usuário / Perfil | `User` / `Profile` | Pessoa com login |
| Grupo | `Group` | Família, empresa, casa. Uma pessoa pode estar em vários |
| Membro | `Membership` | Vínculo usuário↔grupo, com papel |
| Papel | `Role` | `owner`, `admin`, `member` |
| Área | `Area` | Aba de primeiro nível: `work` (Trabalho) e `home` (Doméstico). Vem do banco/config — no futuro pode surgir `study`, `health` etc. |
| Contexto | `Context` | Subdivisão de uma área. Ex.: Trabalho → "Escritório Centro", "Clínica"; Doméstico → "Casa", "Apê da praia" |
| Tarefa / Pendência | `Task` | A definição (título, regras, recorrência) |
| Ocorrência | `TaskOccurrence` | Instância concreta numa data. **É a ocorrência que tem estado.** Tarefa não recorrente = 1 ocorrência |
| Estado | `Status` | `pending`, `done` (verde), `partial` (amarelo), `missed` (vermelho), `cancelled` |
| Prova | `Proof` | Foto que comprova a conclusão |
| Lista de compras | `ShoppingList` | Lista com itens e quantidades |
| Item de catálogo | `CatalogItem` | Item pré-selecionado reutilizável |
| XP, Nível, Ofensiva, Conquista | `xp`, `level`, `streak`, `achievement` | Gamificação |

---

## 4. Stack recomendada

**Objetivo:** um único código para web agora e iOS/Android depois, sem reescrita.

| Camada | Escolha |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| App | **Expo (React Native) + Expo Router**, TypeScript `strict`, rodando na web via React Native Web desde o dia 1. Builds iOS/Android depois com EAS — mesmo código |
| Estilo | NativeWind (ou Tamagui), alimentado por design tokens em `packages/ui` |
| Animações | Reanimated + Moti; ilustrações animadas em Lottie |
| Estado de servidor | TanStack Query |
| Estado local | Zustand (o mínimo possível) |
| Formulários/validação | React Hook Form + Zod (schemas compartilhados em `packages/contracts`) |
| Datas | date-fns + date-fns-tz |
| Recorrência | biblioteca `rrule` (padrão RFC 5545) |
| i18n | i18next, pt-BR padrão, estrutura pronta para outros idiomas, arquivos divididos por módulo |
| Backend | **Supabase**: Postgres, Auth, Row Level Security, Storage (fotos), Realtime, Edge Functions, pg_cron |
| Notificações | In-app (Realtime) + Web Push (VAPID + service worker/PWA); futuramente Expo Notifications (APNs/FCM). Tudo atrás da interface `NotificationChannel` |
| WhatsApp | WhatsApp Business Platform (Cloud API oficial da Meta) por padrão, atrás da interface `WhatsAppProvider` |
| Testes | Vitest/Jest (unidade), testes de RLS no banco (pgTAP ou scripts com usuários de teste), Playwright (E2E web), Maestro (E2E mobile, futuro) |
| Qualidade | ESLint + Prettier + regras de fronteira de importação (eslint-plugin-boundaries ou dependency-cruiser), Husky + lint-staged, commitlint |
| CI | GitHub Actions: lint, typecheck, testes, checagem de migrations |
| Deploy web | Export estático do Expo Web em Vercel ou Netlify (decidir em ADR) |

- Use as **versões estáveis mais recentes** e consulte a documentação atual de cada biblioteca antes de configurar — APIs mudam.
- Se discordar de alguma escolha, proponha alternativa com prós e contras **na Fase 0**. Não troque nada silenciosamente.

---

## 5. Princípios de arquitetura (inegociáveis)

### 5.1 Compartimentalização máxima (para facilitar branches paralelas)

- Organização **por funcionalidade** (feature modules), não por tipo de arquivo.
- Cada módulo expõe sua API pública **somente pelo `index.ts`**. Outros módulos não importam caminhos internos. Isso é **verificado por lint**.
- Módulos de feature **não importam uns aos outros diretamente**. Comunicação via `packages/core` (domínio), `packages/contracts` (tipos) ou eventos.
- **Lógica de negócio** fica em `packages/core`: TypeScript puro, sem React, sem Supabase. Testável e reaproveitável no app mobile e nas Edge Functions.
- **Acesso a dados** só via repositórios em `packages/data`. Nenhum componente chama o Supabase diretamente.
- **Recursos de plataforma** (câmera, push, geolocalização, armazenamento seguro, vibração, compartilhar) ficam atrás de adapters em `packages/platform`, com implementações `.web.ts` e `.native.ts`.
- Arquivos de rota são **finos**: só montam a tela do módulo.
- **Uma migration por mudança de banco**, com prefixo de timestamp. Nunca editar migration já mergeada.
- **Feature flags** (`packages/config/features.ts`, com espelho opcional no banco) para mergear trabalho incompleto sem quebrar a `main`.
- Nada de "arquivos-deus" que todo mundo edita (ex.: um `constants.ts` gigante) — eles geram conflito em toda branch. Cada módulo tem seu próprio config e seus próprios arquivos de tradução.

### 5.2 Mínimo de hardcode

Regra prática: **se um valor pode mudar por usuário, por grupo, por ambiente ou no futuro, ele vai para config ou banco.**

Especificamente, NÃO hardcode:

- Horário do resumo diário (padrão `08:00`, configurável por usuário) e fuso (padrão `America/Sao_Paulo`, por usuário).
- Janela de "prazos próximos" no resumo (padrão 7 dias).
- Antecedência dos lembretes; tolerância antes de marcar vermelho automaticamente.
- Regras de XP, curva de níveis, regras de ofensiva, conquistas → arquivo de regras + tabelas.
- Áreas (Trabalho/Doméstico), contextos, itens pré-selecionados de compras, categorias, unidades → banco + seeds.
- Cores, fontes, raios, espaçamentos, sombras, durações de animação → design tokens.
- Todos os textos da interface → i18n.
- Nome do app, URLs, chaves, IDs de templates do WhatsApp → config/variáveis de ambiente validadas com Zod. `.env.example` sempre atualizado. **Nunca commitar segredos.**
- Papéis e permissões → **matriz de permissões em um único lugar** (banco + espelho em `packages/core/permissions`). Nunca `if (user.role === 'admin')` espalhado pelo código; sempre `can(user, 'task.create_for_others', group)`.

### 5.3 Pronto para mobile desde já

- Componentes usam apenas primitivos do React Native (`View`, `Text`, `Pressable`...). Nada de `<div>` ou CSS de web fora de arquivos `.web.tsx` dentro de adapters.
- **Mobile-first**: layout responsivo, alvos de toque ≥ 44px, nada que dependa de hover, respeito às safe areas.
- Nenhuma API exclusiva de navegador fora de `packages/platform`.
- Navegação com Expo Router e **deep links** (scheme configurável). Ex.: tocar numa notificação abre a tarefa; tarefa com foto abre direto a câmera.
- Tolerância a internet ruim: atualizações otimistas, cache, fila simples de ações offline (marcar tarefa sem sinal sincroniza depois — **exceto** prova por foto, que exige validação do servidor).
- Imagens comprimidas antes do upload.
- PWA instalável na web (manifest + service worker).

---

## 6. Estrutura de pastas (proposta — ajuste e documente em ADR)

```
/
├── apps/
│   └── app/                    # Expo + Expo Router (web agora, iOS/Android depois)
│       └── app/                # rotas finas
├── packages/
│   ├── core/                   # domínio puro: estados, recorrência, XP, permissões, resumo diário
│   ├── contracts/              # tipos + schemas Zod (fonte da verdade entre agentes)
│   ├── data/                   # repositórios por módulo (data/tasks, data/shopping...), tipos gerados do BD
│   ├── platform/               # adapters: camera, push, geo, storage, haptics, share (.web/.native)
│   ├── ui/                     # design system: tokens, tema, componentes, animações, mascote
│   ├── i18n/                   # traduções divididas por módulo (pt-BR/tasks.json, pt-BR/shopping.json...)
│   ├── config/                 # configs, feature flags, env validado
│   └── features/
│       ├── auth/
│       ├── groups/             # grupos, membros, convites, papéis
│       ├── contexts/           # áreas e contextos (abas e sub-abas)
│       ├── tasks/
│       ├── calendar/
│       ├── proof/              # prova por foto
│       ├── notifications/
│       ├── gamification/
│       └── shopping/
├── supabase/
│   ├── migrations/
│   ├── functions/              # edge functions: dispatch-notifications, daily-summary, proof-validate, whatsapp-webhook, auto-miss...
│   ├── seed/                   # áreas, catálogo de compras, conquistas
│   └── tests/                  # testes de RLS
├── e2e/                        # Playwright
├── docs/
│   ├── arquitetura.md
│   ├── adr/
│   └── agentes/
│       ├── QUADRO.md
│       └── handoffs/
├── .claude/agents/             # definições dos subagentes do Claude Code
├── CLAUDE.md
├── AGENTS.md
├── AGENTES.md
└── LOG_DE_ALTERACOES.md
```

---

## 7. Requisitos funcionais

### 7.1 Contas, grupos e permissões

**Login e perfil**
- Cadastro/login por e-mail + senha e link mágico. Login por telefone (OTP) habilitável por config — importante para funcionários.
- Perfil: nome, avatar, telefone em formato E.164 **verificado**, fuso, idioma, horário do resumo diário, preferências de notificação por canal, **opt-in explícito do WhatsApp** (guardar data/hora do consentimento e do opt-out).

**Grupos**
- Criar grupo (tipo configurável: família, empresa, outro).
- Convidar por link, código, QR code ou telefone; aceitar/recusar; sair; remover membro; transferir posse.
- Uma pessoa pode estar em vários grupos (ex.: funcionária que trabalha em duas casas).

**Papéis (por grupo)**
- `owner`: tudo, incluindo transferir posse e excluir o grupo.
- `admin`: criar/editar tarefas para membros, **ver tarefas e provas dos membros dentro do grupo**, gerenciar contextos e catálogo de compras.
- `member`: gerencia as próprias tarefas e as atribuídas a ele.

**Escopo de visibilidade (crítico)**
- O admin vê **apenas** tarefas vinculadas aos contextos do seu grupo.
- Tarefas pessoais de um membro (sem grupo ou marcadas como privadas) **nunca** aparecem para admins.
- Exemplo obrigatório: o admin da Casa A não vê nada do trabalho da funcionária na Casa B.
- Toda regra de acesso é implementada com **RLS no Postgres** (a segurança real) e espelhada na UI via `packages/core/permissions` (apenas para esconder botões). Nunca confiar só na UI.
- Se o membro pode editar/excluir tarefas atribuídas por um admin → configurável na matriz (padrão: não pode excluir; pode mudar o estado e comentar).

**Visão "Equipe" (admins)**
- Lista de membros, pendências de cada um por dia, taxa de conclusão (verde/amarelo/vermelho), provas recebidas aguardando revisão.

### 7.2 Abas: Trabalho e Doméstico

- Navegação principal com abas por **Área**: "Trabalho" e "Doméstico". A lista de áreas, ícones, cores e ordem vem do banco/config.
- Sugestão (validar com o humano): tela inicial **"Hoje"** consolidando todas as áreas, com o anel de meta diária.
- **Dentro de Trabalho: sub-abas por Contexto** — uma para cada lugar onde a pessoa trabalha, mais "Todos".
  - Contextos de trabalho podem vir de um grupo (o empregador cria e quem entra no grupo passa a ver) ou ser pessoais (ex.: freelance).
- Doméstico usa a mesma mecânica de contextos, mesmo que a maioria das pessoas tenha só um.
- Contexto tem: nome, área, cor, ícone/emoji, grupo dono (opcional), endereço/geolocalização + raio (opcional, usado na prova por foto), arquivado.
- Ao criar uma tarefa, o contexto escolhido define a área e quem pode vê-la.

### 7.3 Tarefas

**Campos**
- Título, notas.
- Área + contexto.
- Responsável (padrão: eu; admin pode atribuir a membros). Começar com 1 responsável por tarefa; admin pode criar em lote para vários membros (gera uma tarefa para cada).
- Criada por.
- **Tipo de agendamento:**
  - (a) horário marcado — data + hora, duração opcional;
  - (b) dia inteiro;
  - (c) **prazo** — início opcional + data limite (ex.: "entregar relatório até sexta"). Estas aparecem no resumo diário como "prazos próximos".
- Recorrência (7.5).
- Lembretes: lista de antecedências (padrão vem de config).
- Exige prova por foto (sim/não).
- Exige aprovação do admin para a prova (sim/não).
- Exige justificativa ao marcar amarelo (padrão: sim).
- Dificuldade/peso (afeta XP), prioridade.
- Visibilidade: grupo ou privada.
- Checklist de subitens (opcional).

**Ações:** criar (incluindo criação rápida só com título + horário), editar, duplicar, reagendar, excluir, comentar (pode ficar para fase posterior).

**Histórico/auditoria:** toda mudança de estado registra quem, quando, de qual estado para qual e o motivo.

### 7.4 Estados da tarefa

| Estado | Cor | Significado | Regras |
|---|---|---|---|
| `pending` | cinza/neutro | Ainda não resolvida | Estado inicial |
| `done` | **VERDE** | Concluída com sucesso | Se a tarefa exige foto, **só** fica verde com prova válida (garantido pelo servidor) |
| `partial` | **AMARELO** | "Tentei e não consegui" | Pede justificativa curta (configurável). Dá XP parcial — recompensar a honestidade é mais saudável que punir |
| `missed` | **VERMELHO** | Não realizada | Marcada manualmente ou **automaticamente** por job quando passar o prazo + tolerância (configurável) |
| `cancelled` | — | Cancelada pelo criador/admin | Não conta para estatísticas nem para a ofensiva |

- Transições definidas numa **máquina de estados em `packages/core`**: quais transições são permitidas, quem pode fazê-las e o que cada uma exige. Com testes.
- Decidir e registrar em ADR: uma tarefa vermelha automática pode virar verde depois ("concluí atrasado")? Sugestão: sim, dentro de uma janela configurável, com flag `late` e XP reduzido.
- **A cor nunca é o único indicador**: cada estado tem ícone e rótulo (✓, ~, ✗) — acessibilidade e daltonismo.
- As cores vêm dos design tokens.

### 7.5 Tarefas recorrentes

- Exemplos: "Academia todo dia às 9h", "Seg/Qua/Sex às 9h", "todo dia 5 do mês", "a cada 2 semanas".
- Armazenar a regra como **RRULE (RFC 5545)** + fuso da tarefa. A interface é amigável (diário, dias da semana, mensal, a cada N, termina em data / após N vezes / nunca) e gera a RRULE — o usuário nunca vê RRULE.
- Ocorrências **materializadas numa janela móvel** (ex.: próximos 60 dias, configurável) por job diário, mais geração sob demanda quando o usuário navega no calendário além da janela.
- Editar com as opções "só esta", "esta e as próximas", "todas" (como no Google Agenda). Suporte a exceções (EXDATE).
- Cada ocorrência tem estado independente.
- Fuso: timestamps em UTC no banco; "9h" calculado no fuso da tarefa/usuário.

### 7.6 Prova por foto (anti-adulteração)

Objetivo: algumas tarefas só ficam verdes com uma foto tirada **na hora, dentro do app**.

Implemente em camadas:

1. **Só câmera do app.** Web: componente próprio com `getUserMedia`. Mobile: `expo-camera`. **Proibido** seletor de arquivos ou galeria neste fluxo (nada de `<input type="file">` nem image picker).
2. **Desafio do servidor.** Ao abrir a câmera, o app pede um `proof_challenge`: nonce de uso único, vinculado a usuário + ocorrência, que expira em N minutos (configurável). O upload precisa apresentar o nonce; o servidor rejeita nonce expirado ou reutilizado.
3. **Carimbo visível.** No momento da captura, a foto recebe marca d'água com data/hora, nome da tarefa e nome do usuário.
4. **Horário oficial = horário do servidor** no recebimento. Guardar também o horário do dispositivo e a diferença entre eles.
5. **Integridade.** Hash SHA-256 calculado no cliente e conferido no servidor. Arquivo em bucket privado, **imutável para o usuário** (sem sobrescrever nem excluir — regra no storage). Acesso só por URL assinada de curta duração.
6. **Geolocalização opcional** por tarefa/contexto, com consentimento. Se o contexto tiver endereço + raio, sinalizar quando a foto for tirada fora do raio (padrão: sinalizar, não bloquear — configurável).
7. **Metadados:** dispositivo/user agent, versão do app.
8. **Validação no servidor.** Edge Function `proof-validate` confere tudo e, se estiver ok, muda a ocorrência para verde de forma atômica. O cliente **nunca** consegue marcar verde diretamente uma tarefa com prova obrigatória (garantido por RLS/trigger).
9. **Revisão do admin.** O admin vê a foto e pode aprovar ou contestar (contestar → amarelo ou vermelho, com motivo). Se a tarefa exige aprovação, a ocorrência fica num sub-estado "em análise" (visual verde-claro) até o admin aprovar.
10. **Limitação honesta:** na web não dá para garantir 100% (existem câmeras virtuais). Documente num ADR. No app nativo, avaliar Play Integrity (Android) e App Attest (iOS) numa fase futura.
11. **Retenção:** política de retenção das fotos configurável (ex.: 90 dias), por causa da LGPD.

### 7.7 Lembretes e notificações

- Na hora da tarefa (e nas antecedências configuradas), notificar o responsável.
- **Canais:**
  - in-app (sino + aviso em tempo real);
  - Web Push (PWA). No iPhone só funciona com o site adicionado à tela de início — explicar isso numa tela do onboarding;
  - push nativo (futuro);
  - WhatsApp (opcional por usuário/tarefa).
- **Arquitetura:**
  - Tabela `notification_outbox` (padrão outbox).
  - pg_cron a cada minuto chama a Edge Function `dispatch-notifications`, que envia o que está pendente.
  - **Idempotência**: chave única por ocorrência + tipo + canal — nunca enviar duplicado.
  - Retentativas com backoff e registro de entrega/erro.
  - Interface `NotificationChannel { send(...) }` com uma implementação por canal. Adicionar canal novo não muda o resto.
- **Preferências do usuário:** canais ativos, horário de silêncio, antecedência padrão.
- **Ações na notificação** (quando a plataforma permitir): "Concluir", "Adiar 10 min". Tarefas com foto abrem direto a câmera via deep link.
- **Avisos para o admin** (configurável): quando um membro marca verde/amarelo/vermelho uma tarefa que o admin criou.
- **Job de vermelho automático:** marca `missed` as ocorrências cujo prazo + tolerância passou.

### 7.8 Resumo diário no WhatsApp (8h)

Todo dia, no horário configurado pelo usuário (padrão 08:00, no fuso dele), enviar mensagem com:

- Pendências de **hoje**, com horários, agrupadas por área/contexto.
- Pendências **atrasadas** (configurável).
- **Prazos longos** que vencem nos próximos N dias (padrão 7). Ex.: "Relatório — vence sexta (em 4 dias)".
- Ofensiva atual / meta do dia (toque gamificado).
- Link (deep link) para abrir o app na tela "Hoje".
- Se não houver nada: mensagem curta motivacional, ou não enviar (configurável).

**Implementação**
- Job a cada 1–5 minutos seleciona usuários cujo horário local de resumo chegou e que ainda não receberam hoje (idempotência por usuário + data local).
- A montagem do texto é uma **função pura em `packages/core`**, com testes.
- Envio via interface `WhatsAppProvider`, com:
  - `MetaCloudProvider` (produção);
  - `ConsoleProvider` (desenvolvimento: só loga no terminal). **O app deve funcionar localmente sem credenciais reais.**
- Regras da plataforma do WhatsApp:
  - Mensagens iniciadas pela empresa fora da janela de 24h exigem **templates aprovados pela Meta** (categoria utilidade). Projete a mensagem como template com variáveis.
  - Respeite as restrições de parâmetros de template (tamanho, caracteres não permitidos como quebras de linha dentro de variáveis etc.). **Confira a documentação atual da Meta antes de implementar.** Se a lista for longa, resuma e mande o link.
  - **Opt-in explícito** obrigatório (política do WhatsApp + LGPD). Opção de parar: responder "PARAR" → webhook desativa o envio.
  - Webhook de status (enviado, entregue, lido, falhou) registrado no banco.
  - Custo por mensagem: deixar explicado num ADR.

### 7.9 Calendário pessoal

- Visões: **mês** (cada dia com bolinhas coloridas por estado e contador), **semana** e **dia** (agenda por horário + bloco de "prazos").
- Tocar num dia abre as pendências daquele dia; criar tarefa a partir de um dia/horário.
- Filtros: área, contexto, estado.
- Admin: alternar entre "meu calendário", "calendário de [membro]" e "time inteiro".
- Destaque de **"dia perfeito"** (tudo verde) — conecta com a gamificação.
- Desejável (não obrigatório no MVP): arrastar para reagendar no desktop.
- Futuro: exportar .ics / integrar com Google e Apple Calendar — deixe a modelagem compatível.

### 7.10 Lista de compras

- Listas por grupo (compartilhadas) ou pessoais. Várias ao mesmo tempo (ex.: "Mercado", "Farmácia").
- **Catálogo de itens pré-selecionados** por grupo: nome, categoria (hortifrúti, padaria, açougue, laticínios, limpeza, higiene...), unidade padrão (un, kg, g, L, pacote, caixa), emoji/ícone, ordem.
  - Seed inicial com itens comuns no Brasil (arroz, feijão, café, leite, ovos, pão, açúcar, óleo, papel higiênico, detergente...) vindo de **arquivo de seed**, editável pelo admin. Nada hardcoded em componentes.
- **Modo "montar lista":** itens do catálogo por categoria, com **stepper −/+ para a quantidade** (toque rápido), unidade editável e busca.
- **Adicionar item avulso** fora do catálogo, com opção "salvar no catálogo".
- **Modo "no mercado":** lista enxuta agrupada por categoria; marcar como comprado (risca e desce); desfazer.
- **Tempo real** (Supabase Realtime) entre os membros; mostrar quem adicionou cada item.
- Finalizar compra → arquiva a lista no histórico; opção "nova lista a partir desta".
- Compartilhar a lista como texto (ex.: mandar no WhatsApp) via adapter de compartilhamento.
- Opcional: vincular a lista a uma tarefa ("Fazer compras", que pode exigir foto).
- Gamificação leve: concluir a compra dá XP.

### 7.11 Gamificação

- **XP** por ocorrência resolvida; valores por estado e dificuldade em config (ex.: verde 10 × peso, verde atrasado 5 ×, amarelo 3 ×, vermelho 0). Bônus por prova por foto e por "dia perfeito".
- **Níveis** com curva de XP configurável.
- **Ofensiva (streak):** dias seguidos cumprindo a meta diária (ex.: ≥ X% das ocorrências do dia resolvidas — regra configurável). "Proteção de ofensiva" obtida com XP ou conquistas. Dias sem tarefas não quebram a ofensiva (configurável).
- **Meta diária** com anel de progresso na tela "Hoje".
- **Conquistas/medalhas** definidas em seed/banco: primeira tarefa, 7 e 30 dias de ofensiva, 100 provas por foto, semana perfeita etc.
- **Ranking/ligas semanais** dentro do grupo — **opcional e desativável por grupo**. Em grupos do tipo empresa, padrão desativado (ranking entre funcionários pode ser mal recebido).
- **Comemorações:** animação do mascote + confete ao concluir; tela de "dia perfeito"; som opcional; vibração no celular (adapter de haptics).
- Toda concessão de XP é um **evento** (`xp_events`) — auditável e recalculável. Totais são cache derivado, nunca a fonte da verdade.
- O motor de regras fica em `packages/core/gamification` (puro, testável); os valores, em config/banco.

### 7.12 Design e estética

- Visual alegre, limpo e confiante: **cores vivas e saturadas**, fundo claro, muito respiro, cantos bem arredondados (16–24px), **tipografia arredondada e encorpada** (ex.: Nunito ou outra gratuita do Google Fonts), ícones grossos.
- **Botões "3D"**: borda inferior mais escura que "afunda" ao pressionar; estados claros de foco, pressionado e desabilitado.
- Cards grandes, chips coloridos para contextos, barras e anéis de progresso, micro-animações (entrada de itens, check animado, "bounce"), transições suaves.
- **Mascote ORIGINAL**: crie o conceito de um personagem simples e expressivo, com estados (feliz, comemorando, preocupado, dormindo), em SVG/Lottie.
- ⚠️ **Não use** o mascote, logotipo, fontes proprietárias, paleta exata ou qualquer asset da Duolingo. A referência é de **sensação**, não de cópia. O app precisa ter identidade própria.
- Cores dedicadas nos tokens para cada estado (verde, amarelo, vermelho, cinza), sempre acompanhadas de ícone + texto.
- **Modo escuro** desde o início.
- **Acessibilidade:** contraste AA, fontes dinâmicas, rótulos para leitores de tela, não depender só de cor, respeitar "reduzir movimento".
- **Simplicidade** para quem tem pouca familiaridade com tecnologia: ações principais em 1–2 toques, ícone + texto, sem jargão.
- Criar uma página interna `/design-system` (só em desenvolvimento) mostrando tokens e componentes — facilita revisão e trabalho em paralelo.

**Telas principais (sugestão):** Onboarding (boas-vindas com mascote, login, telefone + opt-in do WhatsApp, instalar PWA, permitir notificações) · Hoje · Trabalho (com sub-abas) · Doméstico · Calendário · Compras · Perfil (XP, nível, ofensiva, conquistas, configurações) · Equipe (admins) · Detalhe da tarefa · Criar/editar tarefa · Câmera de prova · Grupos e convites · Preferências de notificação.

---

## 8. Modelo de dados inicial (ponto de partida — refine em ADR)

- `profiles` — id (= auth user), display_name, avatar_url, phone_e164, phone_verified_at, timezone, locale, daily_summary_time, daily_summary_enabled, whatsapp_opt_in_at, whatsapp_opt_out_at
- `groups` — id, name, type, owner_id, settings (jsonb)
- `group_members` — group_id, user_id, role, status, invited_by, joined_at
- `group_invites` — id, group_id, code, role, expires_at, max_uses, created_by
- `permissions` / `role_permissions` — matriz de permissões
- `areas` — id, key (`work`, `home`), i18n_key, icon, color_token, sort_order
- `contexts` — id, area_id, group_id (nulo se pessoal), owner_user_id, name, color, icon, location, radius_m, archived_at
- `tasks` — id, context_id, created_by, assignee_id, title, notes, schedule_type (`timed` | `all_day` | `deadline`), start_at, due_at, duration_min, timezone, rrule, exdates, reminders (jsonb), requires_photo_proof, requires_admin_approval, requires_partial_reason, difficulty, priority, visibility, archived_at
- `task_occurrences` — id, task_id, assignee_id, scheduled_start, scheduled_due, status, late, partial_reason, proof_review_status, status_changed_at, status_changed_by — único por (task_id, scheduled_start)
- `task_status_history` — occurrence_id, from_status, to_status, changed_by, changed_at, reason
- `proof_challenges` — id, occurrence_id, user_id, nonce, expires_at, used_at
- `task_proofs` — id, occurrence_id, user_id, storage_path, sha256, captured_at_device, received_at_server, lat, lng, accuracy, device_info, review_status, reviewed_by, reviewed_at, review_note
- `notification_preferences` — user_id, channel, enabled, quiet_start, quiet_end, default_lead_minutes
- `push_subscriptions` — user_id, platform, endpoint/token, keys
- `notification_outbox` — id, user_id, channel, type, payload, idempotency_key (único), scheduled_for, status, attempts, last_error, sent_at
- `whatsapp_messages` — id, user_id, template, provider_message_id, status, payload
- `xp_events` — id, user_id, group_id, occurrence_id, amount, reason, created_at
- `user_stats` — user_id, total_xp, level, current_streak, best_streak, streak_freezes, last_streak_date (cache recalculável)
- `achievements` / `user_achievements`
- `shopping_catalog_items` — id, group_id, owner_user_id, name, category, default_unit, emoji, sort_order, archived_at
- `shopping_lists` — id, group_id, owner_user_id, name, status (`open` | `archived`), linked_task_id, created_by, archived_at
- `shopping_list_items` — id, list_id, catalog_item_id (nulo se avulso), custom_name, quantity, unit, note, checked_at, checked_by, added_by

**RLS em TODAS as tabelas desde a primeira migration**, com funções auxiliares como `is_group_member(group_id)` e `has_permission(group_id, permission)`.

---

## 9. Segurança, privacidade e LGPD

- RLS em tudo. Chave de serviço (service role) só dentro de Edge Functions. Nenhum segredo no cliente.
- **Testes automatizados de RLS** cobrindo, no mínimo:
  - membro não vê tarefa privada de outro membro;
  - admin do Grupo A não vê nada do Grupo B;
  - membro não consegue marcar verde uma tarefa com foto obrigatória sem prova válida;
  - usuário não consegue apagar nem sobrescrever uma prova.
- Validação com Zod em toda entrada (cliente e Edge Functions).
- **LGPD:** consentimento explícito para WhatsApp, geolocalização e fotos; política de retenção; tela "exportar meus dados" e "excluir minha conta"; transparência para funcionários sobre o que o admin consegue ver. Minimize a coleta de dados.
- Rate limiting em endpoints sensíveis (OTP, desafios de prova, convites).
- Logs sem dados sensíveis.

---

## 10. Definição de "pronto"

Uma tarefa só está pronta quando:

- [ ] Typecheck e lint passam (incluindo as regras de fronteira entre módulos).
- [ ] Lógica de `core` tem testes de unidade; mudanças de banco têm testes de RLS; fluxos críticos têm E2E (login, criar tarefa, concluir com foto, resumo diário com provider mock).
- [ ] Nenhum texto hardcoded na UI (tudo i18n); nenhuma cor/medida solta (tudo tokens).
- [ ] Funciona em tela de celular (375px) e desktop, claro e escuro.
- [ ] `.env.example`, docs e ADRs atualizados quando aplicável.
- [ ] Entrada adicionada no `LOG_DE_ALTERACOES.md`.
- [ ] `docs/agentes/QUADRO.md` atualizado.

---

## 11. Git e branches

- `main` sempre estável e deployável.
- Branches curtas: `feat/<modulo>-<descricao>`, `fix/...`, `chore/...`, `docs/...`.
- **Conventional Commits** (ex.: `feat(tasks): add recurrence editor`).
- Um PR por pedaço coeso; PRs pequenos. Rebase na `main` e checks passando antes de abrir.
- Agentes trabalhando em paralelo usam **worktrees separadas** (um agente por branch).
- Migrations com timestamp; nunca reescrever migration mergeada.
- Arquivos compartilhados que tendem a conflitar (`LOG_DE_ALTERACOES.md`, `QUADRO.md`): em conflito, **manter as duas entradas**. Traduções divididas por módulo para evitar conflito.

---

## 12. Documentação obrigatória (criar na Fase 0)

### 12.1 `LOG_DE_ALTERACOES.md` (raiz)

Registro cronológico de **todas** as alterações feitas por qualquer IA ou humano. O começo do arquivo traz instruções para as outras IAs. Crie com este conteúdo (ajuste só o necessário):

```markdown
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
   - Data e hora: rode `TZ=America/Sao_Paulo date "+%Y-%m-%d %H:%M"`.
   - Nome da IA: o nome do seu modelo/ferramenta (Claude, GPT, Gemini...).
5. Nunca edite nem apague entradas antigas. Correções viram uma nova entrada.
6. Em conflito de merge neste arquivo, mantenha as duas entradas, em ordem de data.
7. Seja específico: o que mudou, por quê, onde, como testar e o que ficou pendente.
8. Respeite a arquitetura e os ADRs. Se discordar, crie um ADR propondo a mudança — não mude silenciosamente.

### Modelo de entrada

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

---

## Entradas
```

A primeira entrada é a sua, registrando a Fase 0.

### 12.2 `CLAUDE.md` e `AGENTS.md` (raiz)

- `CLAUDE.md` é lido automaticamente pelo Claude Code. `AGENTS.md` é a convenção lida automaticamente por outras ferramentas (ex.: Codex da OpenAI). Assim, **qualquer IA que abrir o repositório segue o mesmo protocolo**.
- Os dois devem ser curtos e conter: comandos do projeto (instalar, rodar, testar, gerar tipos, rodar migrations), regras de arquitetura resumidas (seção 5), a regra obrigatória do log e ponteiros para `AGENTES.md`, `LOG_DE_ALTERACOES.md` e `docs/`.
- Mesmo conteúdo de regras nos dois (um pode referenciar o outro).

### 12.3 `docs/adr/`

ADRs curtos (contexto, decisão, alternativas, consequências). Na Fase 0, no mínimo:
- ADR-0001 Stack
- ADR-0002 Monorepo e fronteiras entre módulos
- ADR-0003 Modelo de grupos, papéis e permissões

Depois: prova por foto e limitações, provedor de WhatsApp e custos, regra de "concluído atrasado", hospedagem.

### 12.4 `docs/agentes/QUADRO.md`

Quadro de tarefas com: ID, título, agente responsável, status (a fazer / em andamento / bloqueado / em revisão / feito), dependências, branch, link do handoff. Na Fase 0, preencha o **backlog completo** derivado deste documento.

---

## 13. Agentes do Claude Code

Divida o trabalho entre subagentes. Crie:

1. **`AGENTES.md` (raiz)** — descrição de cada agente: responsabilidade, pastas que possui, o que recebe, o que entrega, de quem depende, e o protocolo de comunicação (13.2).
2. **`.claude/agents/<nome>.md`** para cada agente, no formato de subagente do Claude Code: frontmatter com `name`, `description` clara de quando usar, `tools` mínimas necessárias (e `model`, se fizer sentido — modelos mais fortes para arquiteto e revisor). O corpo é o prompt do agente com: escopo de pastas que pode editar, regras de arquitetura relevantes, definição de pronto, obrigação de seguir o protocolo de handoff e de escrever no log.

### 13.1 Elenco

| Agente | Responsabilidade | Pastas que possui |
|---|---|---|
| `orquestrador` (a sessão principal) | Quebra o trabalho, mantém o QUADRO, delega, revisa entregas, integra branches, resolve conflitos, garante o LOG. **Única voz que fala com o humano sobre decisões** | `docs/agentes/` |
| `arquiteto` | Estrutura do monorepo, fronteiras, contratos, ADRs, aprova mudanças de contrato | `packages/contracts`, `packages/config`, `docs/adr`, `docs/arquitetura.md`, configs da raiz |
| `banco-de-dados` | Schema, migrations, RLS, funções SQL, seeds, testes de RLS, tipos gerados | `supabase/migrations`, `supabase/seed`, `supabase/tests` |
| `backend-funcoes` | Edge Functions e jobs (dispatch de notificações, resumo diário, validação de prova, webhook do WhatsApp, vermelho automático, materialização de recorrências) | `supabase/functions` |
| `design-system` | Tokens, tema claro/escuro, componentes base, animações, mascote, página `/design-system` | `packages/ui` |
| `auth-grupos` | Login, perfil, grupos, convites, papéis, permissões no cliente, onboarding | `features/auth`, `features/groups`, `core/permissions` |
| `tarefas-calendario` | Áreas/contextos (abas e sub-abas), tarefas, estados, recorrência, tela Hoje, calendário, visão Equipe | `features/contexts`, `features/tasks`, `features/calendar`, `core/tasks`, `core/recurrence` |
| `prova-foto` | Câmera, desafio, marca d'água, upload, revisão do admin | `features/proof`, adapters de câmera e geolocalização |
| `notificacoes-whatsapp` | Preferências, canais (in-app, web push, WhatsApp), service worker, montagem do resumo diário (função pura), providers | `features/notifications`, `core/notifications`, adapters de push |
| `gamificacao` | Motor de XP/níveis/ofensiva/conquistas, telas de progresso, comemorações | `features/gamification`, `core/gamification` |
| `compras` | Catálogo, listas, tempo real, modos "montar" e "no mercado" | `features/shopping` |
| `qa-testes` | Estratégia de testes, E2E, checagem da definição de pronto, acessibilidade básica. Lê tudo; não altera código de feature (reporta via handoff) | `e2e/`, configs de teste |
| `revisor-seguranca` | Revisa cada entrega com foco em RLS, segredos, validação, LGPD e fronteiras de módulo. Somente leitura + relatório | — |

Em `packages/data/<módulo>` e `packages/i18n/<idioma>/<módulo>.json`, cada agente de feature é dono da subpasta/arquivo do seu módulo.

### 13.2 Protocolo de comunicação entre agentes

Os subagentes do Claude Code não conversam entre si em tempo real: cada um recebe uma tarefa do orquestrador e devolve um relatório. Por isso, a "conversa" entre agentes acontece **por arquivos versionados**, nesta ordem de autoridade:

1. **Contratos (`packages/contracts`)** — tipos e schemas Zod são a fonte da verdade entre agentes. Antes de dois agentes trabalharem em paralelo em algo que se conecta (ex.: banco ↔ tarefas), o arquiteto publica o contrato. Mudança de contrato = aprovação do arquiteto + handoff para todos os afetados.
2. **Handoffs (`docs/agentes/handoffs/`)** — um arquivo por passagem de bastão, nome `AAAAMMDD-HHmm-<de>-para-<para>-<assunto>.md`, com:
   - De / Para / Data
   - Contexto
   - O que foi entregue (branch, commits)
   - Contratos criados ou alterados
   - O que o destinatário precisa fazer
   - Bloqueios e dúvidas
   - Como testar
3. **Quadro (`docs/agentes/QUADRO.md`)** — estado de todas as tarefas.

**Regras**
- Cada agente **só edita arquivos do seu escopo**. Precisa de algo fora dele → handoff para o dono (ou pedido ao orquestrador).
- Ao começar, o agente lê: sua própria definição, os handoffs endereçados a ele, as últimas entradas do LOG e os contratos relevantes.
- Todo relatório final de subagente ao orquestrador segue o formato: **Feito / Arquivos alterados / Contratos / Testes rodados e resultado / Pendências / Handoffs criados / Riscos.**
- Dúvida de produto → orquestrador → humano. Dúvida técnica entre agentes → handoff; em impasse, o arquiteto decide e registra ADR.
- Tarefas independentes rodam **em paralelo**, cada agente na sua worktree/branch. O orquestrador integra na ordem do grafo de dependências.
- Cada agente escreve **sua própria entrada no LOG**, como `Claude de [SEU NOME]`, indicando o agente no campo "Agente(s)".
- Se a versão do Claude Code em uso oferecer um recurso nativo de equipes de agentes com troca de mensagens, pode usar — mas os arquivos acima continuam sendo a fonte da verdade, para que humanos e outras IAs acompanhem.

### 13.3 Grafo de dependências (ordem típica)

```
arquiteto
   ├─> banco-de-dados ─┐
   └─> design-system ──┴─> auth-grupos ─> tarefas-calendario ─┬─> prova-foto
                                  │                             ├─> notificacoes-whatsapp
                                  │                             └─> gamificacao
                                  └─> compras (pode começar logo após auth-grupos)
backend-funcoes acompanha cada feature que precisa de servidor.
qa-testes e revisor-seguranca atuam ao fim de cada entrega.
```

---

## 14. Fases

**Fase 0 — Fundação e planejamento (FAÇA AGORA)**
1. Leia este documento inteiro e liste suas dúvidas.
2. Crie: `LOG_DE_ALTERACOES.md` (com o cabeçalho), `CLAUDE.md`, `AGENTS.md`, `AGENTES.md`, `.claude/agents/*`, `docs/arquitetura.md`, ADRs 0001–0003, `QUADRO.md` com o backlog completo.
3. Scaffold do monorepo; app Expo rodando na web com uma tela inicial usando os tokens; lint/format/fronteiras; CI; `.env.example`; config validada; i18n base; Supabase local configurado.
4. Entregue ao humano: resumo do plano, stack final, perguntas abertas (seção 15).
5. **PARE e aguarde aprovação** antes da Fase 1.

**Fase 1** — Contas, perfil, grupos, convites, papéis, permissões (RLS + testes), áreas e contextos, design system base, onboarding.

**Fase 2** — Tarefas, estados (máquina de estados), recorrência, tela Hoje, abas Trabalho/Doméstico com sub-abas, calendário, visão Equipe. Registrar eventos de XP desde já.

**Fase 3** — Prova por foto completa (câmera, desafio, marca d'água, validação no servidor, revisão do admin).

**Fase 4** — Notificações in-app + Web Push + PWA + job de vermelho automático.

**Fase 5** — WhatsApp: verificação de telefone, opt-in, resumo diário, webhooks (primeiro com provider mock, depois o real).

**Fase 6** — Gamificação completa: níveis, ofensiva, conquistas, comemorações, ranking opcional.

**Fase 7** — Lista de compras (pode rodar em paralelo a partir da Fase 2).

**Fase 8** — Polimento: acessibilidade, animações, performance, E2E completo, preparação para iOS/Android (configuração EAS, ícones, splash, deep links, push nativo).

Ao fim de cada fase: mini-demo para o humano (o que testar e como), LOG e QUADRO atualizados, pausa para validação.

---

## 15. Perguntas para fazer ao humano na Fase 0

Faça estas perguntas; se ele não responder, siga o padrão sugerido e registre em ADR.

1. **Nome do app?** → Padrão: proponha 5 opções; use um nome provisório via config.
2. **Provedor de WhatsApp:** API oficial da Meta (exige conta Business verificada, número dedicado, templates aprovados e custo por mensagem) ou outro? → Padrão: Meta, com mock em desenvolvimento.
3. **Hospedagem web:** Vercel ou Netlify? → Padrão: a que o humano já usar.
4. **Login por telefone desde o início?** (tem custo de SMS/OTP) → Padrão: e-mail + link mágico agora; telefone na Fase 5.
5. **Ranking entre membros** em grupos familiares? → Padrão: opcional na família, desativado em empresa.
6. **Amarelo sempre exige justificativa?** → Padrão: sim.
7. **Tolerância para o vermelho automático?** → Padrão: fim do dia para tarefas com horário; data limite para tarefas de prazo.
8. **Tela inicial "Hoje"** consolidada antes das abas Trabalho/Doméstico? → Padrão: sim.

---

## 16. Não faça

- Não copie mascote, logo, fontes proprietárias, paleta exata ou assets da Duolingo.
- Não coloque lógica de negócio em componentes de tela.
- Não acesse o Supabase direto de componentes.
- Não use APIs de navegador fora de `packages/platform`.
- Não hardcode IDs, horários, fusos, telefones, textos, cores, regras de XP ou permissões.
- Não desative RLS "temporariamente".
- Não use `any` sem justificativa comentada.
- Não reescreva módulos de outro agente; use handoff.
- Não encerre nenhuma tarefa sem a entrada no LOG.
- Não invente data, hora ou nome da pessoa no LOG.
- Não avance de fase sem aprovação do humano.
