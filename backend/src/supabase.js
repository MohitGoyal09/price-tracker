import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) console.warn('[supabase] SUPABASE_URL / SERVICE_KEY missing — set env vars (see README).');

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'placeholder');
