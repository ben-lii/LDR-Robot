import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetServerEnvCache } from '@/lib/env.server';
import { buildRobotUrls } from '@/server/robotUrls';
import { StaticIceProvider } from '@/server/ice';
import { MemoryRateLimiter } from '@/server/rateLimit';
import { signSessionToken, verifySessionToken } from '@/server/auth/session';
import {
  findUserByEmail,
  listRobotsForUser,
  userCanAccessRobot,
  verifyLoginCredentials,
} from '@/server/auth/users';
import { hashPassword } from '@/server/auth/password';
import { signControlToken, resetTokenSigningKeyCache } from '@/server/tokens';
import { getAccessibleRobot } from '@/server/robots';
import { audienceFor, controlTokenClaimsSchema } from '@teleop/protocol';
import { exportJWK, generateKeyPair, decodeJwt } from 'jose';

const ROBOT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function installTestEnv(passwordPlain = 'secret'): Promise<void> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = JSON.stringify(await exportJWK(privateKey));
  const passwordHash = await hashPassword(passwordPlain);

  process.env['SESSION_SECRET'] = 'test-session-secret-at-least-32-chars!!';
  process.env['TOKEN_SIGNING_PRIVATE_JWK'] = privateJwk;
  process.env['AUTH_USERS_JSON'] = JSON.stringify([
    {
      email: 'Driver@Example.com',
      passwordHash,
      permission: 'driver',
      robots: ['robot-1'],
    },
    {
      email: 'viewer@example.com',
      passwordHash,
      permission: 'viewer',
      robots: '*',
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
  delete process.env['DEV_ROBOT_ORIGIN_OVERRIDE'];
  resetServerEnvCache();
  resetTokenSigningKeyCache();
}

describe('buildRobotUrls', () => {
  it('uses tunnel host in production', () => {
    expect(
      buildRobotUrls({
        tunnelHost: 'robot-1.example.com',
        nodeEnv: 'production',
        devRobotOriginOverride: 'http://localhost:8080',
      }),
    ).toEqual({
      ws: 'wss://robot-1.example.com/ws',
      whep: 'https://robot-1.example.com/whep',
      status: 'https://robot-1.example.com/status',
    });
  });

  it('honors DEV_ROBOT_ORIGIN_OVERRIDE only outside production', () => {
    expect(
      buildRobotUrls({
        tunnelHost: 'robot-1.example.com',
        nodeEnv: 'development',
        devRobotOriginOverride: 'http://localhost:8080',
      }),
    ).toEqual({
      ws: 'ws://localhost:8080/ws',
      whep: 'http://localhost:8080/whep',
      status: 'http://localhost:8080/status',
    });
  });
});

describe('StaticIceProvider', () => {
  it('defaults to public STUN servers', () => {
    const servers = new StaticIceProvider().getIceServers();
    expect(servers.length).toBeGreaterThan(0);
    const urls = servers[0]?.urls;
    expect(urls).toBeTruthy();
  });
});

describe('MemoryRateLimiter', () => {
  it('allows up to the limit then blocks', () => {
    let now = 0;
    const limiter = new MemoryRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => now,
    });
    expect(limiter.isLimited('a')).toBe(false);
    expect(limiter.recordFailure('a')).toBe(true);
    expect(limiter.recordFailure('a')).toBe(true);
    expect(limiter.isLimited('a')).toBe(true);
    expect(limiter.recordFailure('a')).toBe(false);
    now = 1000;
    expect(limiter.isLimited('a')).toBe(false);
  });
});

describe('session + users + tokens', () => {
  beforeEach(async () => {
    await installTestEnv();
  });

  afterEach(() => {
    resetServerEnvCache();
    resetTokenSigningKeyCache();
  });

  it('signs and verifies a session cookie JWT', async () => {
    const now = Date.UTC(2026, 0, 1);
    const token = await signSessionToken('me@example.com', now);
    const claims = await verifySessionToken(token, now);
    expect(claims).toEqual({ sub: 'me@example.com' });
    expect(await verifySessionToken(token, now + 8 * 24 * 60 * 60 * 1000)).toBe(
      null,
    );
  });

  it('filters robots by user access', async () => {
    const driver = findUserByEmail('driver@example.com');
    expect(driver).toBeTruthy();
    if (!driver) {
      return;
    }
    expect(userCanAccessRobot(driver, 'robot-1')).toBe(true);
    expect(userCanAccessRobot(driver, 'robot-2')).toBe(false);
    expect(listRobotsForUser(driver)).toHaveLength(1);

    const viewer = findUserByEmail('viewer@example.com');
    expect(viewer).toBeTruthy();
    if (!viewer) {
      return;
    }
    expect(listRobotsForUser(viewer)).toHaveLength(1);
    expect(getAccessibleRobot('driver@example.com', 'robot-1')?.slug).toBe(
      'robot-1',
    );
    expect(getAccessibleRobot('driver@example.com', 'nope')).toBeUndefined();
  });

  it('verifies login credentials and unknown-user path', async () => {
    expect(
      await verifyLoginCredentials('driver@example.com', 'secret'),
    ).toMatchObject({ email: 'driver@example.com', permission: 'driver' });
    expect(
      await verifyLoginCredentials('driver@example.com', 'wrong'),
    ).toBeNull();
    expect(
      await verifyLoginCredentials('missing@example.com', 'secret'),
    ).toBeNull();
  });

  it('signs a control token with driver vs viewer perm', async () => {
    const sid = '550e8400-e29b-41d4-a716-446655440000';
    const driverTok = await signControlToken({
      robotId: ROBOT_ID,
      email: 'driver@example.com',
      permission: 'driver',
      clientSessionId: sid,
      nowMs: Date.UTC(2026, 0, 1),
    });
    const payload = decodeJwt(driverTok.token);
    expect(controlTokenClaimsSchema.parse(payload).perm).toBe('driver');
    expect(payload.aud).toBe(audienceFor(ROBOT_ID));

    const viewerTok = await signControlToken({
      robotId: ROBOT_ID,
      email: 'viewer@example.com',
      permission: 'viewer',
      clientSessionId: sid,
      nowMs: Date.UTC(2026, 0, 1),
    });
    expect(
      controlTokenClaimsSchema.parse(decodeJwt(viewerTok.token)).perm,
    ).toBe('viewer');
  });
});
