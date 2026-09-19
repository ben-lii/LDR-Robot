import {
  TOKEN_ALG,
  TOKEN_ISSUER,
  audienceFor,
  controlTokenClaimsSchema,
  type ControlTokenClaims,
  type Result,
} from '@teleop/protocol';
import { importJWK, jwtVerify, type JWK } from 'jose';

import { isClockSynced, type Clock } from '../control/clock.js';

const CLOCK_TOLERANCE_S = 5;

export type TokenVerifier = {
  verify(token: string, nowMs?: number): Promise<Result<ControlTokenClaims>>;
};

export async function createTokenVerifier(options: {
  robotId: string;
  tokenPublicJwk: string;
  clock?: Clock;
}): Promise<TokenVerifier> {
  const jwk = JSON.parse(options.tokenPublicJwk) as JWK;
  const key = await importJWK(jwk, TOKEN_ALG);
  const clock = options.clock;
  const audience = audienceFor(options.robotId);

  return {
    async verify(token, nowMs): Promise<Result<ControlTokenClaims>> {
      const now = nowMs ?? clock?.now() ?? Date.now();
      if (!isClockSynced(now)) {
        return { ok: false, error: 'CLOCK_INVALID' };
      }

      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: TOKEN_ISSUER,
          audience,
          algorithms: [TOKEN_ALG],
          clockTolerance: CLOCK_TOLERANCE_S,
          currentDate: new Date(now),
        });
        const claims = controlTokenClaimsSchema.safeParse(payload);
        if (!claims.success) {
          return { ok: false, error: 'INVALID_CLAIMS' };
        }
        return { ok: true, value: claims.data };
      } catch {
        return { ok: false, error: 'UNAUTHORIZED' };
      }
    },
  };
}
