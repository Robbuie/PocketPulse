import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is meant to ship to the browser; Row Level
// Security decides what each signed-in user can read and write. Both values
// come from the environment so the same build can point at another project.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const IS_CFG = Boolean(url && key);
export const sb = IS_CFG ? createClient(url, key) : null;
