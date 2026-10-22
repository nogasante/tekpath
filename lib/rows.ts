import { stripColumns } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

type TableName = 'buildings' | 'floors' | 'nodes' | 'edges' | 'features';

export async function insertFlexible(table: TableName, row: Record<string, unknown>, optional: string[], select = 'id') {
  let payload = { ...row };
  const dropped: string[] = [];
  let result = await supabase.from(table).insert(payload).select(select).single();
  while (result.error) {
    const next = stripColumns(payload, result.error.message, optional);
    if (!next) break;
    for (const column of optional) {
      if (column in payload && !(column in next)) dropped.push(column);
    }
    payload = next;
    result = await supabase.from(table).insert(payload).select(select).single();
  }
  return {
    data: (result.data ?? null) as { id: string } | null,
    error: result.error,
    dropped,
  };
}

export async function rowIsPending(table: TableName, id: string) {
  const column = table === 'features' ? 'review_status' : 'status';
  const result = await supabase.from(table).select(column).eq('id', id).maybeSingle();
  if (result.error || !result.data) return false;
  const value = (result.data as Record<string, unknown>)[column];
  return value === 'pending';
}
