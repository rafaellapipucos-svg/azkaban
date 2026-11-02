/** Tunables of this module (PROMPT_MESTRE 5.1: each module has its own config). */
export const notificationsConfig = {
  /** How long a notification that arrives with the app open stays up, in ms. */
  toastMs: 6000,
  /** Where this browser remembers which account turned push on, and its row. */
  thisDeviceKey: 'notifications.thisDevice',
} as const;
