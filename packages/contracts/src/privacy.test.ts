import { describe, expect, it } from 'vitest';
import {
  accountDeletePreviewSchema,
  accountDeleteRequestSchema,
  accountExportFormat,
  accountExportSchema,
  accountExportSections,
  accountExportVersion,
} from './privacy';

const id = '11111111-1111-4111-8111-111111111111';

const fullExport = (): { sections: Record<string, unknown> } & Record<string, unknown> => ({
  format: accountExportFormat,
  version: accountExportVersion,
  generatedAt: '2026-11-03T12:00:00+00:00',
  userId: id,
  photoUrlsExpireAt: null,
  sections: Object.fromEntries(accountExportSections.map((section) => [section, []])),
});

describe('accountExportSchema', () => {
  it('takes an export with every section, even empty', () => {
    expect(accountExportSchema.safeParse(fullExport()).success).toBe(true);
  });

  it('refuses an export missing a section', () => {
    const value = fullExport();
    delete value.sections.proofs;
    expect(accountExportSchema.safeParse(value).success).toBe(false);
  });

  it('refuses a section that is not a list of rows', () => {
    const value = fullExport();
    value.sections.profile = { id };
    expect(accountExportSchema.safeParse(value).success).toBe(false);
  });

  it('has no repeated section', () => {
    expect(new Set(accountExportSections).size).toBe(accountExportSections.length);
  });
});

describe('account deletion', () => {
  it('needs dryRun and nothing else', () => {
    expect(accountDeleteRequestSchema.safeParse({ dryRun: true }).success).toBe(true);
    expect(accountDeleteRequestSchema.safeParse({}).success).toBe(false);
    expect(accountDeleteRequestSchema.safeParse({ dryRun: false, userId: id }).success).toBe(false);
  });

  it('counts at least two members in a blocking group', () => {
    const group = { id, name: 'Casa', memberCount: 1 };
    expect(
      accountDeletePreviewSchema.safeParse({ blockingGroups: [group], soloGroups: [] }).success,
    ).toBe(false);
  });
});
