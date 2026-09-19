import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportJWK, generateKeyPair } from 'jose';

import { resetServerEnvCache } from '@/lib/env.server';
import { hashPassword } from '@/server/auth/password';
import { resetTokenSigningKeyCache } from '@/server/tokens';
import { loginFailureLimiter } from '@/server/rateLimit';

const ROBOT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (name: string) => {
        const value = store.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        if (value === '') {
          store.delete(name);
          return;
        }
        store.set(name, value);
      },
    }),
    __clearCookies: () => store.clear(),
  };
});

async function clearCookies(): Promise<void> {
  const mod = (await import('next/headers')) as unknown as {
    __clearCookies?: () => void;
  };
  mod.__clearCookies?.();
}

async function installTestEnv(passwordPlain = 'secret'): Promise<void> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = JSON.stringify(await exportJWK(privateKey));
  const passwordHash = await hashPassword(passwordPlain);

  process.env['SESSION_SECRET'] = 'test-session-secret-at-least-32-chars!!';
  process.env['TOKEN_SIGNING_PRIVATE_JWK'] = privateJwk;
  process.env['AUTH_USERS_JSON'] = JSON.stringify([
    {
      email: 'driver@example.com',
      passwordHash,
      permission: 'driver',
      robots: ['robot-1'],
    },
  ]);
  process.env['ROBOTS_JSON'] = JSON.stringify([
    {
      id: ROBOT_ID,
      slug: 'robot-1',
      name: 'Robot 1',
      tunnelHost: 'robot-1.example.com',
    },
  ]);
  process.env['DEV_ROBOT_ORIGIN_OVERRIDE'] = 'http://localhost:8080';
  resetServerEnvCache();
  resetTokenSigningKeyCache();
  loginFailureLimiter.clear();
}

describe('login + session routes', () => {
  beforeEach(async () => {
    await installTestEnv();
    await clearCookies();
  });

  afterEach(() => {
    resetServerEnvCache();
    resetTokenSigningKeyCache();
    loginFailureLimiter.clear();
    vi.resetModules();
  });

  it('login succeeds with correct password and rejects wrong password', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const bad = await POST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'driver@example.com',
          password: 'wrong',
        }),
      }),
    );
    expect(bad.status).toBe(401);

    const ok = await POST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'driver@example.com',
          password: 'secret',
        }),
      }),
    );
    expect(ok.status).toBe(200);
  });

  it('login is rate limited after repeated failures', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(
        new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
            'x-forwarded-for': '1.2.3.4',
          },
          body: JSON.stringify({
            email: 'driver@example.com',
            password: 'wrong',
          }),
        }),
      );
      expect(res.status).toBe(401);
    }
    const limited = await POST(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          'x-forwarded-for': '1.2.3.4',
        },
        body: JSON.stringify({
          email: 'driver@example.com',
          password: 'wrong',
        }),
      }),
    );
    expect(limited.status).toBe(429);
  }, 20_000);

  it('session route returns 401 without cookie and 404 without access', async () => {
    const { POST: login } = await import('@/app/api/auth/login/route');
    const { POST: session } =
      await import('@/app/api/robots/[slug]/session/route');

    const noCookie = await session(
      new Request('http://localhost:3000/api/robots/robot-1/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          clientSessionId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      }),
      { params: Promise.resolve({ slug: 'robot-1' }) },
    );
    expect(noCookie.status).toBe(401);

    await login(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          email: 'driver@example.com',
          password: 'secret',
        }),
      }),
    );

    const missing = await session(
      new Request('http://localhost:3000/api/robots/nope/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          clientSessionId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      }),
      { params: Promise.resolve({ slug: 'nope' }) },
    );
    expect(missing.status).toBe(404);

    const ok = await session(
      new Request('http://localhost:3000/api/robots/robot-1/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          clientSessionId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      }),
      { params: Promise.resolve({ slug: 'robot-1' }) },
    );
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      permission: string;
      urls: { ws: string };
      token: string;
    };
    expect(body.permission).toBe('driver');
    expect(body.urls.ws).toBe('ws://localhost:8080/ws');
    expect(body.token.length).toBeGreaterThan(20);
  }, 20_000);
});
