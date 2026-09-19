import { SESSION_COOKIE_NAME } from '@teleop/protocol';
import { NextResponse, type NextRequest } from 'next/server';

import { getServerEnv } from '@/lib/env.server';
import { verifySessionToken } from '@/server/auth/session';
import { findUserByEmail } from '@/server/auth/users';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isApi = pathname.startsWith('/api/');

  if (!token) {
    return unauthenticated(request, isApi);
  }

  try {
    getServerEnv();
  } catch {
    if (isApi) {
      return NextResponse.json(
        { error: 'server_error' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const claims = await verifySessionToken(token);
  if (!claims || !findUserByEmail(claims.sub)) {
    return unauthenticated(request, isApi);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-teleop-email', claims.sub);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

function unauthenticated(request: NextRequest, isApi: boolean): NextResponse {
  if (isApi) {
    return NextResponse.json(
      { error: 'unauthenticated' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const login = new URL('/login', request.url);
  if (request.nextUrl.pathname !== '/') {
    login.searchParams.set('next', request.nextUrl.pathname);
  }
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
