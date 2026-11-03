// Flags let unfinished work merge into main without being reachable.
export const features = {
  // Native push (ADR-0012, section 11): on once push_subscriptions has a kind and dispatch sends Expo tokens.
  nativePush: false,
} as const satisfies Record<string, boolean>;
