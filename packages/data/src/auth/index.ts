import type { MagicLinkInput, SignInInput, SignUpInput } from '@azkaban/contracts';
import { createAppLink } from '@azkaban/platform';
import type { Session } from '@supabase/supabase-js';
import { db } from '../client';
import { parseSessionLink } from './link';

export type { Session };

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
    if (error) throw error;
  },

  /** Resolves to true when the session starts now, false when e-mail confirmation comes first. */
  async signUp({ email, password, displayName }: SignUpInput, redirectTo: string) {
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return data.session !== null;
  },

  async sendMagicLink({ email }: MagicLinkInput, redirectTo: string) {
    const { error } = await db().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  },

  /**
   * Native only: the client does not read the URL there (`detectSessionInUrl`). Starts the session
   * a sign-in link carries and resolves to the path inside the app it points at, or `null` when the
   * URL is not one; an expired or used link throws with GoTrue's description.
   */
  async setSessionFromLink(url: string) {
    const link = parseSessionLink(url, createAppLink('/'));
    if (!link) return null;
    if (link.kind === 'error') throw new Error(link.description);
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
