import { useEffect, useState } from 'react';
import type { SpaceActivation } from './keyboard';

// No DOM lib in the shared tsconfig, so the few browser types used here are declared by hand.
type Focusable = { focus: () => void; isConnected: boolean };
type KeyEvent = {
  key: string;
  repeat?: boolean;
  target: unknown;
  currentTarget: unknown;
  preventDefault: () => void;
};
declare const document: { activeElement: Focusable | null };

export function activateOnSpace(onActivate: (() => void) | undefined): SpaceActivation {
  if (!onActivate) return {};
  return {
    onKeyDown: (raw) => {
      const event = raw as unknown as KeyEvent;
      // A child that takes keys itself (an input inside a row) keeps its Space.
      if ((event.key !== ' ' && event.key !== 'Spacebar') || event.target !== event.currentTarget) {
        return;
      }
      event.preventDefault(); // the page would scroll otherwise
      if (!event.repeat) onActivate();
    },
  };
}

export function useRestoreFocus(): void {
  // Read while rendering, before the dialog's children mount: one of them may take focus
  // (autoFocus) in the same commit, so an effect would already see it there.
  const [before] = useState(() => document.activeElement);
  useEffect(
    () => () => {
      if (before?.isConnected) before.focus();
    },
    [before],
  );
}
