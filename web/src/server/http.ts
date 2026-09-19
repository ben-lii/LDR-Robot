import 'server-only';

import {
  apiErrorSchema,
  type ApiError,
  type ApiErrorCode,
} from '@teleop/protocol';
import { NextResponse } from 'next/server';

export function jsonOk<T>(
  body: T,
  init?: { status?: number; headers?: HeadersInit },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'no-store',
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    },
  });
}

export function jsonError(code: ApiErrorCode, status: number): NextResponse {
  const body: ApiError = apiErrorSchema.parse({ error: code });
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** CSRF defense on top of SameSite=Lax for state-changing POSTs. */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    // Same-origin navigations (e.g. form GET) may omit Origin; require it for POST APIs.
    return false;
  }
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return (
      originUrl.protocol === requestUrl.protocol &&
      originUrl.host === requestUrl.host
    );
  } catch {
    return false;
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
