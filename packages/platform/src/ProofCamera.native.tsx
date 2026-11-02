import { Camera, CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { Image, PixelRatio, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import {
  PhotoError,
  encodeWithinLimits,
  fitLongEdge,
  photoLimits,
  type ProofPhoto,
  type ProofStamp,
} from './photo';
import type { CameraStatus, ProofCameraHandle, ProofCameraProps } from './ProofCamera';
import { sha256Hex } from './sha256';
import { stampLines, stampMetrics } from './stamp';

declare const atob: (data: string) => string; // Hermes has it; the shared tsconfig has no DOM lib

/** expo-camera always writes the raw photo to the cache. Losing this race must not cost the proof. */
function discardRawPhoto(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // The system owns the cache: the file goes with it.
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The raw photo of expo-camera, waiting for its stamp and its JPEG. */
type Stage = {
  uri: string;
  width: number;
  height: number;
  lines: string[];
  capturedAt: string;
  settle: { resolve: (photo: ProofPhoto) => void; reject: (error: unknown) => void };
};

export function ProofCamera({ facing, label, onStatusChange, ref }: ProofCameraProps) {
  const camera = useRef<CameraView>(null);
  const stageView = useRef<ComponentRef<typeof View>>(null);
  const ready = useRef(false);
  const busy = useRef(false);
  const [allowed, setAllowed] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const notify = useRef(onStatusChange);
  notify.current = onStatusChange;

  const report = (status: CameraStatus) => {
    ready.current = status.permission === 'granted';
    notify.current?.(status);
  };

  useEffect(() => {
    let cancelled = false;
    const say = (status: CameraStatus) => {
      if (!cancelled) report(status);
    };
    say({ permission: 'prompt' });
    (async () => {
      try {
        if (!(await CameraView.isAvailableAsync())) {
          return say({ permission: 'unavailable', reason: 'no_device' });
        }
        let permission = await Camera.getCameraPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          permission = await Camera.requestCameraPermissionsAsync();
        }
        if (!permission.granted) return say({ permission: 'denied' });
        if (!cancelled) setAllowed(true); // the preview mounts, and `onCameraReady` reports `granted`
      } catch {
        say({ permission: 'unavailable', reason: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      ready.current = false;
    };
    // `report` reads refs only.
  }, []);

  useImperativeHandle(
    ref,
    (): ProofCameraHandle => ({
      capture: async (stamp: ProofStamp) => {
        if (!ready.current || !camera.current || busy.current) throw new PhotoError('not_ready');
        busy.current = true;
        let rawUri: string | undefined;
        try {
          const capturedAt = new Date();
          const picture = await camera.current.takePictureAsync({
            quality: 1,
            exif: false,
            shutterSound: false,
          });
          rawUri = picture.uri;
          const lines = stampLines({ ...stamp, capturedAt });
          return await new Promise<ProofPhoto>((resolve, reject) =>
            setStage({
              uri: picture.uri,
              width: picture.width,
              height: picture.height,
              lines,
              capturedAt: capturedAt.toISOString(),
              settle: { resolve, reject },
            }),
          );
        } finally {
          setStage(null);
          busy.current = false;
          if (rawUri) discardRawPhoto(rawUri);
        }
      },
    }),
    [],
  );

  // The stamp is drawn over the photo in a view, and view-shot reads the view back as a JPEG. The view is
  // laid out in dp so that dp times the screen density is the target size in pixels: view-shot then
  // renders at that size, with no larger bitmap to shrink afterwards.
  const encodeStage = async (s: Stage) => {
    try {
      const { bytes, width, height } = await encodeWithinLimits(s, photoLimits, async (step) => {
        const base64 = await captureRef(stageView, {
          format: 'jpg',
          quality: step.quality,
          result: 'base64',
          width: step.width,
          height: step.height,
        });
        return decodeBase64(base64);
      });
      s.settle.resolve({
        bytes,
        mimeType: 'image/jpeg',
        width,
        height,
        sha256: await sha256Hex(bytes),
        capturedAt: s.capturedAt,
      });
    } catch (error) {
      s.settle.reject(error);
    }
  };

  const ratio = PixelRatio.get();
  const target = stage ? fitLongEdge(stage, photoLimits.longEdgePx) : null;
  const metrics = target ? stampMetrics(target.width, target.height) : null;

  return (
    <View style={styles.root} accessibilityLabel={label}>
      {/* Under the preview, which covers it. */}
      {stage && target && metrics ? (
        <View
          ref={stageView}
          collapsable={false}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: target.width / ratio,
            height: target.height / ratio,
          }}
        >
          <Image
            source={{ uri: stage.uri }}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
            onLoad={() => void encodeStage(stage)}
            onError={() =>
              stage.settle.reject(new PhotoError('encode_failed', 'photo did not load'))
            }
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              padding: metrics.padding / ratio,
            }}
          >
            {stage.lines.map((line, i) => (
              <Text
                key={i}
                numberOfLines={1}
                ellipsizeMode="tail"
                allowFontScaling={false}
                style={{
                  color: '#ffffff',
                  fontSize: metrics.fontSize / ratio,
                  lineHeight: metrics.lineHeight / ratio,
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {allowed ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="picture"
          animateShutter={false}
          onCameraReady={() => report({ permission: 'granted' })}
          onMountError={() => report({ permission: 'unavailable', reason: 'error' })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#000000' },
});
