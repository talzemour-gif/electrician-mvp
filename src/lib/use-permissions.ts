'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export function usePermissions() {
  const [canDelete, setCanDelete] = useState(false);
  useEffect(() => {
    let active = true;
    getSupabase().from('app_members').select('role').maybeSingle()
      .then(({ data }) => { if (active) setCanDelete(data?.role === 'admin'); });
    return () => { active = false; };
  }, []);
  return { canDelete };
}
