import { describe, expect, it } from 'vitest';

import {
  TOKEN_ISSUER,
  audienceFor,
  controlTokenClaimsSchema,
} from './index.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const ROBOT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const validClaims = {
  iss: TOKEN_ISSUER,
  aud: audienceFor(ROBOT_ID),
  sub: 'me@example.com',
  perm: 'driver' as const,
  sid: UUID,
  jti: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  iat: 1_700_000_000,
  exp: 1_700_000_045,
};

describe('audienceFor', () => {
  it('binds a token to exactly one robot', () => {
    expect(audienceFor(ROBOT_ID)).toBe(`robot:${ROBOT_ID}`);
  });
});

describe('controlTokenClaimsSchema', () => {
  it('accepts valid claims and strips unknown JWT fields', () => {
    const parsed = controlTokenClaimsSchema.parse({
      ...validClaims,
      nbf: validClaims.iat,
    });
    expect(parsed).toEqual(validClaims);
  });

  it('rejects wrong issuer, audience, perm, and ids', () => {
    expect(
      controlTokenClaimsSchema.safeParse({ ...validClaims, iss: 'other' })
        .success,
    ).toBe(false);
    expect(
      controlTokenClaimsSchema.safeParse({
        ...validClaims,
        aud: ROBOT_ID,
      }).success,
    ).toBe(false);
    expect(
      controlTokenClaimsSchema.safeParse({ ...validClaims, aud: 'robot:' })
        .success,
    ).toBe(false);
    expect(
      controlTokenClaimsSchema.safeParse({ ...validClaims, perm: 'admin' })
        .success,
    ).toBe(false);
    expect(
      controlTokenClaimsSchema.safeParse({ ...validClaims, sid: 'nope' })
        .success,
    ).toBe(false);
    expect(
      controlTokenClaimsSchema.safeParse({
        ...validClaims,
        sub: 'not-an-email',
      }).success,
    ).toBe(false);
  });
});
