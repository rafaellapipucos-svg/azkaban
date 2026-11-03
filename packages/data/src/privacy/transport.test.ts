import { describe, expect, it } from 'vitest';
import { exportFileName, privacyFailure, retryWait } from './transport';

const preview = {
  blockingGroups: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Casa', memberCount: 3 }],
  soloGroups: [],
};

describe('privacyFailure', () => {
  it('keeps the wait of rate_limited', () => {
    const failure = privacyFailure(429, { error: 'rate_limited', retryAfterSeconds: 3600 });
    expect(failure.code).toBe('rate_limited');
    expect(failure.details.retryAfterSeconds).toBe(3600);
  });

  it('keeps the preview of owns_groups', () => {
    const failure = privacyFailure(409, { error: 'owns_groups', preview });
    expect(failure.code).toBe('owns_groups');
    expect(failure.details.preview).toEqual(preview);
  });

  it('tells reauth_required from a gateway 401 without a body of ours', () => {
    expect(privacyFailure(401, { error: 'reauth_required' }).code).toBe('reauth_required');
    expect(privacyFailure(401, { msg: 'Invalid JWT' }).code).toBe('unauthorized');
  });

  it('turns no answer into network and an unknown body into internal', () => {
    expect(privacyFailure(null, null).code).toBe('network');
    expect(privacyFailure(500, 'oops').code).toBe('internal');
    expect(privacyFailure(500, { error: 'export_failed' }).code).toBe('export_failed');
  });
});

describe('retryWait', () => {
  it('rounds up, in hours from one hour on and in minutes below', () => {
    expect(retryWait(86_399)).toEqual({ unit: 'hours', count: 24 });
    expect(retryWait(3600)).toEqual({ unit: 'hours', count: 1 });
    expect(retryWait(3599)).toEqual({ unit: 'minutes', count: 60 });
    expect(retryWait(61)).toEqual({ unit: 'minutes', count: 2 });
    expect(retryWait(1)).toEqual({ unit: 'minutes', count: 1 });
    expect(retryWait()).toEqual({ unit: 'minutes', count: 1 });
  });
});

describe('exportFileName', () => {
  it('uses the local calendar day, zero padded', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59))).toBe('azkaban-dados-2026-01-05.json');
  });
});
