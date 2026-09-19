import 'server-only';

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_S } from '@teleop/protocol';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

import { getServerEnv } from '@/lib/env.server';

const SESSION_ALG = 'HS256';

export type SessionClaims = {
  readonly sub: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getServerEnv().sessionSecret);
}

export async function signSessionToken(
  email: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const nowS = Math.floor(nowMs / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: SESSION_ALG })
    .setSubject(email.toLowerCase())
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + SESSION_MAX_AGE_S)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
  nowMs: number = Date.now(),
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [SESSION_ALG],
      currentDate: new Date(nowMs),
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return null;
    }
    return { sub: payload.sub.toLowerCase() };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(getServerEnv().nodeEnv === 'production'),
  );
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, '', {
    ...sessionCookieOptions(getServerEnv().nodeEnv === 'production'),
    maxAge: 0,
  });
}

export async function readSessionTokenFromCookies(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Verifies cookie JWT. Does not re-check AUTH_USERS_JSON (callers must). */
export async function getSessionFromCookies(
  nowMs: number = Date.now(),
): Promise<SessionClaims | null> {
  const token = await readSessionTokenFromCookies();
  if (!token) {
    return null;
  }
  return verifySessionToken(token, nowMs);
}
