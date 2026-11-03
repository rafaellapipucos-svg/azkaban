import {
  dailySummaryRenderSchema,
  type DailySummarySource,
  type DailySummaryTask,
  type WhatsAppStatus,
  whatsappTextParamSchema,
} from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import type { Translate } from './pushPayload';
import {
  buildDailySummary,
  cleanParam,
  isDailySummaryEmpty,
  isWhatsAppReady,
  normalizePhone,
  type SummaryBudgets,
} from './whatsapp';

// The `whatsapp.summary` keys of packages/i18n notifications.json, and a `t` with the dispatcher's
// semantics: dot keys, `{{name}}`, and `count` picking `_one` or `_other` by Intl.PluralRules.
const messages: Record<string, string> = {
  'push.genericTask': 'Uma tarefa',
  'whatsapp.summary.areas.work': 'Trabalho',
  'whatsapp.summary.areas.home': 'Doméstico',
  'whatsapp.summary.group': '{{area}} · {{context}}:',
  'whatsapp.summary.item': '{{when}} {{title}}',
  'whatsapp.summary.allDay': 'dia todo',
  'whatsapp.summary.dueBy': 'até {{time}}',
  'whatsapp.summary.overdueItem': '{{title}} ({{day}})',
  'whatsapp.summary.deadlineItem': '{{title}}, {{weekday}} ({{relative}})',
  'whatsapp.summary.inDays_one': 'amanhã',
  'whatsapp.summary.inDays_other': 'em {{count}} dias',
  'whatsapp.summary.more': '+{{count}}',
  'whatsapp.summary.empty.today': 'nada marcado',
  'whatsapp.summary.empty.overdue': 'nenhuma',
  'whatsapp.summary.empty.deadlines': 'nenhum',
  'whatsapp.summary.overdueOff': 'não incluídas',
  'whatsapp.summary.footer': 'Os detalhes estão no app.',
};
const plural = new Intl.PluralRules('pt-BR');
const t: Translate = (key, values) => {
  const count = values?.count;
  const form = typeof count === 'number' ? messages[`${key}_${plural.select(count)}`] : undefined;
  return (form ?? messages[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values?.[name]),
  );
};

const budgets: SummaryBudgets = { date: 40, today: 400, overdue: 160, deadlines: 160, footer: 80 };
const options = { locale: 'pt-BR', budgets, now: new Date('2026-11-03T11:00:00Z') };

let next = 0;
const task = (over: Partial<DailySummaryTask>): DailySummaryTask => ({
  occurrenceId: `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}`,
  title: 'Tarefa',
  areaI18nKey: 'areas.work',
  contextName: 'Escritório',
  scheduleType: 'timed',
  startAt: '2026-11-03T12:00:00.000Z',
  dueAt: null,
  ...over,
});

// Tuesday, 3 November 2026, in São Paulo (UTC-3).
const source = (over: Partial<DailySummarySource> = {}): DailySummarySource => {
  const base = {
    localDate: '2026-11-03',
    timezone: 'America/Sao_Paulo',
    today: [],
    overdue: [],
    deadlines: [],
    deadlineDays: 7,
    streak: null,
    ...over,
  };
  return {
    totals: {
      today: base.today.length,
      overdue: base.overdue?.length ?? 0,
      deadlines: base.deadlines.length,
    },
    ...base,
  };
};

