import 'server-only';

import {
  TOKEN_ALG,
  TOKEN_ISSUER,
  TOKEN_TTL_S,
  audienceFor,
  type Permission,
} from '@teleop/protocol';
import { importJWK, SignJWT, type JWK } from 'jose';
import { randomUUID } from 'node:crypto';

import { getServerEnv } from '@/lib/env.server';

export type SignedControlToken = {
  readonly token: string;
  readonly expiresAt: Date;
};

let privateKeyPromise: ReturnType<typeof importJWK> | undefined;

async function getPrivateKey(): Promise<Awaited<ReturnType<typeof importJWK>>> {
  if (!privateKeyPromise) {
    privateKeyPromise = (async () => {
      const jwk = JSON.parse(getServerEnv().tokenSigningPrivateJwk) as JWK;
      return importJWK(jwk, TOKEN_ALG);
    })();
  }
  return privateKeyPromise;
}

/** Test helper to drop the cached key after env changes. */
export function resetTokenSigningKeyCache(): void {
  privateKeyPromise = undefined;
}

export async function signControlToken(options: {
  robotId: string;
  email: string;
  permission: Permission;
  clientSessionId: string;
  nowMs?: number;
}): Promise<SignedControlToken> {
  const nowMs = options.nowMs ?? Date.now();
  const nowS = Math.floor(nowMs / 1000);
  const expS = nowS + TOKEN_TTL_S;
  const key = await getPrivateKey();

  const token = await new SignJWT({
    perm: options.permission,
    sid: options.clientSessionId,
  })
    .setProtectedHeader({ alg: TOKEN_ALG })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(audienceFor(options.robotId))
    .setSubject(options.email.toLowerCase())
    .setJti(randomUUID())
    .setIssuedAt(nowS)
    .setExpirationTime(expS)
    .sign(key);

  return {
    token,
    expiresAt: new Date(expS * 1000),
  };
}
