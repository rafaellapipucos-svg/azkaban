import type { ReactElement, Ref } from 'react';
import type { ProofPhoto, ProofStamp } from './photo';

export type CameraFacing = 'front' | 'back';

/**
 * `prompt`: the system may be asking right now. `granted`: the preview is live and `capture` works.
 * `denied`: the user said no, so the way forward is the system settings. `unavailable`: no usable camera.
 */
export type CameraPermission = 'prompt' | 'granted' | 'denied' | 'unavailable';

export type CameraUnavailableReason =
  | 'no_device'
  | 'in_use'
  /** Web only: `getUserMedia` needs HTTPS or localhost. */
  | 'insecure_context'
  | 'unsupported'
  | 'error';

export type CameraStatus = { permission: CameraPermission; reason?: CameraUnavailableReason };

export type ProofCameraHandle = {
  /**
   * Takes the frame now, resizes it to the proof limits, writes the stamp on the pixels, encodes the JPEG
   * and hashes it. Rejects with `PhotoError`. Keeps nothing on disk that the caller can reach.
   */
  capture: (stamp: ProofStamp) => Promise<ProofPhoto>;
};

export type ProofCameraProps = {
  facing: CameraFacing;
  /** Accessible name of the preview, already translated. */
  label: string;
  /** Called on every change of state, starting with `prompt`. */
  onStatusChange?: (status: CameraStatus) => void;
  ref?: Ref<ProofCameraHandle>;
};

/**
 * Live camera preview that fills its parent, and nothing else: no picker, no gallery, no file input.
 * Web (`ProofCamera.web.tsx`) uses `getUserMedia` and stops the stream on unmount, which turns the
 * camera light off. Native (`ProofCamera.native.tsx`) uses expo-camera. Change `facing` to switch
 * cameras; remount with a new `key` to ask again after a refusal. Metro never loads this file, see
 * the note in `DateTimeInput.tsx`.
 */
export function ProofCamera(props: ProofCameraProps): ReactElement {
  throw new Error(`ProofCamera (${props.facing}) has no adapter for this platform.`);
}
