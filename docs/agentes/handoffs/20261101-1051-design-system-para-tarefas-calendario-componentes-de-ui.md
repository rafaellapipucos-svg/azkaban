# Handoff: design-system para tarefas-calendario, componentes de UI da Fase 2

**De:** design-system
**Para:** tarefas-calendario
**Data:** 2026-11-01 10:51 (BRT)

## Contexto

Os componentes que as telas de tarefas e calendário pedem estão prontos na branch `feat/ui-phase-2` (criada a partir de `feat/phase-2-tasks`). Todos saem de `@azkaban/ui`, usam só primitivos do React Native, tokens e i18n, e funcionam em claro e escuro. Veja cada um em `/design-system`.

## O que foi entregue

Alvos de toque têm 44px ou mais. Textos entram por prop; os poucos fixos do componente estão em `packages/i18n/src/pt-BR/ui.json`.

### `DateField` e `TimeField`

Como `FormTextField`, com react-hook-form.

| Prop          | Tipo                | Nota                                                          |
| ------------- | ------------------- | ------------------------------------------------------------- |
| `control`     | `Control<T>`        | do `useForm`                                                  |
| `name`        | `FieldPath<T>`      | o campo do formulário deve ser `string`                       |
| `label`       | `string`            | rótulo visível e acessível                                    |
| `errorText`   | `string`            | mostrado quando o campo é inválido                            |
| `placeholder` | `string` (opcional) | só no nativo, enquanto vazio; o padrão é "Escolher data/hora" |

Valor: `DateField` dá `yyyy-MM-dd`, `TimeField` dá `HH:mm`, sempre no calendário e no relógio locais do usuário, ou `''` se vazio. Nenhum fuso no componente: combine com o fuso da tarefa no seu código (`packages/core`). Para o formulário aceitar vazio, o `defaultValue` deve ser `''`. Para validar, use as regras do seu `useForm` ou resolver; o componente só mostra `errorText` quando `fieldState.invalid`. Na web é o `<input type="date|time">` do navegador (a formatação segue o navegador); no nativo é o seletor do sistema.

### `ProgressRing`

| Prop        | Tipo                | Nota                                                       |
| ----------- | ------------------- | ---------------------------------------------------------- |
| `progress`  | `number`            | de 0 a 1, o que passar disso é cortado                     |
| `label`     | `string`            | o que o anel mede, lido por leitor de tela ("Meta do dia") |
| `valueText` | `string`            | texto no meio e valor lido ("3 de 5")                      |
| `size`      | `number` (opcional) | padrão `tokens.sizes.ring` (96)                            |

Fica verde (`done`) quando chega a 1. Anima o preenchimento e pula a animação com "reduzir movimento".

### `TaskCheck`

| Prop          | Tipo                 | Nota                                                                    |
| ------------- | -------------------- | ----------------------------------------------------------------------- |
| `status`      | `OccurrenceStatus`   | `pending`, `done`, `partial`, `missed`, `cancelled`                     |
| `late`        | `boolean` (opcional) | passe `occurrence.late`; só vale com `done`: marca "!" e rótulo próprio |
| `title`       | `string`             | nome da tarefa; o rótulo falado é "Título: Estado"                      |
| `onPress`     | `() => void`         | em geral, alternar entre pendente e feito                               |
| `onLongPress` | `() => void`         | para tentei, não feito e cancelar                                       |
| `disabled`    | `boolean`            |                                                                         |

Círculo de 48px com os mesmos símbolos do `StatusBadge` (•, ✓, ~, ✗, –). É controlado: você decide o estado, ele só mostra e dá um pulo ao sair de pendente (sem pulo com "reduzir movimento"). `role="checkbox"`, `mixed` em `partial`.

### `Fab`

| Prop         | Tipo                | Nota                                                                                                |
| ------------ | ------------------- | --------------------------------------------------------------------------------------------------- |
| `label`      | `string`            | nome falado e texto quando `extended`                                                               |
| `onPress`    | `() => void`        |                                                                                                     |
| `icon`       | `string` (opcional) | padrão `+`                                                                                          |
| `extended`   | `boolean`           | mostra o texto ao lado do ícone                                                                     |
| `insideTabs` | `boolean`           | padrão `true`: a tela está numa aba, e a barra já cuida da safe area. Use `false` sem barra de abas |

