// Unit tests of the pure parts of proof-validate: the JPEG shape, the place, the clock and the body
// reader. They run in Node (`pnpm functions:test`) with no stack. Each rejection has its positive.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readLimited } from '../_shared/body.ts';
import { clockMismatch, haversineM, inspectJpeg, judgeLocation } from './checks.ts';
import { makeJpeg } from './jpeg-fixture.ts';

const photo = (widthPx = 640, heightPx = 480) => makeJpeg({ widthPx, heightPx, salt: 'unit' });

describe('inspectJpeg', () => {
  test('reads the size of a whole JPEG from its frame header', () => {
    assert.deepEqual(inspectJpeg(photo(640, 480)), { widthPx: 640, heightPx: 480 });
    assert.deepEqual(inspectJpeg(photo(2048, 320)), { widthPx: 2048, heightPx: 320 });
  });

  test('a comment ahead of the frame does not hide it', () => {
    const big = makeJpeg({ widthPx: 640, heightPx: 480, totalBytes: 300_000 });
    assert.equal(big.length, 300_000);
    assert.deepEqual(inspectJpeg(big), { widthPx: 640, heightPx: 480 });
  });

  test('refuses what does not start like a JPEG, or does not end like one', () => {
    const ok = photo();
    assert.deepEqual(inspectJpeg(ok), { widthPx: 640, heightPx: 480 });
    assert.equal(
      inspectJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      'bad_type',
    );
    assert.equal(inspectJpeg(new TextEncoder().encode('<html>not a photo</html>')), 'bad_type');
    assert.equal(inspectJpeg(ok.subarray(0, ok.length - 2)), 'bad_type');
    assert.equal(inspectJpeg(ok.subarray(0, 100)), 'bad_type');
    assert.equal(inspectJpeg(new Uint8Array(0)), 'bad_type');
  });

  test('refuses a segment that runs past the end, and a frame cut before the scan', () => {
    const ok = photo();
    const cut = Uint8Array.from([...ok.subarray(0, 40), 0xff, 0xd9]);
    assert.equal(inspectJpeg(cut), 'bad_type');
  });

  test('a scan with no frame before it has no size', () => {
    const noFrame = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0xff, 0xd9]);
    assert.deepEqual(inspectJpeg(noFrame), { widthPx: 0, heightPx: 0 });
  });

  test('reports the size it reads, however large, for the range check to refuse', () => {
    const huge = photo();
    // The frame header: the fixture puts height and width right after "FF C0 00 0B 08".
    const at = huge.findIndex((b, i) => b === 0xff && huge[i + 1] === 0xc0);
    huge.set([0xff, 0xff, 0xff, 0xff], at + 5);
    assert.deepEqual(inspectJpeg(huge), { widthPx: 65535, heightPx: 65535 });
  });
});

describe('judgeLocation', () => {
  const place = { lat: -23.55, lng: -46.63, radiusM: 150 };
  const rules = { maxLocationAccuracyM: 200, outOfRadius: 'flag' };
  const at = (northM: number, accuracyM = 10) => ({
    lat: place.lat + northM / 111_195,
    lng: place.lng,
    accuracyM,
  });

  test('inside the radius: a distance, no flag', () => {
    const verdict = judgeLocation(place, at(100), rules);
    assert.deepEqual(verdict.flags, []);
    assert.ok(Math.abs(verdict.distanceM! - 100) <= 1);
    assert.equal(verdict.accuracyM, 10);
    assert.equal(verdict.blocked, false);
  });

  test('outside the radius: flagged, and not blocked under flag', () => {
    const verdict = judgeLocation(place, at(1000), rules);
    assert.deepEqual(verdict.flags, ['out_of_radius']);
    assert.equal(verdict.blocked, false);
  });

  test('the imprecision favours the user: distance minus accuracy decides', () => {
    assert.deepEqual(judgeLocation(place, at(300, 190), rules).flags, []);
    assert.deepEqual(judgeLocation(place, at(300, 100), rules).flags, ['out_of_radius']);
  });

  test('no reading, or a reading worse than the limit, is location_missing', () => {
    assert.deepEqual(judgeLocation(place, null, rules).flags, ['location_missing']);
    const poor = judgeLocation(place, at(0, 201), rules);
    assert.deepEqual(poor.flags, ['location_missing']);
    assert.equal(poor.distanceM, null);
    assert.deepEqual(judgeLocation(place, at(0, 200), rules).flags, []);
  });

  test('without a place on the context the claim is ignored', () => {
    const verdict = judgeLocation(null, at(5000), { ...rules, outOfRadius: 'block' });
    assert.deepEqual(verdict, { distanceM: null, accuracyM: null, flags: [], blocked: false });
  });

  test('under block, both flags refuse, and an inside reading does not', () => {
    const block = { ...rules, outOfRadius: 'block' };
    assert.equal(judgeLocation(place, at(1000), block).blocked, true);
    assert.equal(judgeLocation(place, null, block).blocked, true);
    assert.equal(judgeLocation(place, at(100), block).blocked, false);
  });

  test('haversine: one degree of latitude is about 111 km', () => {
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    assert.ok(Math.abs(d - 111_195) < 50);
  });
});

describe('clockMismatch', () => {
  const issued = 1_000_000_000_000;
  const received = issued + 60_000;
  test('inside the window, or within the tolerance outside it, is fine', () => {
    assert.equal(clockMismatch(issued + 30_000, issued, received, 120), false);
    assert.equal(clockMismatch(issued - 100_000, issued, received, 120), false);
    assert.equal(clockMismatch(received + 100_000, issued, received, 120), false);
  });
  test('beyond the tolerance, either way, is a mismatch', () => {
    assert.equal(clockMismatch(received + 10 * 60_000, issued, received, 120), true);
    assert.equal(clockMismatch(issued - 10 * 60_000, issued, received, 120), true);
  });
});

describe('readLimited', () => {
  const stream = (chunks: Uint8Array[], then?: () => Promise<void>) =>
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else if (then) await then();
        else controller.close();
      },
    });

  test('a body at the limit passes, and one byte more does not', async () => {
    const at = await readLimited(stream([new Uint8Array(40), new Uint8Array(60)]), 100, 1000);
    assert.equal(at.kind, 'ok');
    assert.equal(at.kind === 'ok' && at.bytes.length, 100);
    const over = await readLimited(stream([new Uint8Array(40), new Uint8Array(61)]), 100, 1000);
    assert.deepEqual(over, { kind: 'too_large' });
  });

  test('stops pulling once the limit is crossed, however much more the sender has', async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(10));
      },
    });
    assert.deepEqual(await readLimited(endless, 100, 1000), { kind: 'too_large' });
    // The queue of a stream may read ahead a little; it must not run on.
    assert.ok(pulled <= 14, `pulled ${pulled} chunks`);
  });

  test('a body that stalls ends at the time limit', async () => {
    const stalled = stream([new Uint8Array(10)], () => new Promise(() => {}));
    const began = Date.now();
    assert.deepEqual(await readLimited(stalled, 100, 80), { kind: 'timeout' });
    assert.ok(Date.now() - began < 1000);
  });

  test('a sender that fails midway is aborted, and no body is ok', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    assert.deepEqual(await readLimited(broken, 100, 1000), { kind: 'aborted' });
    assert.deepEqual(await readLimited(null, 100, 1000), { kind: 'ok', bytes: new Uint8Array(0) });
  });
});
