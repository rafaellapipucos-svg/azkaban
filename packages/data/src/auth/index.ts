import type { MagicLinkInput, SignInInput, SignUpInput } from '@azkaban/contracts';
import type { Session } from '@supabase/supabase-js';
import { db } from '../client';

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

  /** `local` ends only this device's session, for an account the server already deleted. */
  async signOut(scope: 'global' | 'local' = 'global') {
    const { error } = await db().auth.signOut({ scope });
    if (error) throw error;
  },
};
