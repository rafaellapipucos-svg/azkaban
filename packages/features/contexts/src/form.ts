import type { Area, ContextInput } from '@azkaban/contracts';
import type { FieldErrors } from 'react-hook-form';

/**
 * The area a screen opens on: the one picked, else the one the person came from (its key, as in
 * `/area/home`), else the first. Without an origin the first one is Trabalho, by `sort_order`.
 */
export function pickArea<T extends Pick<Area, 'id' | 'key'>>(
  areas: readonly T[] | undefined,
  { id, key }: { id?: string; key?: string },
): T | undefined {
  return (
    areas?.find((area) => area.id === id) ?? areas?.find((area) => area.key === key) ?? areas?.[0]
  );
}

/**
 * The notice under the form when it does not pass validation, so "Salvar" never fails silently.
 * The area has no field of its own to show an error, so it gets its own text.
 */
export function formErrorKey(errors: FieldErrors<ContextInput>): string | null {
  if (errors.areaId) return 'form.areaMissing';
  return Object.keys(errors).length > 0 ? 'form.invalid' : null;
}
