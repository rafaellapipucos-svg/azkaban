import type { Celebration } from '@azkaban/core';
import { initI18n } from '@azkaban/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { celebrationText, perfectDayDetail } from './celebrationText';

let t: (key: string, options?: Record<string, unknown>) => string;
beforeAll(async () => {
  const fixed = await initI18n();
  t = (key, options) => fixed(key, { ns: 'gamification', ...options });
});

const all: Celebration[] = [
  { kind: 'occurrence_done' },
  { kind: 'occurrence_partial' },
  { kind: 'perfect_day' },
  { kind: 'streak_milestone', days: 7 },
  { kind: 'level_up', level: 3 },
  { kind: 'achievement', key: 'first_task' },
  { kind: 'achievement', key: 'unknown_key' },
];

describe('celebration text', () => {
  it.each(all.map((c) => [JSON.stringify(c), c] as const))('%s ends in punctuation', (_, c) => {
    expect(celebrationText(t, c)).toMatch(/[.!?]$/);
  });

  it('joins the perfect day with an achievement and a completion as sentences', () => {
    const others = [
      celebrationText(t, { kind: 'achievement', key: 'first_task' }),
      celebrationText(t, { kind: 'occurrence_done' }),
    ];
    expect(perfectDayDetail(t, others)).toBe(
      'Você fez tudo o que planejou para hoje. Conquista: Primeira tarefa! Tarefa concluída!',
    );
  });

  it('keeps the perfect day line alone when nothing else came', () => {
    expect(perfectDayDetail(t, [])).toBe('Você fez tudo o que planejou para hoje.');
  });

  it('joins several achievements and a level as sentences', () => {
    const list: Celebration[] = [
      { kind: 'level_up', level: 2 },
      { kind: 'achievement', key: 'first_task' },
      { kind: 'achievement', key: 'perfect_week' },
    ];
    expect(
      perfectDayDetail(
        t,
        list.map((c) => celebrationText(t, c)),
      ),
    ).toBe(
      'Você fez tudo o que planejou para hoje. Nível 2! Conquista: Primeira tarefa! Conquista: Semana perfeita!',
    );
  });
});
