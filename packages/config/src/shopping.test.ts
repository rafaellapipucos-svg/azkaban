import { shoppingCatalogItemInputSchema, shoppingQuantitySchema } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { shoppingDefaults, shoppingRules } from './shopping';
import { shoppingCatalogSeed } from './shopping-catalog-seed';

describe('shoppingCatalogSeed', () => {
  it('passes the contract a catalog row goes through', () => {
    for (const { unit, ...item } of shoppingCatalogSeed) {
      const input = { ...item, groupId: null, defaultUnit: unit };
      expect(shoppingCatalogItemInputSchema.safeParse(input).success, item.name).toBe(true);
    }
  });

  // The catalog has a unique name per scope, ignoring case: a repeat would fail every copy.
  it('has no repeated name, ignoring case', () => {
    const names = shoppingCatalogSeed.map(({ name }) => name.toLocaleLowerCase('pt-BR'));
    expect(new Set(names).size).toBe(names.length);
  });

  it('fits in one catalog', () => {
    expect(shoppingCatalogSeed.length).toBeLessThanOrEqual(shoppingRules.maxCatalogItemsPerScope);
  });
});

describe('shoppingDefaults', () => {
  it('steps by a quantity the contract takes', () => {
    for (const step of Object.values(shoppingDefaults.unitStep)) {
      expect(shoppingQuantitySchema.safeParse(step).success).toBe(true);
    }
  });
});