describe('buildDailySummary', () => {
  it('groups today by area and context in the order of the source, with the local time', () => {
    const render = buildDailySummary(
      source({
        today: [
          task({ title: 'Reunião', startAt: '2026-11-03T12:00:00.000Z' }),
          task({
            title: 'Louça',
            areaI18nKey: 'areas.home',
            contextName: 'Casa',
            scheduleType: 'all_day',
            startAt: '2026-11-03T03:00:00.000Z',
          }),
          task({ title: 'Relatório', startAt: '2026-11-03T17:30:00.000Z' }),
          task({
            title: 'Conta de luz',
            areaI18nKey: 'areas.home',
            contextName: 'Casa',
            scheduleType: 'deadline',
            dueAt: '2026-11-03T21:00:00.000Z',
          }),
        ],
      }),
      options,
      t,
    );
    expect(render.date).toBe('terça-feira, 3 de novembro');
    expect(render.today).toBe(
      'Trabalho · Escritório: 09:00 Reunião, 14:30 Relatório; Doméstico · Casa: dia todo Louça, até 18:00 Conta de luz',
    );
    expect(render.footer).toBe('Os detalhes estão no app.');
  });

  it('follows the zone of the source, not the machine', () => {
    const today = [task({ title: 'Reunião', startAt: '2026-11-03T12:00:00.000Z' })];
    const tokyo = buildDailySummary(source({ timezone: 'Asia/Tokyo', today }), options, t);
    expect(tokyo.today).toBe('Trabalho · Escritório: 21:00 Reunião');
  });

  it('gives an overdue task its day of origin, and a deadline its weekday and distance', () => {
    const render = buildDailySummary(
      source({
        overdue: [
          task({ title: 'Academia', startAt: '2026-11-02T01:00:00.000Z' }),
          task({
            title: 'Imposto',
            scheduleType: 'deadline',
            startAt: '2026-10-20T03:00:00.000Z',
            dueAt: '2026-10-31T23:00:00.000Z',
          }),
        ],
        deadlines: [
          task({ title: 'Projeto', scheduleType: 'deadline', dueAt: '2026-11-04T20:00:00.000Z' }),
          task({ title: 'Relatório', scheduleType: 'deadline', dueAt: '2026-11-07T02:00:00.000Z' }),
        ],
      }),
      options,
      t,
    );
    // 01:00 UTC on the 2nd is still the 1st in São Paulo.
    expect(render.overdue).toBe('Academia (1 de nov.), Imposto (31 de out.)');
    expect(render.deadlines).toBe(
      'Projeto, quarta-feira (amanhã), Relatório, sexta-feira (em 3 dias)',
    );
  });

  it('cuts what does not fit and counts the rest, the cut of the source included', () => {
    const today = Array.from({ length: 30 }, (_, i) =>
      task({ title: `Tarefa número ${i + 1} com um nome comprido` }),
    );
    const render = buildDailySummary(
      { ...source({ today }), totals: { today: 42, overdue: 0, deadlines: 0 } },
      options,
      t,
    );
    expect(render.today.length).toBeLessThanOrEqual(budgets.today);
    const shown = render.today.split(', ').length;
    expect(render.today.endsWith(` +${42 - shown}`)).toBe(true);
    expect(render.today).toMatch(/^Trabalho · Escritório: 09:00 Tarefa número 1 com/);
  });

  it('says only how many when not even one fits', () => {
    const render = buildDailySummary(
      source({ deadlines: [task({ title: 'x'.repeat(200), scheduleType: 'deadline' })] }),
      { ...options, budgets: { ...budgets, deadlines: 20 } },
      t,
    );
    expect(render.deadlines).toBe('+1');
  });

  it('cleans titles and contexts to one line, as Meta asks of a parameter', () => {
    const render = buildDailySummary(
      source({
        today: [
          task({
            title: 'Linha\num\tdois     três\r\n\u0000fim ',
            contextName: 'Casa\n  nova',
          }),
        ],
      }),
      options,
      t,
    );
    expect(render.today).toBe('Trabalho · Casa nova: 09:00 Linha um dois três fim');
    expect(dailySummaryRenderSchema.safeParse(render).success).toBe(true);
  });

  it('says an empty day in short texts, and the caller decides whether to skip it', () => {
    const empty = source();
    expect(isDailySummaryEmpty(empty)).toBe(true);
    // Without `skipEmpty`, it still goes out, with every parameter valid.
    expect(buildDailySummary(empty, options, t)).toEqual({
      date: 'terça-feira, 3 de novembro',
      today: 'nada marcado',
      overdue: 'nenhuma',
      deadlines: 'nenhum',
      footer: 'Os detalhes estão no app.',
    });
    // With overdue turned off, the line says so, and an overdue count does not make it non-empty.
    const off = { ...source({ overdue: null }), totals: { today: 0, overdue: 3, deadlines: 0 } };
    expect(isDailySummaryEmpty(off)).toBe(true);
    expect(buildDailySummary(off, options, t).overdue).toBe('não incluídas');
    expect(isDailySummaryEmpty(source({ deadlines: [task({ scheduleType: 'deadline' })] }))).toBe(
      false,
    );
  });

  it('uses the generic line for a blank title', () => {
    const render = buildDailySummary(source({ today: [task({ title: ' \n\t ' })] }), options, t);
    expect(render.today).toBe('Trabalho · Escritório: 09:00 Uma tarefa');
  });
});

