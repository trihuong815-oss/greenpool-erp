import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function proxy(req: NextRequest) {
  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // QUAN TRỌNG: dùng getUser() để refresh token nếu cần
  const { data: { user } } = await supabase.auth.getUser();

  const isLoginPage = req.nextUrl.pathname.startsWith('/login');
  const isPublicAsset = req.nextUrl.pathname.startsWith('/_next')
    || req.nextUrl.pathname.startsWith('/api')
    || req.nextUrl.pathname.endsWith('.svg')
    || req.nextUrl.pathname.endsWith('.png')
    || req.nextUrl.pathname.endsWith('.ico');

  if (!user && !isLoginPage && !isPublicAsset) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
