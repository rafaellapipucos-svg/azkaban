import { safeInternalPath } from '@azkaban/core';
import { authRepository, linkNotRequested, linkOtherAccount } from '@azkaban/data';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

/** `/sign-in?link=…` after a sign-in link GoTrue no longer takes: expired or already used. */
export const expiredLinkParam = 'expired';
/** `/sign-in?link=…` after a sign-in link this device did not ask for (BL23-2). */
export const notRequestedLinkParam = 'not-requested';
/** `/profile?link=…` after a sign-in link of another account than the one signed in (BL-38). */
export const otherAccountLinkParam = 'other-account';

/**
 * Both platforms (ADR-0012 section 11, BL-38): starts the session a sign-in link opened the app
 * with, then goes to the link's path, or to the sign-in screen when the link no longer serves. A
 * link of another account goes to the profile, which says so. On the web, replacing the route also
 * drops the tokens from the address bar. `ready` is when the root layout renders its navigator:
 * navigating before it throws. Mount once, in the root layout.
 */
export function useSessionFromLink(ready: boolean) {
  const router = useRouter();
  const [target, setTarget] = useState<string>();

  useEffect(() => {
    const open = (url: string | null | undefined) => {
      if (!url) return;
      authRepository
        .setSessionFromLink(url)
        .then((path) => {
          if (path === linkNotRequested) setTarget(`/sign-in?link=${notRequestedLinkParam}`);
          else if (path === linkOtherAccount) setTarget(`/profile?link=${otherAccountLinkParam}`);
          else if (path !== null) setTarget(path);
        })
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
