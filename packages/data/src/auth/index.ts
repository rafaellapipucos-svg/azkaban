import { defaults } from '@azkaban/config';
import type { MagicLinkInput, SignInInput, SignUpInput } from '@azkaban/contracts';
import { createAppLink, isWeb, storage } from '@azkaban/platform';
import type { Session } from '@supabase/supabase-js';
import { db } from '../client';
import { withCallFailure } from '../failure';
import { parseSessionLink, tokenUserId } from './link';

export type { Session };

/** `setSessionFromLink` for a link this device did not ask for (BL23-2). */
export const linkNotRequested = 'link_not_requested';
/** `setSessionFromLink` for a link of another account than the one signed in (BL23-2, BL-38). */
export const linkOtherAccount = 'link_other_account';

// BL23-2: when this device last asked GoTrue for an e-mail link, so a link nobody here asked for
// (someone else's tokens) never becomes the session. Native only: the web takes no marker (BL-38, A').
const linkRequestKey = 'azkaban.session-link-requested-at';

async function markLinkRequested() {
  if (isWeb) return;
  await storage.setItem(linkRequestKey, String(Date.now())).catch(() => undefined);
}

/** Whether this device asked for a link within the window; a fresh request is spent here. */
async function takeLinkRequest() {
  const at = Number(await storage.getItem(linkRequestKey).catch(() => null));
  const age = Date.now() - at;
  const fresh = at > 0 && age >= 0 && age <= defaults.sessionLinkRequestMaxAgeMs;
  if (fresh) await storage.removeItem(linkRequestKey);
  return fresh;
}

// Sign-in, sign-up and the magic link throw a `callFailure` code when GoTrue is over its limit,
// unreachable or down (ADR-0012, section 4); its own errors, like wrong credentials, as they come.
export const authRepository = {
  async getSession() {
    const { data, error } = await db().auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onSessionChange(listener: (session: Session | null) => void) {
    const { data } = db().auth.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
  },

  async signIn({ email, password }: SignInInput) {
    const { error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw withCallFailure(error, error.status);
  },

  /** Resolves to true when the session starts now, false when e-mail confirmation comes first. */
  async signUp({ email, password, displayName }: SignUpInput, redirectTo: string) {
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectTo },
    });
    if (error) throw withCallFailure(error, error.status);
    // The confirmation e-mail is a sign-in link too.
    await markLinkRequested();
    return data.session !== null;
  },

  async sendMagicLink({ email }: MagicLinkInput, redirectTo: string) {
    const { error } = await db().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw withCallFailure(error, error.status);
    await markLinkRequested();
  },

  /**
   * Both platforms: the client never reads the URL (`detectSessionInUrl`). Starts the session a
   * sign-in link carries and resolves to the path inside the app it points at, or `null` when the
   * URL is not one; an expired or used link throws with GoTrue's description.
   *
   * Never over another account's session (`linkOtherAccount`, BL23-2 and BL-38). On native, only
   * when this device asked for a link within `sessionLinkRequestMaxAgeMs` too: someone signed out,
   * with no request here, gets `linkNotRequested`. The web asks for no request (BL-38, option A'),
   * so a browser signed out still takes whatever link it opens.
   */
  async setSessionFromLink(
    url: string,
  ): Promise<string | typeof linkNotRequested | typeof linkOtherAccount | null> {
    const link = parseSessionLink(url, createAppLink('/'));
    if (!link) return null;
    if (link.kind === 'error') throw new Error(link.description);
    const { data } = await db().auth.getSession();
    const current = data.session;
    // The same account may refresh its session: the reauthentication link before deleting it.
    if (current && tokenUserId(link.accessToken) !== current.user.id) return linkOtherAccount;
    if (!isWeb && !(await takeLinkRequest())) return current ? link.path : linkNotRequested;
    const { error } = await db().auth.setSession({
      access_token: link.accessToken,
      refresh_token: link.refreshToken,
    });
    if (error) throw error;
    return link.path;
  },

  /** `local` ends only this device's session, for an account the server already deleted. */
  async signOut(scope: 'global' | 'local' = 'global') {
    const { error } = await db().auth.signOut({ scope });
    if (error) throw error;
  },
};
