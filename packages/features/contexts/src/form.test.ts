import { contextInputSchema } from '@azkaban/contracts';
import { describe, expect, it } from 'vitest';
import { formErrorKey, pickArea } from './form';

const areas = [
  { id: 'w', key: 'work' },
  { id: 'h', key: 'home' },
];

describe('pickArea', () => {
  it('opens on the area the person came from', () => {
    expect(pickArea(areas, { key: 'home' })?.id).toBe('h');
  });

  it('keeps Trabalho, the first, when there is no origin or it is unknown', () => {
    expect(pickArea(areas, {})?.id).toBe('w');
    expect(pickArea(areas, { key: 'nope' })?.id).toBe('w');
  });

  it('lets the picked chip win over the origin', () => {
    expect(pickArea(areas, { id: 'w', key: 'home' })?.id).toBe('w');
  });

  it('has nothing to pick from an empty or loading list', () => {
    expect(pickArea([], { key: 'home' })).toBeUndefined();
    expect(pickArea(undefined, {})).toBeUndefined();
  });
});

describe('formErrorKey', () => {
  const valid = {
    areaId: 'w',
    groupId: null,
    name: 'Casa',
    colorToken: 'violet',
    icon: '🏠',
    location: null,
  };
  // The form's errors come from this schema, through zodResolver: one key per failing field.
  const errorsOf = (input: object) => {
    const result = contextInputSchema.safeParse(input);
    return Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), { type: issue.code }]),
    );
  };

  it('says nothing when the form is valid', () => {
    expect(formErrorKey(errorsOf(valid))).toBeNull();
  });

  it('asks for an area when none was chosen, as when the list came empty', () => {
    expect(formErrorKey(errorsOf({ ...valid, areaId: '' }))).toBe('form.areaMissing');
    expect(formErrorKey(errorsOf({ ...valid, areaId: '', name: '' }))).toBe('form.areaMissing');
  });

  it('points to the marked fields when the name is empty', () => {
    expect(formErrorKey(errorsOf({ ...valid, name: '  ' }))).toBe('form.invalid');
  });
});
