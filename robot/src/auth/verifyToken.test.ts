import {
  TOKEN_ALG,
  TOKEN_ISSUER,
  TOKEN_TTL_S,
  audienceFor,
} from '@teleop/protocol';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../control/clock.js';
import { createTokenVerifier } from './verifyToken.js';

const ROBOT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function mint(options: {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  aud?: string;
  iss?: string;
  alg?: string;
  expOffsetS?: number;
  nowMs: number;
  tamper?: boolean;
}): Promise<string> {
  const nowS = Math.floor(options.nowMs / 1000);
  const jwt = await new SignJWT({
    perm: 'driver',
    sid: randomUUID(),
  })
    .setProtectedHeader({ alg: options.alg ?? TOKEN_ALG })
    .setIssuer(options.iss ?? TOKEN_ISSUER)
    .setAudience(options.aud ?? audienceFor(ROBOT_ID))
    .setSubject('me@example.com')
    .setJti(randomUUID())
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + (options.expOffsetS ?? TOKEN_TTL_S))
    .sign(options.privateKey);

  if (options.tamper) {
    const parts = jwt.split('.');
    const payload = parts[1];
    if (!payload) {
      return jwt;
    }
    parts[1] = `${payload}x`;
    return parts.join('.');
  }
  return jwt;
}

describe('createTokenVerifier', () => {
  it('accepts a valid token and rejects bad cases', async () => {
    const { privateKey, publicKey } = await generateKeyPair(TOKEN_ALG, {
      extractable: true,
    });
    const publicJwk = JSON.stringify(await exportJWK(publicKey));
    const clock = createFakeClock(Date.UTC(2026, 0, 1));
    const verifier = await createTokenVerifier({
      robotId: ROBOT_ID,
      tokenPublicJwk: publicJwk,
      clock,
    });

    const valid = await mint({ privateKey, nowMs: clock.now() });
    const ok = await verifier.verify(valid);
    expect(ok.ok).toBe(true);

    const expired = await mint({
      privateKey,
      nowMs: clock.now(),
      expOffsetS: -10,
    });
    expect((await verifier.verify(expired)).ok).toBe(false);

    const wrongAud = await mint({
      privateKey,
      nowMs: clock.now(),
      aud: audienceFor(randomUUID()),
    });
    expect((await verifier.verify(wrongAud)).ok).toBe(false);

    const wrongIss = await mint({
      privateKey,
      nowMs: clock.now(),
      iss: 'other',
    });
    expect((await verifier.verify(wrongIss)).ok).toBe(false);

    const tampered = await mint({
      privateKey,
      nowMs: clock.now(),
      tamper: true,
    });
    expect((await verifier.verify(tampered)).ok).toBe(false);
  });

  it('refuses tokens when the clock year is before 2025', async () => {
    const { privateKey, publicKey } = await generateKeyPair(TOKEN_ALG, {
      extractable: true,
    });
    const publicJwk = JSON.stringify(await exportJWK(publicKey));
    const clock = createFakeClock(Date.UTC(2020, 0, 1));
    const verifier = await createTokenVerifier({
      robotId: ROBOT_ID,
      tokenPublicJwk: publicJwk,
      clock,
    });
    const token = await mint({
      privateKey,
      nowMs: Date.UTC(2026, 0, 1),
    });
    const result = await verifier.verify(token, clock.now());
    expect(result).toEqual({ ok: false, error: 'CLOCK_INVALID' });
  });
});
