import {
  shoppingCategories,
  shoppingErrorCodeSchema,
  shoppingNameSchema,
  shoppingUnits,
} from '@azkaban/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shoppingRules } from '@azkaban/config';
import {
  canManageList,
  canShop,
  completionXp,
  listForTask,
  parseNote,
  readMode,
  shoppingErrorKey,
  shoppingNameErrorKey,
  shoppingPaths,
  shoppingTextErrorKey,
} from './shopping';

const messages = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'i18n', 'src', 'pt-BR', 'shopping.json'),
    'utf8',
  ),
) as Record<
  'errors' | 'categories' | 'units' | 'unitNames' | 'form' | 'list' | 'lists' | 'task' | 'offline',
  Record<string, string>
>;

describe('shoppingErrorKey', () => {
  it('every code of the contract has its own message, so none falls to the generic one', () => {
    for (const code of shoppingErrorCodeSchema.options) {
      expect(messages.errors[code], code).toBeTruthy();
      expect(shoppingErrorKey({ message: code, code: 'P0001' })).toBe(`errors.${code}`);
    }
  });

  it('anything else is generic, and generic has a text', () => {
    expect(shoppingErrorKey(new Error('Failed to fetch'))).toBe('errors.generic');
    expect(shoppingErrorKey(null)).toBe('errors.generic');
    expect(messages.errors.generic).toBeTruthy();
  });
});

describe('vocabulary', () => {
  it('names every category and unit, with both plural forms', () => {
    for (const category of shoppingCategories) expect(messages.categories[category]).toBeTruthy();
    for (const unit of shoppingUnits) {
      expect(messages.unitNames[unit], unit).toBeTruthy();
      expect(messages.units[`${unit}_one`], unit).toContain('{{value}}');
      expect(messages.units[`${unit}_other`], unit).toContain('{{value}}');
    }
  });
});

describe('access and address', () => {
  it('lets the owner do everything on a personal list', () => {
    expect(canShop({ memberships: [] }, 'shopping.manage_catalog', null)).toBe(true);
  });

  it('never lets an outsider act on a group list', () => {
    expect(canShop({ memberships: [] }, 'shopping.create_list', 'g1')).toBe(false);
  });

  it('lets a group member shop but not edit the catalog', () => {
    const member = { memberships: [{ groupId: 'g1', role: 'member' as const }] };
    expect(canShop(member, 'shopping.complete_list', 'g1')).toBe(true);
    expect(canShop(member, 'shopping.manage_catalog', 'g1')).toBe(false);
  });

  it('keeps the mode in the address, building by default', () => {
    expect(readMode('market')).toBe('market');
    expect(readMode(undefined)).toBe('build');
    expect(readMode('nonsense')).toBe('build');
    expect(shoppingPaths.list('l1', 'market')).toBe('/shopping/l1?mode=market');
    expect(shoppingPaths.history('g1')).toBe('/shopping/history?group=g1');
  });
});

describe('shoppingNameErrorKey', () => {
  const key = (value: string, pressed: boolean) =>
    shoppingNameErrorKey(shoppingNameSchema.safeParse(value), pressed);

  it('says why "Criar lista" did nothing when the name is empty or only spaces', () => {
    expect(key('', true)).toBe('lists.nameRequired');
    expect(key('   ', true)).toBe('lists.nameRequired');
    expect(key('a'.repeat(81), true)).toBe('lists.nameTooLong');
    expect(messages.lists.nameRequired).toBeTruthy();
    expect(messages.lists.nameTooLong).toBeTruthy();
  });

  it('waits for the first press, and never blames a valid name', () => {
    expect(key('', false)).toBeNull();
    expect(key('Mercado', true)).toBeNull();
    expect(key('Arroz\nLeite', false)).toBe('form.invalidText');
  });
});

describe('shoppingTextErrorKey', () => {
  const key = (value: string) => shoppingTextErrorKey(shoppingNameSchema.safeParse(value));

  it('says why a line break or control character is refused', () => {
    for (const value of [
      'Arroz\nLeite',
      'Arroz\tLeite',
      ...[0x202e, 0x2028].map((c) => `Arroz${String.fromCodePoint(c)}Leite`),
    ]) {
      expect(key(value), JSON.stringify(value)).toBe('form.invalidText');
    }
    expect(messages.form.invalidText).toBeTruthy();
  });

  it('stays quiet for valid, empty or too long text, where the button is just off', () => {
    expect(key('Arroz')).toBeNull();
    expect(key(' Arroz\n')).toBeNull();
    expect(key('')).toBeNull();
    expect(key('a'.repeat(500))).toBeNull();
  });
});

