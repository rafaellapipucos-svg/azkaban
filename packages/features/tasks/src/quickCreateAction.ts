export type QuickCreateAction = 'wait' | 'open' | 'newContext';

/**
 * What the "Nova tarefa" button does. Only a settled, empty list sends the person to create a
 * context: while the contexts load, an empty list says nothing yet. A failed load opens the sheet,
 * which shows the error and a retry, instead of asking someone who has contexts to make one.
 */
export function quickCreateAction(query: {
  isPending: boolean;
  isError: boolean;
  count: number;
}): QuickCreateAction {
  if (query.count > 0 || query.isError) return 'open';
  if (query.isPending) return 'wait';
  return 'newContext';
}
