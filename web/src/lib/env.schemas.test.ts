import { describe, expect, it } from 'vitest';

import { hashPassword } from '../server/auth/password';
import {
  authUsersJsonSchema,
  parseAuthUsersJson,
  parseRobotsJson,
  robotsJsonSchema,
  tunnelHostSchema,
} from './env.schemas';

const VALID_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

const validUser = {
  email: 'Me@Example.com',
  passwordHash: VALID_HASH,
  permission: 'driver' as const,
  robots: ['robot-1'],
};

const validRobot = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  slug: 'robot-1',
  name: 'Robot 1',
  tunnelHost: 'robot-1.example.com',
};

describe('authUsersJsonSchema', () => {
  it('accepts a valid user list and lowercases email', () => {
    const parsed = authUsersJsonSchema.parse([validUser]);
    expect(parsed[0]?.email).toBe('me@example.com');
    expect(parsed[0]?.robots).toEqual(['robot-1']);
  });

  it('accepts robots: "*"', () => {
    expect(
      authUsersJsonSchema.parse([
        { ...validUser, permission: 'viewer', robots: '*' },
      ]),
    ).toHaveLength(1);
  });

  it('accepts a user entry produced by hashPassword (user:hash flow)', async () => {
    const passwordHash = await hashPassword('phase-2-acceptance');
    const entry = {
      email: 'me@example.com',
      passwordHash,
      permission: 'driver' as const,
      robots: ['robot-1'],
    };
    expect(authUsersJsonSchema.parse([entry])).toEqual([
      {
        email: 'me@example.com',
        passwordHash,
        permission: 'driver',
        robots: ['robot-1'],
      },
    ]);
  });

  it('rejects bad hash, empty robots list, and duplicate emails', () => {
    expect(
      authUsersJsonSchema.safeParse([
        { ...validUser, passwordHash: 'plaintext' },
      ]).success,
    ).toBe(false);
    expect(
      authUsersJsonSchema.safeParse([{ ...validUser, robots: [] }]).success,
    ).toBe(false);
    expect(
      authUsersJsonSchema.safeParse([
        validUser,
        { ...validUser, email: 'me@example.com' },
      ]).success,
    ).toBe(false);
  });
});

describe('parseAuthUsersJson', () => {
  it('parses a JSON string and names the env var on failure', () => {
    const json = JSON.stringify([validUser]);
    expect(parseAuthUsersJson(json)).toHaveLength(1);
    expect(() => parseAuthUsersJson('{')).toThrow(/AUTH_USERS_JSON/);
    expect(() => parseAuthUsersJson('[]')).toThrow(/AUTH_USERS_JSON/);
  });
});

describe('robotsJsonSchema / tunnelHostSchema', () => {
  it('accepts a valid robot', () => {
    expect(robotsJsonSchema.parse([validRobot])).toEqual([validRobot]);
  });

  it('rejects scheme/path hosts and bad slugs', () => {
    expect(
      tunnelHostSchema.safeParse('https://robot-1.example.com').success,
    ).toBe(false);
    expect(tunnelHostSchema.safeParse('robot-1.example.com/path').success).toBe(
      false,
    );
    expect(tunnelHostSchema.safeParse('robot-1.example.com:443').success).toBe(
      false,
    );
    expect(
      robotsJsonSchema.safeParse([{ ...validRobot, slug: 'Robot-1' }]).success,
    ).toBe(false);
  });

  it('rejects duplicate ids/slugs', () => {
    expect(
      robotsJsonSchema.safeParse([
        validRobot,
        { ...validRobot, id: '550e8400-e29b-41d4-a716-446655440000' },
      ]).success,
    ).toBe(false);
  });
});

describe('parseRobotsJson', () => {
  it('parses a JSON string and names the env var on failure', () => {
    expect(parseRobotsJson(JSON.stringify([validRobot]))).toEqual([validRobot]);
    expect(() => parseRobotsJson('null')).toThrow(/ROBOTS_JSON/);
  });
});
