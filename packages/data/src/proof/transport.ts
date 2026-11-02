import { proofErrorCodeSchema, type ProofErrorCode } from '@azkaban/contracts';

/**
 * Local to the client (ADR-0007, section 19): what the proof functions answer outside the contract,
 * plus `network` for a request that got no answer at all.
 */
const transportCodes = [
  'unauthorized',
  'invalid_request',
  'method_not_allowed',
  'internal',
] as const;
export type ProofTransportCode = (typeof transportCodes)[number];
export type ProofFailureCode = ProofErrorCode | ProofTransportCode | 'network';

const isTransportCode = (value: unknown): value is ProofTransportCode =>
  (transportCodes as readonly unknown[]).includes(value);

export class ProofError extends Error {
  constructor(
    readonly code: ProofFailureCode,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = 'ProofError';
  }
}

export const proofFailureCode = (error: unknown): ProofFailureCode =>
  error instanceof ProofError ? error.code : 'internal';

/** A response of a proof function. The gateway and the runtime answer with bodies of their own. */
export function failureOfResponse(status: number, body: unknown): ProofFailureCode {
  const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
  const known = proofErrorCodeSchema.safeParse(error);
  if (known.success) return known.data;
  if (isTransportCode(error)) return error;
  return status === 401 ? 'unauthorized' : 'internal';
}

/** The RPCs raise the code as `message`. Without a SQLSTATE, the database never answered. */
export function failureOfRpc(error: { message?: string; code?: string }): ProofFailureCode {
  const known = proofErrorCodeSchema.safeParse(error.message);
  if (known.success) return known.data;
  return error.code ? 'internal' : 'network';
}

// The functions run in Docker, where the local stack's own address is its gateway's. No hosted project
// has this name, and it is the only host the browser cannot reach.
const localGateway = 'http://kong:8000/';

/** The signed URL as this device must ask for it. Anything but the local gateway is left alone. */
export function reachableUrl(signedUrl: string, apiUrl: string): string {
  if (!signedUrl.startsWith(localGateway)) return signedUrl;
  return `${apiUrl.replace(/\/+$/, '')}/${signedUrl.slice(localGateway.length)}`;
}
