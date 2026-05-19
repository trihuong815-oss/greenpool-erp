// Server-side Supabase client (dùng trong Server Components, Route Handlers)
// Sử dụng @supabase/ssr — hỗ trợ format key mới (sb_publishable_*)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component có thể không set được cookie — middleware sẽ refresh
          }
        },
      },
    }
  );
}
