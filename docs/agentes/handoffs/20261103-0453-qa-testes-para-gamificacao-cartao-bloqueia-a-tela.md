# Handoff: qa-testes para gamificacao, cartão de comemoração bloqueia a tela

**De:** qa-testes
**Para:** gamificacao
**Data:** 2026-11-03 04:53 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/qa-phase-6-close`, a partir de `feat/phase-6-gamification` (`f12607f`)

## Contexto

Fechamento do QA da Fase 6, depois das correções SEG6 e QA6. A E2E completa teve 2 falhas em `notifications-jobs`, e a causa confirmada da primeira é um defeito do `CelebrationHost`.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**QA6C-1, média. Enquanto o cartão de comemoração está aberto (6 s), nenhum toque funciona na tela.**

O invólucro do cartão em `packages/features/gamification/src/CelebrationHost.tsx` ocupa a tela toda (`position: absolute`, `top/right/bottom/left: 0`) e conta com `style={{ pointerEvents: 'box-none' }}` para deixar os toques passarem. Na web isso não chega ao DOM: o elemento sai como `css-view-g5y9jx items-center justify-center px-4`, sem classe de `pointer-events`, e o estilo calculado é `pointer-events: auto`. Sonda: conta nova, duas tarefas, concluída a primeira; com o cartão aberto, `document.elementFromPoint(20, 60)` (longe do cartão, no cabeçalho) devolve o invólucro, e tocar no check da segunda tarefa estoura 2,5 s por "intercepts pointer events". Quem conclui várias tarefas em sequência perde o toque por 6 s a cada conclusão, a menos que toque em "Continuar".

Na E2E completa, `notifications-jobs.spec.ts` "the red-by-default job…" falhou por isso: o "Fechar aviso" do aviso ao vivo ficou coberto pelo invólucro (o `setStatus('done')` do teste concede "Primeira tarefa"). "a reminder that is due rings the bell once…" também falhou (o sino ficou com 1 não lido depois de abrir o aviso); a causa provável é a mesma, mas o rastro se perdeu e ela não foi confirmada. As duas passaram sozinhas (`--project=jobs --no-deps`), porque depende de o cartão estar aberto na hora do toque.

Sugestão: a prop `pointerEvents="box-none"` no `View` (o react-native-web a traduz), ou o invólucro sem tamanho de tela, só envolvendo o cartão. Ao corrigir, tire o `test.fail()` de "while the celebration card is up, the rest of Hoje still takes taps" em `e2e/gamification.spec.ts`; o Playwright acusa quando ele passar.

**QA6C-2, baixa (para decidir com o `arquiteto`). "Primeira tarefa" é comemorada no teto.**

O ADR-0010 diz, na seção de casos, que a conclusão com o teto atingido "não comemora". A conquista é concedida mesmo sem XP, e o cartão "Conquista: Primeira tarefa" aparece. Não parece errado (a conquista é real), mas o texto do ADR e o comportamento divergem. A E2E do teto concedia a conquista sem perceber: o `toHaveCount(0)` repetia até o cartão fechar sozinho. Agora ela concede a conquista antes e conta uma vez só.

**QA6C-3, baixa, não reproduzida. A conquista pode vir num cartão separado.**

Numa rodada com 4 workers, "finishing tasks…" viu "Conquista: Primeira tarefa" sem a linha "Tarefa concluída!". O evento de XP e a conquista são gravados na mesma transação, mas chegam em mensagens separadas do Realtime; se a distância passar de `burstMs` (600 ms), viram duas rajadas, e o segundo cartão substitui o primeiro. Não se repetiu em 3 rodadas isoladas nem na E2E completa. Se incomodar, aumentar `burstMs` ou juntar as rajadas que chegam com o cartão aberto.

## Bloqueios e dúvidas

Nenhum.

## Como testar

`pnpm db:start`, `pnpm exec supabase db reset`, `pnpm exec playwright test e2e/gamification.spec.ts --project=app`. Hoje o teste de QA6C-1 aparece como esperado-falho; depois da correção ele passa e o Playwright reprova até sair o `test.fail()`.
