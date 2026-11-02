import { describe, expect, it } from 'vitest';
import {
  ProofError,
  failureOfResponse,
  failureOfRpc,
  proofFailureCode,
  reachableUrl,
} from './transport';

describe('failureOfResponse', () => {
  it('keeps the codes of the contract and the local transport codes', () => {
    expect(failureOfResponse(422, { error: 'proof_hash_mismatch' })).toBe('proof_hash_mismatch');
    expect(failureOfResponse(408, { error: 'upload_timeout' })).toBe('upload_timeout');
    expect(failureOfResponse(405, { error: 'method_not_allowed' })).toBe('method_not_allowed');
    expect(failureOfResponse(400, { error: 'invalid_request' })).toBe('invalid_request');
  });

  it('reads the status of what the gateway or the runtime sent', () => {
    expect(failureOfResponse(401, { code: 401, message: 'Missing authorization' })).toBe(
      'unauthorized',
    );
    expect(failureOfResponse(546, null)).toBe('internal');
    expect(failureOfResponse(502, { error: 'not_a_code' })).toBe('internal');
  });
});

describe('failureOfRpc', () => {
  it('takes the code from the message', () => {
    expect(failureOfRpc({ code: 'P0001', message: 'challenge_rate_limited' })).toBe(
      'challenge_rate_limited',
    );
    expect(failureOfRpc({ code: '42501', message: 'forbidden' })).toBe('forbidden');
  });

  it('tells a defect from a request that got no answer', () => {
    expect(failureOfRpc({ code: '22023', message: 'invalid_consent_version' })).toBe('internal');
    expect(failureOfRpc({ code: '', message: 'TypeError: Failed to fetch' })).toBe('network');
  });
});

describe('proofFailureCode', () => {
  it('reads a ProofError and treats anything else as internal', () => {
    expect(proofFailureCode(new ProofError('network'))).toBe('network');
    expect(proofFailureCode(new Error('boom'))).toBe('internal');
  });
});

describe('reachableUrl', () => {
  const path = 'storage/v1/object/sign/task-proofs/a/b.jpg?token=abc';

  it('moves the local gateway to the address of the API, keeping the path and the query', () => {
    expect(reachableUrl(`http://kong:8000/${path}`, 'http://127.0.0.1:54421')).toBe(
      `http://127.0.0.1:54421/${path}`,
    );
    expect(reachableUrl(`http://kong:8000/${path}`, 'http://127.0.0.1:54421/')).toBe(
      `http://127.0.0.1:54421/${path}`,
    );
  });

  it('leaves a hosted URL exactly as it came', () => {
    const hosted = `https://abc.supabase.co/${path}`;
    expect(reachableUrl(hosted, 'https://abc.supabase.co')).toBe(hosted);
    // Only the exact gateway moves, not a host that merely starts the same way.
    const lookalike = `http://kong:8000.example.com/${path}`;
    expect(reachableUrl(lookalike, 'https://abc.supabase.co')).toBe(lookalike);
  });
});
