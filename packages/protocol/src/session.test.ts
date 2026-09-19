import { describe, expect, it } from 'vitest';

import {
  apiErrorSchema,
  iceServerSchema,
  loginRequestSchema,
  robotSlugSchema,
  sessionRequestSchema,
  sessionResponseSchema,
} from './index.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('loginRequestSchema', () => {
  it('accepts email + password', () => {
    expect(
      loginRequestSchema.parse({
        email: 'me@example.com',
        password: 'secret',
      }),
    ).toEqual({ email: 'me@example.com', password: 'secret' });
  });

  it('rejects empty password and invalid email', () => {
    expect(
      loginRequestSchema.safeParse({
        email: 'me@example.com',
        password: '',
      }).success,
    ).toBe(false);
    expect(
      loginRequestSchema.safeParse({
        email: 'not-an-email',
        password: 'secret',
      }).success,
    ).toBe(false);
  });
});

describe('sessionRequestSchema', () => {
  it('accepts a uuid clientSessionId', () => {
    expect(sessionRequestSchema.parse({ clientSessionId: UUID })).toEqual({
      clientSessionId: UUID,
    });
  });

  it('rejects extra fields and bad ids', () => {
    expect(
      sessionRequestSchema.safeParse({
        clientSessionId: UUID,
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      sessionRequestSchema.safeParse({ clientSessionId: 'nope' }).success,
    ).toBe(false);
  });
});

describe('sessionResponseSchema', () => {
  it('accepts a full session payload', () => {
    const payload = {
      robot: { id: UUID, slug: 'robot-1', name: 'Robot 1' },
      permission: 'viewer' as const,
      token: 'jwt',
      tokenExpiresAt: '2026-09-19T13:00:00.000Z',
      urls: {
        ws: 'wss://robot-1.example.com/ws',
        whep: 'https://robot-1.example.com/whep',
        status: 'https://robot-1.example.com/status',
      },
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: ['turn:turn.example.com:3478'],
          username: 'user',
          credential: 'pass',
        },
      ],
      serverTime: '2026-09-19T12:59:15.000Z',
    };
    expect(sessionResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects a non-ISO expiry and a missing url', () => {
    expect(
      sessionResponseSchema.safeParse({
        robot: { id: UUID, slug: 'robot-1', name: 'Robot 1' },
        permission: 'driver',
        token: 'jwt',
        tokenExpiresAt: 'tomorrow',
        urls: {
          ws: 'wss://x/ws',
          whep: 'https://x/whep',
          status: 'https://x/status',
        },
        iceServers: [],
        serverTime: '2026-09-19T12:59:15.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('robotSlugSchema', () => {
  it('accepts slugs matching the documented pattern', () => {
    expect(robotSlugSchema.parse('robot-1')).toBe('robot-1');
    expect(robotSlugSchema.parse('ab')).toBe('ab');
  });

  it('rejects uppercase, leading hyphen, and too-short slugs', () => {
    expect(robotSlugSchema.safeParse('Robot-1').success).toBe(false);
    expect(robotSlugSchema.safeParse('-robot').success).toBe(false);
    expect(robotSlugSchema.safeParse('a').success).toBe(false);
  });
});

describe('iceServerSchema', () => {
  it('allows STUN urls without credentials', () => {
    expect(iceServerSchema.parse({ urls: 'stun:example.com:3478' })).toEqual({
      urls: 'stun:example.com:3478',
    });
  });

  it('rejects explicit undefined credentials under exactOptional', () => {
    expect(
      iceServerSchema.safeParse({
        urls: 'turn:example.com:3478',
        username: undefined,
      }).success,
    ).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts documented error codes only', () => {
    expect(apiErrorSchema.parse({ error: 'not_found' })).toEqual({
      error: 'not_found',
    });
    expect(apiErrorSchema.safeParse({ error: 'nope' }).success).toBe(false);
  });
});
