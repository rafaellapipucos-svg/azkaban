// The `t` that buildPushPayload expects, with the semantics of i18next that the app uses: keys with
// dots, `{{name}}` interpolation without escaping, and `count` choosing `_zero` for 0 (zero takes the
// plural, ADR-0012, section 17, item 10), then `_one`, `_other` and the other forms of Intl.PluralRules.
// i18next itself would be one more npm download and init per cold start for the four features the push
// texts use. No imports, so Node tests it against the real JSON.

export type Messages = { [key: string]: string | Messages };
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export function makeTranslate(messages: Messages, locale: string): Translate {
  const plural = new Intl.PluralRules(locale);
  const lookup = (key: string): string | undefined => {
    let node: string | Messages | undefined = messages;
    for (const part of key.split('.')) {
      if (typeof node !== 'object') return undefined;
      node = node[part];
    }
    return typeof node === 'string' ? node : undefined;
  };
  return (key, values) => {
    const count = values?.count;
    const forms =
      typeof count === 'number'
        ? [
            ...(count === 0 ? [`${key}_zero`] : []),
            `${key}_${plural.select(count)}`,
            `${key}_other`,
          ]
        : [];
    const text = [...forms, key].map(lookup).find((found) => found !== undefined) ?? key;
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
      values && name in values ? String(values[name]) : match,
    );
  };
}