describe('canManageList', () => {
  const me = (role: 'owner' | 'admin' | 'member') => ({
    id: 'u1',
    memberships: [{ groupId: 'g1', role }],
  });

  it('lets the creator rename and delete while a member, and nobody else without the key', () => {
    expect(canManageList(me('member'), { groupId: 'g1', createdBy: 'u1' })).toBe(true);
    expect(canManageList(me('member'), { groupId: 'g1', createdBy: 'u2' })).toBe(false);
    expect(canManageList(me('member'), { groupId: 'g1', createdBy: null })).toBe(false);
  });

  it('lets shopping.manage_lists act on a group list someone else created', () => {
    expect(canManageList(me('admin'), { groupId: 'g1', createdBy: 'u2' })).toBe(true);
    expect(canManageList(me('owner'), { groupId: 'g1', createdBy: null })).toBe(true);
  });

  it('never lets a former member act on the list they created', () => {
    const gone = { id: 'u1', memberships: [] };
    expect(canManageList(gone, { groupId: 'g1', createdBy: 'u1' })).toBe(false);
  });

  it('leaves a personal list to its owner, the only one who sees it', () => {
    expect(canManageList({ id: 'u1', memberships: [] }, { groupId: null, createdBy: 'u1' })).toBe(
      true,
    );
  });
});

describe('parseNote', () => {
  it('clears the note when left blank', () => {
    expect(parseNote('')).toMatchObject({ success: true, data: null });
    expect(parseNote('   ')).toMatchObject({ success: true, data: null });
  });

  it('keeps a trimmed note and refuses one that breaks the contract', () => {
    expect(parseNote(' Integral ')).toMatchObject({ success: true, data: 'Integral' });
    expect(shoppingTextErrorKey(parseNote('Integral\nDesnatado'))).toBe('form.invalidText');
    expect(parseNote('a'.repeat(201)).success).toBe(false);
  });
});

describe('list status', () => {
  it('says an empty list is empty, never "Falta 0 item"', () => {
    expect(messages.list.empty).toBeTruthy();
    expect(messages.errors.lists_full).toContain('exclua');
  });
});

describe('codes outside the contract', () => {
  it('names the rate limit, no connection and the queue reasons, each with its own text', () => {
    for (const code of ['rate_limited', 'offline', 'expired', 'invalid']) {
      expect(shoppingErrorKey(code), code).toBe(`errors.${code}`);
      expect(shoppingErrorKey(new Error(code)), code).toBe(`errors.${code}`);
      expect(messages.errors[code], code).toBeTruthy();
    }
    expect(messages.errors.expired).toContain('{{hours}}');
    expect(messages.offline.discarded).toContain('{{reason}}');
  });
});

describe('completionXp', () => {
  const { amount, minCheckedItems, maxRewardedPerDay } = shoppingRules.xp;

  it('promises nothing below the minimum of checked items, an empty list included', () => {
    expect(completionXp(0)).toEqual({ key: 'list.xpNeedsItems', min: minCheckedItems });
    expect(completionXp(minCheckedItems - 1).key).toBe('list.xpNeedsItems');
  });

  it('says the amount from the minimum on, with the daily cap it cannot see', () => {
    expect(completionXp(minCheckedItems)).toEqual({
      key: 'list.xp',
      amount,
      max: maxRewardedPerDay,
    });
    expect(messages.list.xp).toContain('{{amount}}');
    expect(messages.list.xp).toContain('{{max}}');
    expect(messages.list.xpNeedsItems).toContain('{{min}}');
  });
});

describe('listForTask', () => {
  it('makes the list in the group only for a task the whole group may see', () => {
    const task = { groupId: 'g1', visibility: 'group' as const, title: 'Fazer compras' };
    expect(listForTask(task, 'Compras')).toEqual({ groupId: 'g1', name: 'Fazer compras' });
    expect(listForTask({ ...task, visibility: 'private' }, 'Compras').groupId).toBeNull();
    expect(listForTask({ ...task, groupId: null }, 'Compras').groupId).toBeNull();
  });

  it('falls back to the default name when the title does not fit a list name', () => {
    const task = { groupId: null, visibility: 'private' as const, title: 'a'.repeat(200) };
    expect(listForTask(task, 'Compras').name).toBe('Compras');
    expect(listForTask({ ...task, title: 'Feira‮' }, 'Compras').name).toBe('Compras');
    expect(messages.task.defaultName).toBeTruthy();
  });
});
