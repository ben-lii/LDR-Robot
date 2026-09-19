import {
  HEALTH_PATH,
  PROTOCOL_VERSION,
  STATUS_PATH,
  TOKEN_ALG,
  TOKEN_ISSUER,
  TOKEN_TTL_S,
  WS_CLOSE,
  WS_PATH,
  audienceFor,
  parseServerMessage,
  type ServerMessage,
} from '@teleop/protocol';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import { createTokenVerifier } from '../auth/verifyToken.js';
import type { Config } from '../config.js';
import { createFakeClock } from '../control/clock.js';
import { MotorController } from '../control/motorController.js';
import { SeatManager } from '../control/seatManager.js';
import { MockMotorDriver } from '../hardware/mockDriver.js';
import { createLogger } from '../logger.js';
import { createRobotHttpServer, type RobotHttpServer } from './httpServer.js';

const ROBOT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;

async function setup() {
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
    mediaMode: 'disabled',
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
  const wsUrl = `ws://127.0.0.1:${String(address.port)}${WS_PATH}`;

  async function token(perm: 'driver' | 'viewer', sid = randomUUID()) {
    const nowS = Math.floor(clock.now() / 1000);
    return {
      sid,
      jwt: await new SignJWT({ perm, sid })
        .setProtectedHeader({ alg: TOKEN_ALG })
        .setIssuer(TOKEN_ISSUER)
        .setAudience(audienceFor(ROBOT_ID))
        .setSubject('me@example.com')
        .setJti(randomUUID())
        .setIssuedAt(nowS)
        .setExpirationTime(nowS + TOKEN_TTL_S)
        .sign(privateKey),
    };
  }

  return { http, base, wsUrl, token, driver, controller, seat, clock };
}

async function openClient(
  wsUrl: string,
  jwt: string,
  sid: string,
  wantControl: boolean,
): Promise<{ ws: WebSocket; welcome: Welcome }> {
  const ws = new WebSocket(wsUrl, {
    origin: 'http://localhost:3000',
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  const welcomePromise = new Promise<Welcome>((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData): void => {
      const parsed = parseServerMessage(data.toString('utf8'));
      if (parsed.ok && parsed.value.type === 'welcome') {
        ws.off('message', onMessage);
        resolve(parsed.value);
      }
    };
    ws.on('message', onMessage);
    ws.once('close', () => reject(new Error('closed before welcome')));
  });

  ws.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'hello',
      token: jwt,
      clientSessionId: sid,
      wantControl,
    }),
  );

  const welcome = await welcomePromise;
  return { ws, welcome };
}

describe('http + ws integration', () => {
  let http: RobotHttpServer | undefined;

  afterEach(async () => {
    if (http) {
      await http.close();
      http = undefined;
    }
  });

  it('GET /healthz responds', async () => {
    const ctx = await setup();
    http = ctx.http;
    const res = await fetch(`${ctx.base}${HEALTH_PATH}`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      clockSynced: true,
    });
  });

  it('GET /status requires a bearer token', async () => {
    const ctx = await setup();
    http = ctx.http;
    const denied = await fetch(`${ctx.base}${STATUS_PATH}`);
    expect(denied.status).toBe(401);

    const { jwt } = await ctx.token('viewer');
    const ok = await fetch(`${ctx.base}${STATUS_PATH}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { mediaReady: boolean };
    expect(body.mediaReady).toBe(false);
  });

  it('closes unauthenticated sockets after AUTH_TIMEOUT_MS', async () => {
    const ctx = await setup();
    http = ctx.http;
    const ws = new WebSocket(ctx.wsUrl, { origin: 'http://localhost:3000' });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    const code = await new Promise<number>((resolve) => {
      ws.once('close', (c) => resolve(c));
    });
    expect(code).toBe(WS_CLOSE.AUTH_TIMEOUT);
  }, 10_000);

  it('viewer cannot drive; second driver becomes viewer; viewer can e-stop', async () => {
    const ctx = await setup();
    http = ctx.http;

    const driverTok = await ctx.token('driver');
    const driver = await openClient(
      ctx.wsUrl,
      driverTok.jwt,
      driverTok.sid,
      true,
    );
    expect(driver.welcome.role).toBe('driver');

    const otherTok = await ctx.token('driver');
    const other = await openClient(ctx.wsUrl, otherTok.jwt, otherTok.sid, true);
    expect(other.welcome.role).toBe('viewer');

    const viewerTok = await ctx.token('viewer');
    const viewer = await openClient(
      ctx.wsUrl,
      viewerTok.jwt,
      viewerTok.sid,
      true,
    );
    expect(viewer.welcome.role).toBe('viewer');

    viewer.ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'drive',
        throttle: 1,
        steer: 0,
        speed: 50,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.driver.calls.filter((c) => c.op === 'setMotor')).toHaveLength(0);

    viewer.ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'estop',
        engaged: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    ctx.controller.tick();
    expect(ctx.controller.getState().mode).toBe('estop');

    viewer.ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'estop',
        engaged: false,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    ctx.controller.tick();
    expect(ctx.controller.getState().mode).toBe('estop');

    driver.ws.close();
    other.ws.close();
    viewer.ws.close();
  });

  it('driver disconnect revokes control', async () => {
    const ctx = await setup();
    http = ctx.http;
    const tok = await ctx.token('driver');
    const client = await openClient(ctx.wsUrl, tok.jwt, tok.sid, true);
    client.ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'drive',
        throttle: 1,
        steer: 0,
        speed: 100,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    ctx.controller.tick();
    expect(ctx.seat.driverPresent).toBe(true);

    await new Promise<void>((resolve) => {
      client.ws.once('close', () => resolve());
      client.ws.close();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(ctx.seat.driverPresent).toBe(false);
  });

  it('token expiry frees the seat and revokes control', async () => {
    const ctx = await setup();
    http = ctx.http;
    const tok = await ctx.token('driver');
    const client = await openClient(ctx.wsUrl, tok.jwt, tok.sid, true);
    expect(ctx.seat.driverPresent).toBe(true);

    // Expire via clock; next message triggers expireAuth.
    ctx.clock.advance(TOKEN_TTL_S * 1000 + 1000);
    client.ws.send(
      JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', id: 1, t: 1 }),
    );
    const code = await new Promise<number>((resolve) => {
      client.ws.once('close', (c) => resolve(c));
    });
    expect(code).toBe(WS_CLOSE.TOKEN_EXPIRED);
    expect(ctx.seat.driverPresent).toBe(false);
  });
});
