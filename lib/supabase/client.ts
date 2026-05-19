// Client-side Supabase client (dùng trong Client Components)
// Sử dụng @supabase/ssr — hỗ trợ format key mới (sb_publishable_*)
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
