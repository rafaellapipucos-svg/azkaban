import { proofLocationSchema, proofPlatformSchema } from '@azkaban/contracts';
import type { ProofChallenge, ProofLocation, ProofResult } from '@azkaban/contracts';
import {
  proofFailureCode,
  proofRepository,
  tasksRepository,
  type ProofFailureCode,
} from '@azkaban/data';
import {
  appVersion,
  getLocationPermission,
  readLocation,
  type ProofPhoto,
} from '@azkaban/platform';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useRefreshProofs } from './hooks';
import { proofRecovery } from './recovery';

export type ProofOutcome = Pick<ProofResult, 'reviewStatus' | 'late' | 'flags'>;

export type FlowStage =
  | { name: 'starting' }
  | { name: 'consent' }
  | { name: 'location' }
  | { name: 'locating' }
  | { name: 'camera'; failure: ProofFailureCode | null }
  | { name: 'confirm'; photo: ProofPhoto; failure: ProofFailureCode | null }
  | { name: 'sending'; photo: ProofPhoto }
  | { name: 'expired' }
  | { name: 'done'; outcome: ProofOutcome }
  | { name: 'stopped'; failure: ProofFailureCode };

/**
 * The capture, in the order of ADR-0007: notice, challenge, location, camera, photo, `proof-validate`.
 * The photo lives only in this state. The server's answer is what makes the task green, and after a
 * failure the occurrence is read again, because the answer may be what got lost.
 */
export function useProofFlow(occurrenceId: string, online: boolean) {
  const refresh = useRefreshProofs();
  const [stage, setStage] = useState<FlowStage>({ name: 'starting' });
  const challenge = useRef<ProofChallenge | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout>>(undefined);
  // `undefined` until decided, so a second photo does not ask again.
  const location = useRef<ProofLocation | null | undefined>(undefined);
  const started = useRef(false);

  const dropChallenge = () => {
    challenge.current = null;
    clearTimeout(expiry.current);
  };

  const issue = async () => {
    const next = await proofRepository.issueChallenge(occurrenceId);
    dropChallenge();
    challenge.current = next;
    expiry.current = setTimeout(() => {
      challenge.current = null;
      // A photo already on its way belongs to the challenge it took with it.
      setStage((now) =>
        now.name === 'sending' || now.name === 'done' || now.name === 'stopped'
          ? now
          : { name: 'expired' },
      );
    }, next.expiresInSeconds * 1000);
    return next;
  };

  const locate = async () => {
    setStage({ name: 'locating' });
    const reading = await readLocation();
    // The contract is stricter than a device can be, and a bad reading counts as none.
    const parsed = proofLocationSchema.safeParse(reading.status === 'ok' ? reading.location : null);
    location.current = parsed.success ? parsed.data : null;
    setStage({ name: 'camera', failure: null });
  };

  const toCamera = async (failure: ProofFailureCode | null) => {
    try {
      const { checkLocation } = await issue();
      if (!checkLocation || location.current !== undefined) {
        return setStage({ name: 'camera', failure });
      }
      const permission = await getLocationPermission();
      if (permission === 'granted') return await locate();
      if (permission === 'prompt') return setStage({ name: 'location' });
      location.current = null; // refused before, or no sensor: nothing to ask
      setStage({ name: 'camera', failure });
    } catch (error) {
      await recover(error, null);
    }
  };

  const recover = async (error: unknown, photo: ProofPhoto | null) => {
    const failure = proofFailureCode(error);
    const fresh = await tasksRepository.getOccurrence(occurrenceId).catch(() => null);
    if (fresh?.item.status === 'done') {
      await refresh();
      return setStage({
        name: 'done',
        outcome: {
          reviewStatus: fresh.item.proofReviewStatus ?? 'unreviewed',
          late: fresh.item.late,
          flags: [],
        },
      });
    }
    await refresh();
    const recovery = proofRecovery[failure];
    if (recovery === 'consent') return setStage({ name: 'consent' });
    if (recovery === 'stop') return setStage({ name: 'stopped', failure });
    if (recovery === 'new_photo') return toCamera(failure);
    setStage(photo ? { name: 'confirm', photo, failure } : { name: 'stopped', failure });
  };

  const start = async () => {
    setStage({ name: 'starting' });
    try {
      if (await proofRepository.consentPending()) return setStage({ name: 'consent' });
    } catch (error) {
      return recover(error, null);
    }
    await toCamera(null);
  };

  useEffect(() => {
    if (!online || started.current) return;
    started.current = true;
    void start();
    // Once, when there is a connection. `start` belongs to this render only.
  }, [online]);

  useEffect(() => dropChallenge, []);

  const acceptConsent = async () => {
    setStage({ name: 'starting' });
    try {
      await proofRepository.recordConsent();
    } catch (error) {
      return recover(error, null);
    }
    await toCamera(null);
  };

  const skipLocation = () => {
    location.current = null;
    setStage({ name: 'camera', failure: null });
  };

  const photoTaken = (photo: ProofPhoto) => {
    // The challenge ran out while the frame was being encoded: the stage already says so.
    if (challenge.current) setStage({ name: 'confirm', photo, failure: null });
  };

  // A failed attempt spent the challenge, and a new photo must be taken under a new one.
  const retake = () =>
    challenge.current ? setStage({ name: 'camera', failure: null }) : void toCamera(null);

  const send = async (photo: ProofPhoto) => {
    setStage({ name: 'sending', photo });
    try {
      // A kept photo goes with a new challenge: one attempt per nonce.
      const { nonce } = challenge.current ?? (await issue());
      dropChallenge();
      const result = await proofRepository.submit({
        bytes: photo.bytes,
        meta: {
          nonce,
          sha256: photo.sha256,
          capturedAtDevice: photo.capturedAt,
          location: location.current ?? null,
          platform: proofPlatformSchema.parse(Platform.OS),
          appVersion,
        },
      });
      await refresh();
      setStage({ name: 'done', outcome: result });
    } catch (error) {
      await recover(error, photo);
    }
  };

  return { stage, start, acceptConsent, locate, skipLocation, photoTaken, retake, send };
}
