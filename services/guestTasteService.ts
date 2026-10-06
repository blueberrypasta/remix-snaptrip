import { supabase } from './supabaseClient';

let memoryGuestId: string | null = null;

export function getGuestTasteId(): string {
  const key = 'slaptrip_guest_taste_id';
  try {
    let id = localStorage.getItem(key);
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return id;
    }
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    if (!memoryGuestId) memoryGuestId = crypto.randomUUID();
    return memoryGuestId;
  }
}

export async function tasteRequestHeaders(): Promise<Record<string, string>> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!anonKey) throw new Error('configuration_missing');

  const base = { apikey: anonKey, 'Content-Type': 'application/json' };
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error('login_required');

  if (session?.access_token) {
    return { ...base, Authorization: `Bearer ${session.access_token}` };
  }
  return { ...base, 'X-Guest-Taste-Id': getGuestTasteId() };
}

export async function getGuestTasteRemaining(): Promise<number> {
  const headers = await tasteRequestHeaders();
  const url = `${(import.meta.env.VITE_SUPABASE_URL || 'https://cshxkzgpuurursnhejnw.supabase.co')}/functions/v1/qloo-proxy`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'guest_status' }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'guest_quota_unavailable');
    const n = data.guestRemaining;
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error('invalidresponse:value');
    return n;
  } finally {
    clearTimeout(timeout);
  }
}

export function notifyGuestTasteRemaining(n: number): void {
  if (typeof window === 'undefined' || !Number.isInteger(n) || n < 0 || n > 10) return;
  window.dispatchEvent(new CustomEvent('slaptrip-guest-taste-remaining', { detail: n }));
}

export async function ensureTasteAccess(): Promise<void> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error('login_required');
  if (session) return;

  const remaining = await getGuestTasteRemaining();
  if (remaining === 0) {notifyGuestTasteRemaining(0);throw new Error('guest_limit_reached');}
}
