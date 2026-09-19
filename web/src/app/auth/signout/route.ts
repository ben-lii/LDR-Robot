import { NextResponse } from 'next/server';

import { clearSessionCookie } from '@/server/auth/session';
import { originAllowed } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) {
    return NextResponse.json(
      { error: 'bad_request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
