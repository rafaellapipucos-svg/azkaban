import { authRepository, type Session } from '@azkaban/data';
import { useEffect, useState } from 'react';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authRepository
      .getSession()
      .then(setSession)
      .finally(() => setLoading(false));
    return authRepository.onSessionChange(setSession);
  }, []);

  return { session, loading };
}
