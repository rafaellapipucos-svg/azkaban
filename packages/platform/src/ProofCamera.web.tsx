import { useEffect, useImperativeHandle, useRef } from 'react';
import {
  PhotoError,
  encodeWithinLimits,
  photoLimits,
  type ProofPhoto,
  type ProofStamp,
} from './photo';
// Types only: at run time Metro resolves './ProofCamera' to this very file on web.
import type {
  CameraStatus,
  CameraUnavailableReason,
  ProofCameraHandle,
  ProofCameraProps,
} from './ProofCamera';
import { sha256Hex } from './sha256';
import { layoutStamp, stampLines } from './stamp';

function failure(error: unknown): CameraStatus {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return { permission: 'denied' };
  }
  const reason: CameraUnavailableReason =
    name === 'NotFoundError' || name === 'OverconstrainedError'
      ? 'no_device'
      : name === 'NotReadableError' || name === 'AbortError'
        ? 'in_use'
        : 'error';
  return { permission: 'unavailable', reason };
}

function stopStream(stream: MediaStream | null) {
  // Each track must be stopped: dropping the stream leaves the camera, and its light, on.
  stream?.getTracks().forEach((track) => track.stop());
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function takePhoto(video: HTMLVideoElement, stamp: ProofStamp): Promise<ProofPhoto> {
  const capturedAt = new Date();
  // One full-size copy of the frame: every attempt below scales from it, so a retry shows the same instant.
  const frame = document.createElement('canvas');
  frame.width = video.videoWidth;
  frame.height = video.videoHeight;
  frame.getContext('2d')?.drawImage(video, 0, 0);
  const lines = stampLines({ ...stamp, capturedAt });
  try {
    const { bytes, width, height } = await encodeWithinLimits(
      { width: frame.width, height: frame.height },
      photoLimits,
      async (step) => {
        const canvas = document.createElement('canvas');
        canvas.width = step.width;
        canvas.height = step.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new PhotoError('encode_failed', 'no 2d canvas');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(frame, 0, 0, step.width, step.height);
        const layout = layoutStamp(step.width, step.height, lines, (text, fontSize) => {
          ctx.font = `${fontSize}px sans-serif`;
          return ctx.measureText(text).width;
        });
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(layout.band.x, layout.band.y, layout.band.width, layout.band.height);
        ctx.font = `${layout.fontSize}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffffff';
        for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);
        const blob = await toBlob(canvas, step.quality);
        canvas.width = 0; // lets the browser free the pixels now
        if (!blob) throw new PhotoError('encode_failed', 'toBlob returned nothing');
        return new Uint8Array(await blob.arrayBuffer());
      },
    );
    return {
      bytes,
      mimeType: 'image/jpeg',
      width,
      height,
      sha256: await sha256Hex(bytes),
      capturedAt: capturedAt.toISOString(),
    };
  } finally {
    frame.width = 0;
  }
}

export function ProofCamera({ facing, label, onStatusChange, ref }: ProofCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef(false);
  const notify = useRef(onStatusChange);
  notify.current = onStatusChange;

  useImperativeHandle(
    ref,
    (): ProofCameraHandle => ({
      capture: async (stamp) => {
        const el = video.current;
        if (!live.current || !el || el.videoWidth === 0) throw new PhotoError('not_ready');
        return takePhoto(el, stamp);
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const report = (status: CameraStatus) => {
      if (cancelled) return; // a stale effect (facing changed, or unmounted) must not touch the new one
      live.current = status.permission === 'granted';
      notify.current?.(status);
    };
    report({ permission: 'prompt' });

    (async () => {
      if (!globalThis.isSecureContext) {
        return report({ permission: 'unavailable', reason: 'insecure_context' });
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        return report({ permission: 'unavailable', reason: 'unsupported' });
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing === 'front' ? 'user' : 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) return stopStream(stream); // unmounted while the prompt was open
        const el = video.current;
        if (!el) return stopStream(stream);
        el.srcObject = stream;
        stream.getVideoTracks().forEach((track) =>
          track.addEventListener('ended', () => {
            report({ permission: 'unavailable', reason: 'in_use' }); // unplugged, or revoked in the browser
          }),
        );
        await el.play();
        report({ permission: 'granted' });
      } catch (error) {
        stopStream(stream);
        report(failure(error));
      }
    })();

    return () => {
      cancelled = true;
      live.current = false;
      stopStream(stream);
      if (video.current) video.current.srcObject = null;
    };
  }, [facing]);

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#000000',
      }}
    >
      <video
        ref={video}
        aria-label={label}
        playsInline
        muted
        autoPlay
        style={{
          width: '100%',
          height: '100%',
          // `contain` shows the whole frame, which is exactly what `capture` takes.
          objectFit: 'contain',
          // The selfie preview is a mirror; the photo is not.
          transform: facing === 'front' ? 'scaleX(-1)' : undefined,
        }}
      />
    </div>
  );
}