describe('cleanParam', () => {
  it.each([
    ['a\nb', 'a b'],
    ['a\tb', 'a b'],
    ['a     b', 'a b'],
    ['a\u0007b\u007fc\u0085d', 'a b c d'],
    ['a b c', 'a b c'],
    ['  a  ', 'a'],
    // SEG5-6: format characters go, so a title cannot reverse or hide what the reader sees.
    ['Nota \u202efdp.XIPalex\u202c ok', 'Nota fdp.XIPalex ok'],
    ['a\u200eb\u200fc', 'abc'],
    ['a\u200bb\ufeffc\u2060d', 'abcd'],
    ['\u2066a\u2067b\u2068c\u2069', 'abc'],
    ['\u202aa\u202bb\u202dc', 'abc'],
    ['a \u200b b', 'a b'],
  ])('turns %j into %j', (input, output) => {
    expect(cleanParam(input)).toBe(output);
  });

  it('keeps the joiner of a composed emoji whole', () => {
    const family = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}';
    expect(cleanParam(`Jantar ${family}\u202e`)).toBe(`Jantar ${family}`);
  });

  it('gives what the contract accepts, from a title it refuses', () => {
    const title = '\u202eRelat\u00f3rio\u202c \u2066x\u2069\u200b\u200e \u{1f469}\u200d\u{1f4bb}';
    expect(whatsappTextParamSchema.safeParse(title).success).toBe(false);
    expect(whatsappTextParamSchema.parse(cleanParam(title))).toBe(
      'Relat\u00f3rio x \u{1f469}\u200d\u{1f4bb}',
    );
  });
});

describe('normalizePhone', () => {
  it.each([
    ['+55 (11) 98765-4321', '+5511987654321'],
    ['(11) 98765-4321', '+5511987654321'],
    ['11 98765 4321', '+5511987654321'],
    ['011 98765-4321', '+5511987654321'],
    ['+1 415.555.0100', '+14155550100'],
    ['+351 912 345 678', '+351912345678'],
    ['0055 11 98765-4321', '+5511987654321'],
    ['00351 912 345 678', '+351912345678'],
  ])('turns %j into %j', (input, output) => {
    expect(normalizePhone(input)).toBe(output);
  });

  it('takes the country for a number without +', () => {
    expect(normalizePhone('912 345 678', '351')).toBe('+351912345678');
  });

  it.each([
    '',
    'abc',
    '+55 11 9876a-4321',
    '++5511987654321',
    '+0 11 98765-4321',
    '123',
    '+1234567890123456',
    '55+11987654321',
  ])('refuses %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('isWhatsAppReady', () => {
  const ready: WhatsAppStatus = {
    phoneE164: '+5511987654321',
    phoneVerifiedAt: '2026-11-01T10:00:00.000Z',
    optInAt: '2026-11-01T10:05:00.000Z',
    optInVersion: 1,
    optOutAt: null,
  };

  it('needs a verified phone and an opt-in newer than the last opt-out', () => {
    expect(isWhatsAppReady(ready)).toBe(true);
    expect(isWhatsAppReady({ ...ready, optOutAt: '2026-10-01T00:00:00.000Z' })).toBe(true);
    expect(isWhatsAppReady({ ...ready, optOutAt: '2026-11-02T00:00:00.000Z' })).toBe(false);
    expect(isWhatsAppReady({ ...ready, optOutAt: ready.optInAt })).toBe(false);
    expect(isWhatsAppReady({ ...ready, optInAt: null, optInVersion: null })).toBe(false);
    expect(isWhatsAppReady({ ...ready, phoneE164: null, phoneVerifiedAt: null })).toBe(false);
  });
});
