import {
  TOKEN_ALG,
  TOKEN_ISSUER,
  TOKEN_TTL_S,
  WHEP_PATH,
  audienceFor,
} from '@teleop/protocol';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTokenVerifier } from '../auth/verifyToken.js';
import type { Config } from '../config.js';
import { createFakeClock } from '../control/clock.js';
import { MotorController } from '../control/motorController.js';
import { SeatManager } from '../control/seatManager.js';
import { MockMotorDriver } from '../hardware/mockDriver.js';
import { createLogger } from '../logger.js';
import { createRobotHttpServer, type RobotHttpServer } from './httpServer.js';

const ROBOT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const realFetch = globalThis.fetch.bind(globalThis);

async function setup(mediaMode: 'disabled' | 'mediamtx' = 'disabled') {
  const { privateKey, publicKey } = await generateKeyPair(TOKEN_ALG, {
    extractable: true,
  });
  const publicJwk = JSON.stringify(await exportJWK(publicKey));
  const clock = createFakeClock(Date.UTC(2026, 5, 1));
  const config: Config = Object.freeze({
    robotId: ROBOT_ID,
    tokenPublicJwk: publicJwk,
    allowedOrigins: ['http://localhost:3000'],
    port: 0,
    bind: '127.0.0.1',
    maxWsClients: 4,
    motorDriver: 'mock',
    pinAin1: 5,
    pinAin2: 6,
    pinBin1: 13,
    pinBin2: 26,
    pinSleep: undefined,
    invertLeft: false,
    invertRight: false,
    swapMotors: false,
    pwmFrequencyHz: 1000,
    minDriveDuty: 0.25,
    rampMs: 1,
    maxSpeedPercent: 100,
    watchdogMs: 300,
    mediaMode,
    mediamtxWhepUrl: 'http://127.0.0.1:8889',
    mediamtxApiUrl: 'http://127.0.0.1:9997',
    mediaPath: 'robot',
    maxVideoViewers: 2,
    logLevel: 'silent',
  });

  const log = createLogger(config);
  const driver = new MockMotorDriver();
  const seat = new SeatManager();
  const controller = new MotorController({
    driver,
    clock,
    mixer: {
      maxSpeedPercent: 100,
      swapMotors: false,
      invertLeft: false,
      invertRight: false,
    },
    watchdogMs: 300,
    rampMs: 1,
    driverPresent: () => seat.driverPresent,
  });
  const verifier = await createTokenVerifier({
    robotId: ROBOT_ID,
    tokenPublicJwk: publicJwk,
    clock,
  });
  const http = createRobotHttpServer({
    config,
    log,
    clock,
    verifier,
    seat,
    controller,
    startedAtMs: clock.now(),
  });
  await http.listen();
  const address = http.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected TCP address');
  }
  const base = `http://127.0.0.1:${String(address.port)}`;

  async function token() {
    const nowS = Math.floor(clock.now() / 1000);
    return new SignJWT({ perm: 'driver', sid: randomUUID() })
      .setProtectedHeader({ alg: TOKEN_ALG })
      .setIssuer(TOKEN_ISSUER)
      .setAudience(audienceFor(ROBOT_ID))
      .setSubject('me@example.com')
      .setJti(randomUUID())
      .setIssuedAt(nowS)
      .setExpirationTime(nowS + TOKEN_TTL_S)
      .sign(privateKey);
  }

  return { http, base, token };
}

describe('whep proxy', () => {
  let http: RobotHttpServer | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (http) {
      await http.close();
      http = undefined;
    }
  });

  it('returns video_unavailable when MEDIA_MODE=disabled', async () => {
    const ctx = await setup('disabled');
    http = ctx.http;
    const jwt = await ctx.token();
    const res = await realFetch(`${ctx.base}${WHEP_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/sdp',
        Origin: 'http://localhost:3000',
      },
      body: 'v=0',
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'video_unavailable' });
  });

  it('requires bearer auth', async () => {
    const ctx = await setup('mediamtx');
    http = ctx.http;
    const res = await realFetch(`${ctx.base}${WHEP_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        Origin: 'http://localhost:3000',
      },
      body: 'v=0',
    });
    expect(res.status).toBe(401);
  });

  it('proxies offer, rewrites Location, and deletes session', async () => {
    const ctx = await setup('mediamtx');
    http = ctx.http;
    const jwt = await ctx.token();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1:8889')) {
          if (init?.method === 'POST') {
            return new Response('v=0\r\nm=video', {
              status: 201,
              headers: {
                'Content-Type': 'application/sdp',
                Location: '/robot/whep/session-abc',
              },
            });
          }
          if (init?.method === 'DELETE') {
            return new Response(null, { status: 204 });
          }
        }
        return realFetch(input, init);
      }),
    );

    const post = await realFetch(`${ctx.base}${WHEP_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/sdp',
        Origin: 'http://localhost:3000',
      },
      body: 'v=0\r\toffer',
    });
    expect(post.status).toBe(201);
    const location = post.headers.get('location');
    expect(location).toMatch(new RegExp(`^${WHEP_PATH}/`));
    expect(await post.text()).toContain('m=video');

    const del = await realFetch(`${ctx.base}${location}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Origin: 'http://localhost:3000',
      },
    });
    expect(del.status).toBe(204);
  });

  it('returns video_unavailable when MediaMTX is down', async () => {
    const ctx = await setup('mediamtx');
    http = ctx.http;
    const jwt = await ctx.token();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1:8889')) {
          throw new Error('ECONNREFUSED');
        }
        return realFetch(input, init);
      }),
    );
    const res = await realFetch(`${ctx.base}${WHEP_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/sdp',
        Origin: 'http://localhost:3000',
      },
      body: 'v=0',
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'video_unavailable' });
  });
});
