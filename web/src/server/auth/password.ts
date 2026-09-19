import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Matches the AUTH_USERS_JSON hash format: scrypt$N$r$p$salt$hash */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SALT_BYTES = 16;

const HASH_PREFIX = 'scrypt';

export type ScryptParams = {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
};

export class PasswordHashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordHashError';
  }
}

/**
 * Fixed dummy hash for unknown-user login paths so scrypt still runs
 * (timing does not reveal whether the email exists).
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

function scryptDerive(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, params, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      // Node always provides derivedKey when error is null.
      resolve(derived as Buffer);
    });
  });
}

export function formatPasswordHash(
  params: Omit<ScryptParams, 'salt' | 'hash'> & {
    salt: Buffer;
    hash: Buffer;
  },
): string {
  return [
    HASH_PREFIX,
    String(params.N),
    String(params.r),
    String(params.p),
    params.salt.toString('base64'),
    params.hash.toString('base64'),
  ].join('$');
}

export function parsePasswordHash(encoded: string): ScryptParams {
  const parts = encoded.split('$');
  if (parts.length !== 6) {
    throw new PasswordHashError('password hash must have 6 $-separated parts');
  }
  const [prefix, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  if (prefix !== HASH_PREFIX) {
    throw new PasswordHashError('password hash must start with scrypt$');
  }
  if (
    nRaw === undefined ||
    rRaw === undefined ||
    pRaw === undefined ||
    saltB64 === undefined ||
    hashB64 === undefined
  ) {
    throw new PasswordHashError('password hash is incomplete');
  }
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (
    !Number.isInteger(N) ||
    N <= 0 ||
    !Number.isInteger(r) ||
    r <= 0 ||
    !Number.isInteger(p) ||
    p <= 0
  ) {
    throw new PasswordHashError('password hash has invalid scrypt parameters');
  }
  let salt: Buffer;
  let hash: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    hash = Buffer.from(hashB64, 'base64');
  } catch {
    throw new PasswordHashError('password hash has invalid base64');
  }
  if (salt.length === 0 || hash.length === 0) {
    throw new PasswordHashError('password hash salt/hash must be non-empty');
  }
  return { N, r, p, salt, hash };
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new PasswordHashError('password must not be empty');
  }
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = await scryptDerive(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return formatPasswordHash({
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt,
    hash,
  });
}

/**
 * Verifies a password against an encoded scrypt hash.
 * Uses crypto.timingSafeEqual on the digests. Returns false for malformed hashes
 * (after a best-effort dummy scrypt when possible is the caller's job for unknown users).
 */
export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  let params: ScryptParams;
  try {
    params = parsePasswordHash(encodedHash);
  } catch {
    return false;
  }
  const derived = await scryptDerive(
    password,
    params.salt,
    params.hash.length,
    {
      N: params.N,
      r: params.r,
      p: params.p,
    },
  );
  if (derived.length !== params.hash.length) {
    return false;
  }
  return timingSafeEqual(derived, params.hash);
}
