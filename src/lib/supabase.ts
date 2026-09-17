import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('חסרים פרטי החיבור למסד הנתונים.');
  client ??= createClient(url, key);
  return client;
}

export type Customer = {
  id: string; full_name: string; phone: string; notes: string | null; updated_at: string;
  customer_addresses: { id: string; label: string; address: string; city: string | null; latitude: number | null; longitude: number | null }[];
  appointments: { starts_at: string; status: string }[];
};
export type JobType = { id: string; name: string; default_price: number; default_duration_minutes: number; description: string | null };
