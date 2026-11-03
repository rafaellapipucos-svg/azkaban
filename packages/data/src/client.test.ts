import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { functionRetryFetch } from './client';

vi.mock('@azkaban/platform', () => ({ isWeb: true, storage: {} }));

const api = 'http://127.0.0.1:54321';
const fn = `${api}/functions/v1/proof-validate`;

// A fake `fetch` that answers each status in turn and keeps what it was sent.
function fake(...answers: (number | Error)[]) {
  return vi.fn<typeof fetch>(async () => {
    const next = answers.shift() ?? 200;
    if (next instanceof Error) throw next;
    return new Response(String(next), { status: next });
  });
}

// Runs the call while the fake clock walks through the waits.
async function run(promise: Promise<Response>) {
  const settled = promise.then(
    (response) => ({ response }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return settled;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('functionRetryFetch', () => {
  it('sends a function call again after each wait until it stops getting 503', async () => {
    const base = fake(503, 503, 200);
    const result = await run(functionRetryFetch(api, base)(fn, { method: 'POST' }));
    expect(result).toMatchObject({ response: { status: 200 } });
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('waits each configured delay before sending again', async () => {
    const base = fake(503, 503, 200);
    const call = functionRetryFetch(api, base)(fn);
    await vi.advanceTimersByTimeAsync(499);
    expect(base).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(base).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1499);
    expect(base).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect((await call).status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('gives back the last 503 after two retries', async () => {
    const base = fake(503, 503, 503, 200);
    const result = await run(functionRetryFetch(api, base)(fn));
    expect(result).toMatchObject({ response: { status: 503 } });
    expect(base).toHaveBeenCalledTimes(3);
  });

  it.each([500, 502, 504, 546, 429])(
    'does not send a function call again on %i',
    async (status) => {
      const base = fake(status, 200);
      const result = await run(functionRetryFetch(api, base)(fn));
      expect(result).toMatchObject({ response: { status } });
      expect(base).toHaveBeenCalledTimes(1);
    },
  );

  it('gives back a network error as it came', async () => {
    const failure = new TypeError('Failed to fetch');
    const base = fake(failure, 200);
    const result = await run(functionRetryFetch(api, base)(fn));
    expect(result).toEqual({ error: failure });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it.each([
    `${api}/rest/v1/tasks?select=*`,
    `${api}/auth/v1/token?grant_type=password`,
    `${api}/storage/v1/object/proofs/a.jpg`,
    `http://other.example/functions/v1/proof-validate`,
  ])('does not send %s again on 503', async (url) => {
    const base = fake(503, 200);
    const result = await run(functionRetryFetch(api, base)(url));
    expect(result).toMatchObject({ response: { status: 503 } });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('matches the functions address however the API URL is written', async () => {
    const base = fake(503, 200);
    const result = await run(
      functionRetryFetch(
        'HTTP://LocalHost:54321/',
        base,
      )('http://localhost:54321/functions/v1/proof-validate'),
    );
    expect(result).toMatchObject({ response: { status: 200 } });
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('sends the same method, headers and ArrayBuffer body again', async () => {
    const base = fake(503, 200);
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer;
    const headers = new Headers({ 'Content-Type': 'image/jpeg', Authorization: 'Bearer t' });
    await run(functionRetryFetch(api, base)(fn, { method: 'POST', headers, body: photo }));
    expect(base).toHaveBeenCalledTimes(2);
    const [first, second] = base.mock.calls;
    expect(second).toEqual(first);
    expect(second?.[1]?.body).toBe(photo);
    expect(new Uint8Array(second?.[1]?.body as ArrayBuffer)).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    );
  });

  it('does not send a ReadableStream body again', async () => {
    const base = fake(503, 200);
    // A real stream (React Native's types have none, so it comes from the global).
    const { ReadableStream: Stream } = globalThis as unknown as {
      ReadableStream: new (source: { start: (c: { close: () => void }) => void }) => object;
    };
    const body = new Stream({ start: (controller) => controller.close() }) as RequestInit['body'];
    const result = await run(functionRetryFetch(api, base)(fn, { method: 'POST', body }));
    expect(result).toMatchObject({ response: { status: 503 } });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('stops without sending again when the signal aborts during the wait', async () => {
    const base = fake(503, 200);
    const controller = new AbortController();
    const call = functionRetryFetch(api, base)(fn, { signal: controller.signal });
    const settled = call.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await settled).toBe(controller.signal.reason);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('stops without sending again when the signal was already aborted', async () => {
    const base = fake(503, 200);
    const controller = new AbortController();
    controller.abort();
    const result = await run(functionRetryFetch(api, base)(fn, { signal: controller.signal }));
    expect(result).toEqual({ error: controller.signal.reason });
    expect(base).toHaveBeenCalledTimes(1);
  });
});
