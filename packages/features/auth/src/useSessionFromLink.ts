import { safeInternalPath } from '@azkaban/core';
import { authRepository } from '@azkaban/data';
import { isWeb } from '@azkaban/platform';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

/** `/sign-in?link=…` after a sign-in link GoTrue no longer takes: expired or already used. */
export const expiredLinkParam = 'expired';

/**
 * Native only (ADR-0012, section 11): starts the session a sign-in link opened the app with, then
 * goes to the link's path, or to the sign-in screen when the link no longer serves. The web client
 * reads the URL itself. `ready` is when the root layout renders its navigator: navigating before it
 * throws. Mount once, in the root layout.
 */
export function useSessionFromLink(ready: boolean) {
  const router = useRouter();
  const [target, setTarget] = useState<string>();

  useEffect(() => {
    if (isWeb) return;
    const open = (url: string | null | undefined) => {
      if (!url) return;
      authRepository
        .setSessionFromLink(url)
        .then((path) => path !== null && setTarget(path))
        // Expired or used: the sign-in screen says so and offers another link. Someone already
        // signed in has nothing to do there.
        .catch(async () => {
          if (!(await authRepository.getSession().catch(() => null)))
            setTarget(`/sign-in?link=${expiredLinkParam}`);
        });
    };
    void Linking.getInitialURL().then(open);
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready || target === undefined) return;
    setTarget(undefined);
    router.replace((safeInternalPath(target) ?? '/') as Href);
  }, [ready, target, router]);
}
