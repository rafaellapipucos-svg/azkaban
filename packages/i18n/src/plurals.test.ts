import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { initI18n } from './index';

// CLDR pt-BR puts 0 in `one`; the human chose the plural for zero (ADR-0012 §17 item 10).
// i18next looks up `_zero` whenever `count === 0`, before the CLDR form.
beforeAll(() => initI18n());

const say = (key: string, count: number) => i18next.t(key, { count, value: String(count) });

describe('zero takes the plural', () => {
  it.each([
    ['shopping:units.pack', '1 pacote', '0 pacotes'],
    ['shopping:units.dozen', '1 dúzia', '0 dúzias'],
    ['calendar:day.count', '1 tarefa', '0 tarefas'],
    ['gamification:streak.freezes', '1 proteção', '0 proteções'],
    ['tasks:repeat.count', '1 vez', '0 vezes'],
  ])('%s', (key, one, zero) => {
    expect(say(key, 1)).toBe(one);
    expect(say(key, 0)).toBe(zero);
  });

  it('keeps the texts written for zero', () => {
    expect(say('notifications:bell.label', 0)).toBe('Avisos');
  });

  it('every counted key has a zero form', () => {
    const missing: string[] = [];
    const walk = (node: Record<string, unknown>, path: string) => {
      for (const [key, child] of Object.entries(node)) {
        if (child && typeof child === 'object')
          walk(child as Record<string, unknown>, `${path}${key}.`);
        else if (key.endsWith('_one') && !(key.replace(/_one$/, '_zero') in node))
          missing.push(path + key);
      }
    };
    for (const [ns, messages] of Object.entries(i18next.store.data[i18next.language] ?? {})) {
      walk(messages as Record<string, unknown>, `${ns}:`);
    }
    expect(missing).toEqual([]);
  });
});
