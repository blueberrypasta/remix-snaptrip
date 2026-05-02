
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cshxkzgpuurursnhejnw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzaHhremdwdXVydXJzbmhlam53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTQ4MzcsImV4cCI6MjA4MTY3MDgzN30.dvlrmevMyOr-OwqFTzQGPe_ntc0R3oeNpUoUkNa2DLA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'snaptrip-auth-token-v2',
    storage: window.localStorage,
    debug: false
  }
});
