-- ADR-0008, section 3. Mirrored in packages/contracts/src/notifications.ts (notificationTypeSchema and
-- deliveryChannelSchema). whatsapp exists from now, so Phase 5 adds an implementation, not a value.
create type public.notification_type as enum (
  'task_reminder',
  'occurrence_missed',
  'occurrence_resolved',
  'proof_in_review',
  'proof_disputed'
);

create type public.delivery_channel as enum ('web_push', 'whatsapp');

create type public.notification_outbox_status as enum (
  'pending', 'sending', 'sent', 'failed', 'cancelled', 'expired'
);
