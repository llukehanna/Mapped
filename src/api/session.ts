import { useEffect, useState } from 'react';
import { api } from './client.ts';
import type { User } from './types.ts';

/** The signed-in player: undefined while loading, null when signed out (or offline). */
export function useSession() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api.me().then(
      (r) => setUser(r.user),
      () => setUser(null),
    );
  }, []);
  const signOut = async () => {
    await api.signOut().catch(() => undefined);
    setUser(null);
  };
  return { user, setUser, signOut };
}
