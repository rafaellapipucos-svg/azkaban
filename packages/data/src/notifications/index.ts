import {
  notificationErrorCodeSchema,
  notificationItemSchema,
  pushDeviceSchema,
  quietHoursSchema,
  type DeliveryChannel,
  type NotificationErrorCode,
  type NotificationItem,
  type NotificationPreference,
  type NotificationType,
  type OccurrenceStatus,
  type PushDevice,
  type PushSubscriptionInput,
  type QuietHours,
} from '@azkaban/contracts';
import { currentUserId, db } from '../client';

/**
 * A line of the bell, and whether its task asks for a photo, which picks the tap target. The
 * occurrence's `overdueAt` and status, read now, say until when a red can still be done.
 */
export type BellItem = NotificationItem & {
  requiresPhoto: boolean;
  overdueAt: string | null;
  occurrenceStatus: OccurrenceStatus | null;
};

/** The RPC raises its code as the message. Anything else, `invalid_push_subscription` included, is generic. */
export function notificationErrorCode(error: unknown): NotificationErrorCode | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? error.message : null;
  const parsed = notificationErrorCodeSchema.safeParse(message);
  return parsed.success ? parsed.data : null;
}

// The title comes through RLS: an occurrence or task the user no longer sees embeds as null.
const bellColumns =
  'id, type, occurrence_id, data, created_at, read_at, task_occurrences(overdue_at, status, tasks(title, requires_photo_proof))';
// `push_subscriptions` has grants by column: `select *` fails, and the endpoint never leaves.
const deviceColumns = 'id, user_agent, created_at, last_success_at';

type BellRow = {
  id: string;
  type: NotificationType;
  occurrence_id: string | null;
  data: unknown;
  created_at: string;
  read_at: string | null;
  task_occurrences: {
    overdue_at: string;
    status: OccurrenceStatus;
    tasks: { title: string; requires_photo_proof: boolean } | null;
  } | null;
};

// A row the client cannot read (a type from a newer server) is left out instead of failing the list.
function toBellItem(row: BellRow): BellItem | null {
  const occurrence = row.task_occurrences;
  const task = occurrence?.tasks ?? null;
  const parsed = notificationItemSchema.safeParse({
    id: row.id,
    type: row.type,
    occurrenceId: row.occurrence_id,
    data: row.data,
    createdAt: row.created_at,
    readAt: row.read_at,
    taskTitle: task?.title ?? null,
  });
  return parsed.success
    ? {
        ...parsed.data,
        requiresPhoto: task?.requires_photo_proof ?? false,
        overdueAt: occurrence?.overdue_at ?? null,
        occurrenceStatus: occurrence?.status ?? null,
      }
    : null;
}

/** `22:00:00` from Postgres, `22:00` for the contract. */
const hhmm = (time: string) => time.slice(0, 5);

export const notificationsRepository = {
  // ponytail: no page, the bell keeps 30 days (`inboxRetentionDays`). Paginate if that grows.
  async list(): Promise<BellItem[]> {
    const { data, error } = await db()
      .from('notifications')
      .select(bellColumns)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data as unknown as BellRow[]).map(toBellItem).filter((item) => item !== null);
  },

  async get(id: string): Promise<BellItem | null> {
    const { data, error } = await db()
      .from('notifications')
      .select(bellColumns)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toBellItem(data as unknown as BellRow) : null;
  },

  async unreadCount(): Promise<number> {
    const { count, error } = await db()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (error) throw error;
    return count ?? 0;
  },

  async markRead(id: string) {
    const { error } = await db()
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null);
    if (error) throw error;
  },

  async markAllRead() {
    const { error } = await db()
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    if (error) throw error;
  },

  /** Any insert or update of the user's bell rows. Realtime checks the select policy per row. */
  subscribe(userId: string, onChange: (event: { type: 'insert' | 'update'; id: string }) => void) {
    const channel = db()
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { id?: string };
          if (payload.eventType === 'DELETE' || !row.id) return;
          onChange({ type: payload.eventType === 'INSERT' ? 'insert' : 'update', id: row.id });
        },
      )
      .subscribe();
    return () => void db().removeChannel(channel);
  },

  /** Only the rows the user chose; the rest follows `notificationRules.defaultChannels`. */
  async listPreferences(): Promise<NotificationPreference[]> {
    const { data, error } = await db()
      .from('notification_preferences')
      .select('type, channel, enabled');
    if (error) throw error;
    return data;
  },

  async setPreference({
    type,
    channel,
    enabled,
  }: {
    type: NotificationType;
    channel: DeliveryChannel;
    enabled: boolean;
  }) {
    // `user_id` comes from its default, `auth.uid()`.
    const { error } = await db()
      .from('notification_preferences')
      // ponytail: cast until the migration of `banco-de-dados` adds `daily_summary` to the enum and
      // regenerates `database.types.ts`; then drop it. Before that, the database refuses the row.
      .upsert(
        { type: type as Exclude<NotificationType, 'daily_summary'>, channel, enabled },
        {
          onConflict: 'user_id,type,channel',
        },
      );
    if (error) throw error;
  },

  async getQuietHours(): Promise<QuietHours> {
    const { data, error } = await db()
      .from('profiles')
      .select('quiet_hours_start, quiet_hours_end')
      .eq('id', await currentUserId())
      .single();
    if (error) throw error;
    return data.quiet_hours_start && data.quiet_hours_end
      ? { start: hhmm(data.quiet_hours_start), end: hhmm(data.quiet_hours_end) }
      : null;
  },

  async setQuietHours(value: QuietHours) {
    const hours = quietHoursSchema.parse(value);
    const { error } = await db()
      .from('profiles')
      .update({ quiet_hours_start: hours?.start ?? null, quiet_hours_end: hours?.end ?? null })
      .eq('id', await currentUserId());
    if (error) throw error;
  },

  async listDevices(): Promise<PushDevice[]> {
    const { data, error } = await db()
      .from('push_subscriptions')
      .select(deviceColumns)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((row) =>
      pushDeviceSchema.parse({
        id: row.id,
        userAgent: row.user_agent,
        createdAt: row.created_at,
        lastSuccessAt: row.last_success_at,
      }),
    );
  },

  /** Idempotent by endpoint: the same browser under another account moves to it. Returns the row id. */
  async registerDevice({ endpoint, keys, userAgent }: PushSubscriptionInput): Promise<string> {
    const { data, error } = await db().rpc('register_push_subscription', {
      p_endpoint: endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      // The function turns a blank label into null.
      p_user_agent: userAgent ?? '',
    });
    if (error) throw error;
    return data;
  },

  async removeDevice(id: string) {
    const { error } = await db().from('push_subscriptions').delete().eq('id', id);
    if (error) throw error;
  },
};
