import { supabase } from '@/lib/supabase';

export async function uploadReportPhoto(userId: string, uri: string, mime: string) {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('report-photos').upload(path, buffer, {
    contentType: mime || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl;
}