Posiciona-se sozinho, embaixo à direita, alinhado à coluna de 560px. Renderize como irmão do `Screen`, dentro de uma `View` com `className="flex-1"`.

### `SegmentedControl<T extends string>`

| Prop       | Tipo                            | Nota                                  |
| ---------- | ------------------------------- | ------------------------------------- |
| `label`    | `string`                        | nome do grupo ("Visão do calendário") |
| `options`  | `{ value: T; label: string }[]` | de 2 a 4 opções curtas                |
| `value`    | `T`                             |                                       |
| `onChange` | `(value: T) => void`            |                                       |

Também exporta o tipo `SegmentOption<T>`. `role="radiogroup"`, como `ChipRow`.

### `Stepper`

| Prop       | Tipo                        | Nota                                                                      |
| ---------- | --------------------------- | ------------------------------------------------------------------------- |
| `label`    | `string`                    | o que se conta; os botões falam "Diminuir: {label}" e "Aumentar: {label}" |
| `value`    | `number`                    |                                                                           |
| `onChange` | `(value: number) => void`   |                                                                           |
| `min`      | `number`                    | padrão 1                                                                  |
| `max`      | `number` (opcional)         |                                                                           |
| `step`     | `number`                    | padrão 1                                                                  |
| `format`   | `(value: number) => string` | texto do valor, ex.: "2 dias"; padrão o número                            |

O rótulo visível ("Repetir a cada") fica por sua conta, ao lado do componente.

### `SwitchRow`

| Prop            | Tipo                       | Nota          |
| --------------- | -------------------------- | ------------- |
| `label`         | `string`                   |               |
| `value`         | `boolean`                  |               |
| `onValueChange` | `(value: boolean) => void` |               |
| `description`   | `string` (opcional)        | segunda linha |
| `disabled`      | `boolean`                  |               |

### `IconButton`

| Prop       | Tipo                  | Nota                                           |
| ---------- | --------------------- | ---------------------------------------------- |
| `icon`     | `string`              | emoji ou um glifo; escondido de leitor de tela |
| `label`    | `string`              | nome acessível                                 |
| `onPress`  | `() => void`          |                                                |
| `variant`  | `'soft' \| 'primary'` | padrão `soft`                                  |
| `disabled` | `boolean`             |                                                |

### Outros exports novos

`useReducedMotion()` (booleano, `true` até o sistema responder) e o tipo `SegmentOption`. Tokens novos em `tokens`: `sizes`, `motion`, `colors.doneEdge`, `colors.partialEdge`, `colors.cancelledEdge`.

## Contratos criados ou alterados

Nenhum. `TaskCheck` lê `OccurrenceStatus` de `@azkaban/contracts`.

## O que o destinatário precisa fazer

1. Usar os componentes nas telas. Não crie versões próprias de data, hora, interruptor ou marcador.
2. Se precisar de algo que falta, peça por handoff ao `design-system`.
3. `packages/ui` agora depende de `@azkaban/platform`, e `packages/platform` do `@react-native-community/datetimepicker`. Rode `pnpm install` depois do merge.

## Bloqueios e dúvidas

- Nada foi testado em aparelho: o seletor nativo de data e hora e o `Fab` com safe area real ainda não foram vistos em iOS e Android.
- O plugin do `@react-native-community/datetimepicker` não está em `apps/app/app.config.ts` (fora do meu escopo; é opcional e só estiliza o Android). Se o `arquiteto` quiser, é uma linha em `plugins`.
- Novos adapters de plataforma com `.web.tsx` e `.native.tsx` precisam de um arquivo-base `.tsx` com os tipos (como `DateTimeInput.tsx`), senão o `pnpm boundaries` não resolve o import. Um `.ts` ou `.js` no lugar faz o Metro carregá-lo antes do `.web.tsx`.

## Como testar

`pnpm install`, `pnpm dev`, abrir `/design-system` em 375px, claro e escuro. Escolha uma data e uma hora e veja `Data: 2026-11-15` e `Hora: 09:30` embaixo dos campos.
