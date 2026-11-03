import { shoppingCategories, shoppingErrorCodeSchema, shoppingUnits } from '@azkaban/contracts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canShop, readMode, shoppingErrorKey, shoppingPaths } from './shopping';

const messages = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'i18n', 'src', 'pt-BR', 'shopping.json'),
    'utf8',
  ),
) as Record<'errors' | 'categories' | 'units' | 'unitNames', Record<string, string>>;

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

  it('keeps the mode in the address, building by default', () => {
    expect(readMode('market')).toBe('market');
    expect(readMode(undefined)).toBe('build');
    expect(readMode('nonsense')).toBe('build');
    expect(shoppingPaths.list('l1', 'market')).toBe('/shopping/l1?mode=market');
    expect(shoppingPaths.history('g1')).toBe('/shopping/history?group=g1');
  });
});
