import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();

  const secureCookie = request.url.startsWith('https://');
  const token = await getToken({
    req: request,
    secret,
    secureCookie,
    cookieName: secureCookie ? '__Secure-authjs.session-token' : 'authjs.session-token',
    salt: secureCookie ? '__Secure-authjs.session-token' : 'authjs.session-token',
  });

  const protectedPaths = ['/', '/scan', '/bewaren', '/agent', '/gemist'];
  const isProtected = protectedPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/'),
  );

  const isAuthPath = request.nextUrl.pathname.startsWith('/login');

  if (isProtected && !token) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthPath && token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
};
