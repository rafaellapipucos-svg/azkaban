import { proofDefaults, proofRules } from '@azkaban/config';
import { describe, expect, it } from 'vitest';
import {
  PhotoError,
  compressionPlan,
  encodeWithinLimits,
  fitLongEdge,
  photoLimits,
  readJpegSize,
  type PhotoLimits,
} from './photo';

/** SOI, an APP0 segment, SOF0 with the size, EOI: enough for the header checks, not a decodable image. */
function jpeg(width: number, height: number, padding = 0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255];
  const rest = [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([
    0xff,
    0xd8,
    ...app0,
    ...sof,
    ...rest,
    ...new Array(padding).fill(0),
    0xff,
    0xd9,
  ]);
}

describe('photoLimits', () => {
  it('come from the shared proof config', () => {
    expect(photoLimits).toEqual({
      longEdgePx: proofDefaults.captureLongEdgePx,
      quality: proofDefaults.captureJpegQuality,
      maxBytes: proofRules.maxBytes,
      minEdgePx: proofRules.minEdgePx,
      maxEdgePx: proofRules.maxEdgePx,
    });
  });
});

describe('fitLongEdge', () => {
  it('shrinks to the long edge and keeps the proportion', () => {
    expect(fitLongEdge({ width: 4000, height: 3000 }, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitLongEdge({ width: 3000, height: 4000 }, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never scales up', () => {
    expect(fitLongEdge({ width: 640, height: 480 }, 1600)).toEqual({ width: 640, height: 480 });
  });
});

describe('readJpegSize', () => {
  it('reads the size from the SOF marker', () => {
    expect(readJpegSize(jpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
    expect(readJpegSize(jpeg(300, 65000))).toEqual({ width: 300, height: 65000 });
  });

  it('rejects what is not a JPEG', () => {
    expect(readJpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
    expect(readJpegSize(new Uint8Array(0))).toBeNull();
    expect(readJpegSize(jpeg(10, 10).slice(0, 12))).toBeNull(); // cut before the SOF
  });
});

describe('compressionPlan', () => {
  const limits: PhotoLimits = { ...photoLimits, quality: 0.8 };

  it('lowers the quality first and the size after', () => {
    const plan = compressionPlan({ width: 1600, height: 1200 }, limits);
    expect(plan.slice(0, 3)).toEqual([
      { width: 1600, height: 1200, quality: 0.8 },
      { width: 1600, height: 1200, quality: 0.68 },
      { width: 1600, height: 1200, quality: 0.56 },
    ]);
    expect(plan[3]).toMatchObject({ width: 1280, height: 960 });
  });

  it('never plans an edge under the minimum', () => {
    const plan = compressionPlan({ width: 400, height: 330 }, limits);
    expect(plan.every((s) => Math.min(s.width, s.height) >= 320 || s.width === 400)).toBe(true);
    expect(plan).toHaveLength(3); // only the target size survives
  });
});

describe('encodeWithinLimits', () => {
  it('returns the first encoding that fits and reports the size read from its bytes', async () => {
    const seen: number[] = [];
    const result = await encodeWithinLimits(
      { width: 4000, height: 3000 },
      photoLimits,
      async (s) => {
        seen.push(s.quality);
        return jpeg(s.width, s.height);
      },
    );
    expect(seen).toEqual([0.8]);
    expect(result).toMatchObject({ width: 1600, height: 1200 });
  });

  it('retries smaller when the bytes exceed the limit', async () => {
    const limits: PhotoLimits = { ...photoLimits, maxBytes: 100 };
    const steps: string[] = [];
    const result = await encodeWithinLimits({ width: 1600, height: 1200 }, limits, async (s) => {
      steps.push(`${s.width}@${s.quality}`);
      return jpeg(s.width, s.height, s.quality < 0.6 ? 0 : 500);
    });
    expect(steps).toEqual(['1600@0.8', '1600@0.68', '1600@0.56']);
    expect(result.bytes.length).toBeLessThanOrEqual(100);
  });

  it('fails with too_large when nothing fits', async () => {
    const limits: PhotoLimits = { ...photoLimits, maxBytes: 10 };
    await expect(
      encodeWithinLimits({ width: 1600, height: 1200 }, limits, async (s) =>
        jpeg(s.width, s.height),
      ),
    ).rejects.toMatchObject({ code: 'too_large' });
  });

  it('refuses a source that is already under the minimum', async () => {
    await expect(
      encodeWithinLimits({ width: 640, height: 200 }, photoLimits, async () => jpeg(640, 200)),
    ).rejects.toMatchObject({ code: 'too_small' });
  });

  it('refuses output that is not a complete JPEG inside the limits', async () => {
    const run = (make: () => Uint8Array) =>
      encodeWithinLimits({ width: 1600, height: 1200 }, photoLimits, async () => make());
    await expect(run(() => Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).rejects.toBeInstanceOf(
      PhotoError,
    );
    await expect(run(() => jpeg(1600, 1200).slice(0, -2))).rejects.toMatchObject({
      code: 'encode_failed',
    });
    await expect(run(() => jpeg(4000, 3000))).rejects.toMatchObject({ code: 'encode_failed' });
  });
});
