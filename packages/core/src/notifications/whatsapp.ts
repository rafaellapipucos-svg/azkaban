import {
  dailySummaryRenderSchema,
  phoneE164Schema,
  type DailySummaryRender,
  type DailySummarySource,
  type DailySummaryTask,
  type WhatsAppStatus,
} from '@azkaban/contracts';
import { DAY_MS, localDateOf, wallMidnight } from '../recurrence/zone';
import { clip, type Translate } from './pushPayload';

// WhatsApp in core (ADR-0009): the phone the UI sends, whether a profile may receive, and the text of
// the daily summary. The dispatcher loads this file through its import map, so it stays on Intl and
// on the short `t` (dot keys, `{{name}}` and plural by `count`).

/**
 * E.164 from what a person types: spaces, dashes, dots and parentheses go, a leading `0` of a
 * national number too, and a number without `+` gets `countryCode`. Null when it is not a phone.
 */
export function normalizePhone(input: string, countryCode = '55'): string | null {
  const compact = input.replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const e164 = compact.startsWith('+') ? compact : `+${countryCode}${compact.replace(/^0+/, '')}`;
  return phoneE164Schema.safeParse(e164).success ? e164 : null;
}

/** Verified, and an opt-in newer than the last opt-out: the same rule as the database. */
export function isWhatsAppReady(status: WhatsAppStatus): boolean {
  const { phoneE164, phoneVerifiedAt, optInAt, optOutAt } = status;
  if (!phoneE164 || !phoneVerifiedAt || !optInAt) return false;
  return !optOutAt || Date.parse(optOutAt) < Date.parse(optInAt);
}

/** Nothing to tell: with `daily_summary_skip_empty`, the claim cancels it as `summary_empty`. */
export function isDailySummaryEmpty(source: DailySummarySource): boolean {
  return (
    source.totals.today + (source.overdue ? source.totals.overdue : 0) + source.totals.deadlines ===
    0
  );
}

/**
 * One line for a template parameter: every control character (line breaks and tabs included) and
 * every run of white space becomes one space. Meta refuses a parameter with a line break, a tab or
 * more than four spaces in a row (`whatsappTextParamSchema`).
 */
export function cleanParam(text: string): string {
  return text.replace(/[\p{Cc}\s]+/gu, ' ').trim();
}

export type SummaryBudgets = Record<keyof DailySummaryRender, number>;
export type SummaryOptions = {
  locale: string;
  /** `whatsappDefaults.summaryBudgets`: characters per parameter. */
  budgets: SummaryBudgets;
  /**
   * Part of the agreed signature. Unused: the source is read at send time and carries its own date,
   * so nothing here depends on the clock.
   */
  now: Date;
};

const titleMaxLength = 60;
const contextMaxLength = 40;

/**
 * The parameters of `daily_summary_v1` (ADR-0009, section 5), each one line within its budget. Today
 * is grouped by area and context in the order of the source; what does not fit becomes "+N", and the
 * button opens the app. An empty list is a short text, and the footer is neutral until Phase 6.
 */
export function buildDailySummary(
  source: DailySummarySource,
  { locale, budgets }: SummaryOptions,
  t: Translate,
): DailySummaryRender {
  const zone = source.timezone;
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone,
  });
  // Floating midnights are UTC wall clocks: formatting them in UTC names the local date.
  const dayName = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(wallMidnight(date));
  const dayOf = (instant: string) => localDateOf(zone, Date.parse(instant));
  const title = (task: DailySummaryTask) =>
    clip(cleanParam(task.title) || t('push.genericTask'), titleMaxLength);
  const due = (task: DailySummaryTask) => task.dueAt ?? task.startAt;

  const when = (task: DailySummaryTask) => {
    if (task.scheduleType === 'all_day') return t('whatsapp.summary.allDay');
    if (task.scheduleType === 'deadline') {
      return t('whatsapp.summary.dueBy', { time: time.format(Date.parse(due(task))) });
    }
    return time.format(Date.parse(task.startAt));
  };

  const groups = new Map<string, string[]>();
  for (const task of source.today) {
    const key = JSON.stringify([task.areaI18nKey, task.contextName]);
    const item = t('whatsapp.summary.item', { when: when(task), title: title(task) });
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const todayPieces = [...groups].flatMap(([key, items], index) => {
    const [areaKey, context] = JSON.parse(key) as [string, string];
    const label = t('whatsapp.summary.group', {
      area: t(`whatsapp.summary.${areaKey}`),
      context: clip(cleanParam(context), contextMaxLength),
    });
    return items.map((item, i) =>
      i > 0 ? `, ${item}` : `${index > 0 ? '; ' : ''}${label} ${item}`,
    );
  });

  const list = (pieces: string[], total: number, budget: number, empty: string) => {
    if (pieces.length === 0 && total === 0) return clip(t(empty), budget);
    return fit(pieces, Math.max(total, pieces.length), budget, t);
  };

  const overdue = source.overdue
    ? list(
        source.overdue.map((task, i) => {
          const day = dayName(dayOf(due(task)), { day: 'numeric', month: 'short' });
          const item = t('whatsapp.summary.overdueItem', { title: title(task), day });
          return i > 0 ? `, ${item}` : item;
        }),
        source.totals.overdue,
        budgets.overdue,
        'whatsapp.summary.empty.overdue',
      )
    : clip(t('whatsapp.summary.overdueOff'), budgets.overdue);

  const deadlines = list(
    source.deadlines.map((task, i) => {
      const date = dayOf(due(task));
      const days = Math.round((wallMidnight(date) - wallMidnight(source.localDate)) / DAY_MS);
      const item = t('whatsapp.summary.deadlineItem', {
        title: title(task),
        weekday: dayName(date, { weekday: 'long' }),
        relative: t('whatsapp.summary.inDays', { count: days }),
      });
      return i > 0 ? `, ${item}` : item;
    }),
    source.totals.deadlines,
    budgets.deadlines,
    'whatsapp.summary.empty.deadlines',
  );

  const render = {
    date: clip(
      dayName(source.localDate, { weekday: 'long', day: 'numeric', month: 'long' }),
      budgets.date,
    ),
    today: list(todayPieces, source.totals.today, budgets.today, 'whatsapp.summary.empty.today'),
    overdue,
    deadlines,
    // ponytail: neutral until Phase 6 fills `streak` and decides its line; the template stays.
    footer: clip(t('whatsapp.summary.footer'), budgets.footer),
  };
  return dailySummaryRenderSchema.parse(
    Object.fromEntries(Object.entries(render).map(([key, text]) => [key, cleanParam(text)])),
  );
}

/**
 * The most pieces that fit the budget with the "+N" of the rest. Each piece already carries its
 * separator. ponytail: tries from the longest down, O(n²) on at most 50 items.
 */
function fit(pieces: string[], total: number, budget: number, t: Translate) {
  for (let shown = pieces.length; shown >= 0; shown--) {
    const rest = total - shown;
    const text = [
      pieces.slice(0, shown).join(''),
      rest > 0 ? t('whatsapp.summary.more', { count: rest }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (text.length <= budget) return text;
  }
  return clip(t('whatsapp.summary.more', { count: total }), budget);
}
