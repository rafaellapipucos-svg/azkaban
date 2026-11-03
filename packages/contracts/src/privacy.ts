import { z } from 'zod';
import { idSchema, instantSchema } from './common';

/**
 * "Export my data" (ADR-0012, section 2). The Edge Function `account-export` answers one JSON file.
 * Every section is an array of rows with the database's snake_case columns, minus the columns the
 * ADR leaves out (secrets, hashes, other people's data). A single-row table is an array of 0 or 1.
 */
export const accountExportFormat = 'azkaban-account-export';
export const accountExportVersion = 1;

export const accountExportSections = [
  'account',
  'profile',
  'proof_consents',
  'group_memberships',
  'owned_groups',
  'created_invites',
  'contexts',
  'tasks',
  'occurrences',
  'status_history',
  'rule_changes',
  'proofs',
  'proof_reviews',
  'xp_events',
  'user_stats',
  'user_day_stats',
  'achievements',
  'notifications',
  'notification_preferences',
  'push_subscriptions',
  'phone_verifications',
  'whatsapp_messages',
  'shopping_lists',
  'shopping_list_items',
  'shopping_catalog_items',
] as const;
export type AccountExportSection = (typeof accountExportSections)[number];

const exportRowsSchema = z.array(z.record(z.string(), z.unknown()));

export const accountExportSchema = z.object({
  format: z.literal(accountExportFormat),
  version: z.literal(accountExportVersion),
  generatedAt: instantSchema,
  userId: idSchema,
  /** When the signed links in `proofs[].photo_url` stop working. Null without any photo. */
  photoUrlsExpireAt: instantSchema.nullable(),
  /** Exhaustive: a missing section fails the parse. */
  sections: z.record(z.enum(accountExportSections), exportRowsSchema),
});
export type AccountExport = z.infer<typeof accountExportSchema>;

/**
 * "Delete my account" (ADR-0012, section 3), body of `account-delete`. `dryRun` answers the preview
 * and deletes nothing; the screen shows it before the confirmation.
 */
export const accountDeleteRequestSchema = z.strictObject({ dryRun: z.boolean() });
export type AccountDeleteRequest = z.infer<typeof accountDeleteRequestSchema>;

export const accountDeletePreviewSchema = z.object({
  /** Owned groups with other members. Each must change owner or be deleted first (`owns_groups`). */
  blockingGroups: z.array(
    z.object({ id: idSchema, name: z.string(), memberCount: z.number().int().min(2) }),
  ),
  /** Owned groups with nobody else in them. They go with the account. */
  soloGroups: z.array(z.object({ id: idSchema, name: z.string() })),
});
export type AccountDeletePreview = z.infer<typeof accountDeletePreviewSchema>;

export const accountDeleteResultSchema = z.object({ deleted: z.literal(true) });
export type AccountDeleteResult = z.infer<typeof accountDeleteResultSchema>;

/** What `account-export` and `account-delete` answer on failure, which the UI maps to i18n keys. */
export const privacyErrorCodeSchema = z.enum([
  /** The last sign-in is older than `privacyDefaults.reauthMaxAgeMinutes`: sign in again to delete. */
  'reauth_required',
  /** An owned group still has other members. The body carries the preview. */
  'owns_groups',
  /** `rateLimitRules.actions.data_export`. The body carries `retryAfterSeconds`. */
  'rate_limited',
  'export_failed',
  /** Something failed midway. Repeating is safe: every step skips what is already gone. */
  'delete_failed',
]);
export type PrivacyErrorCode = z.infer<typeof privacyErrorCodeSchema>;

export const privacyErrorSchema = z.object({
  error: privacyErrorCodeSchema,
  retryAfterSeconds: z.number().int().positive().optional(),
  preview: accountDeletePreviewSchema.optional(),
});
export type PrivacyError = z.infer<typeof privacyErrorSchema>;
