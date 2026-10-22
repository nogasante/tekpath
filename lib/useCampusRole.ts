import { useEffect, useState } from 'react';

import { useAppState } from '@/context/AppState';
import { normalizeRole, type CampusRole } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

export function useCampusRole() {
  const { session } = useAppState();
  const [role, setRole] = useState<CampusRole | null>(null);

  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setRole(null);
          return;
        }
        setRole(normalizeRole(data?.role));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return role;
}
