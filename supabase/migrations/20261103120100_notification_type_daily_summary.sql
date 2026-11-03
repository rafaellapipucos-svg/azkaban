-- ADR-0009, section 13: daily_summary joins notificationTypeSchema. Alone in its migration, because a
-- value added to an enum cannot be used in the transaction that adds it.
alter type public.notification_type add value 'daily_summary';
