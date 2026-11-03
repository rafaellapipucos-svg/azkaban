import { describe, expect, it, vi } from 'vitest';
import { activateOnSpace } from './keyboard.web';

type FakeKey = { key: string; repeat?: boolean; target?: object; currentTarget?: object };

function press(onActivate: (() => void) | undefined, init: FakeKey) {
  const self = {};
  const event = {
    target: self,
    currentTarget: self,
    ...init,
    preventDefault: vi.fn(),
  };
  // The handler is typed for a native event; a browser one is what it gets on web.
  (activateOnSpace(onActivate).onKeyDown as unknown as (e: typeof event) => void)?.(event);
  return event;
}

describe('activateOnSpace', () => {
  it('activates on Space and keeps the page from scrolling', () => {
    const onActivate = vi.fn();
    const event = press(onActivate, { key: ' ' });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('ignores other keys, key repeat and keys that bubble up from a child', () => {
    const onActivate = vi.fn();
    press(onActivate, { key: 'Enter' }); // react-native-web already handles Enter
    press(onActivate, { key: ' ', repeat: true });
    press(onActivate, { key: ' ', target: {} });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('adds no handler for a disabled control', () => {
    expect(activateOnSpace(undefined)).toEqual({});
  });
});
