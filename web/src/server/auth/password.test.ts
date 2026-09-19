import { describe, expect, it } from 'vitest';

import {
  DUMMY_PASSWORD_HASH,
  PasswordHashError,
  formatPasswordHash,
  hashPassword,
  parsePasswordHash,
  verifyPassword,
} from './password';

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies the correct password', async () => {
    const encoded = await hashPassword('correct horse battery');
    expect(encoded.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery', encoded)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const encoded = await hashPassword('correct horse battery');
    expect(await verifyPassword('wrong password', encoded)).toBe(false);
  });

  it('rejects empty passwords when hashing', async () => {
    await expect(hashPassword('')).rejects.toBeInstanceOf(PasswordHashError);
  });

  it('returns false for a malformed hash without throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$1$2')).toBe(false);
  });

  it('can verify the dummy hash format (unknown-user path)', async () => {
    expect(parsePasswordHash(DUMMY_PASSWORD_HASH).N).toBe(16384);
    // Dummy salt/hash are valid base64; wrong password must still return false.
    expect(await verifyPassword('nope', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe('parsePasswordHash / formatPasswordHash', () => {
  it('round-trips parameters', () => {
    const salt = Buffer.from('salt-bytes-here!!');
    const hash = Buffer.alloc(64, 7);
    const encoded = formatPasswordHash({
      N: 16384,
      r: 8,
      p: 1,
      salt,
      hash,
    });
    const parsed = parsePasswordHash(encoded);
    expect(parsed.N).toBe(16384);
    expect(parsed.r).toBe(8);
    expect(parsed.p).toBe(1);
    expect(parsed.salt.equals(salt)).toBe(true);
    expect(parsed.hash.equals(hash)).toBe(true);
  });

  it('throws on malformed encodings', () => {
    expect(() => parsePasswordHash('bcrypt$…')).toThrow(PasswordHashError);
    expect(() => parsePasswordHash('scrypt$nope$8$1$YQ==$YQ==')).toThrow(
      PasswordHashError,
    );
  });
});
