import { useEffect, useState } from 'react';

import type { LatLng } from '@/components/mapShared';
import { supabase } from '@/lib/supabase';

export function useRouteLine(nodeIds: string[]) {
  const key = nodeIds.join('|');
  const [line, setLine] = useState<LatLng[]>([]);

  useEffect(() => {
    if (!nodeIds.length) {
      setLine([]);
      return;
    }
    let cancel = false;
    supabase
      .from('nodes')
      .select('id,latitude,longitude')
      .in('id', nodeIds)
      .then(({ data }) => {
        if (cancel || !data) return;
        const byId = new Map(data.map((row) => [row.id as string, row]));
        const coords = nodeIds.flatMap((id) => {
          const row = byId.get(id);
          const latitude = Number(row?.latitude);
          const longitude = Number(row?.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
          return [{ latitude, longitude }];
        });
        setLine(coords);
      });
    return () => {
      cancel = true;
    };
    // The joined id list is the cache key. The array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return line;
}
