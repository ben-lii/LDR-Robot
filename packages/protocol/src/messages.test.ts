import { describe, expect, it } from 'vitest';

import {
  MAX_WS_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type RobotState,
  type ServerMessage,
} from './index.js';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const robotState: RobotState = {
  mode: 'idle',
  speedPercent: 0,
  driverPresent: false,
  mediaReady: true,
  uptimeS: 12.5,
};

function expectClientOk(raw: unknown): ClientMessage {
  const result = parseClientMessage(raw);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

function expectServerOk(raw: unknown): ServerMessage {
  const result = parseServerMessage(raw);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

describe('parseClientMessage', () => {
  it('accepts every client type', () => {
    const messages: ClientMessage[] = [
      {
        v: PROTOCOL_VERSION,
        type: 'hello',
        token: 'jwt',
        clientSessionId: UUID,
        wantControl: true,
      },
      { v: PROTOCOL_VERSION, type: 'request_control' },
      { v: PROTOCOL_VERSION, type: 'release_control' },
      {
        v: PROTOCOL_VERSION,
        type: 'drive',
        throttle: 1,
        steer: -1,
        speed: 50,
      },
      { v: PROTOCOL_VERSION, type: 'brake', active: true },
      { v: PROTOCOL_VERSION, type: 'estop', engaged: true },
      { v: PROTOCOL_VERSION, type: 'ping', id: 7, t: 1.5 },
      { v: PROTOCOL_VERSION, type: 'token_refresh', token: 'jwt' },
    ];

    for (const message of messages) {
      expect(expectClientOk(message)).toEqual(message);
      expect(expectClientOk(JSON.stringify(message))).toEqual(message);
    }
  });

  it('rejects out-of-range drive values', () => {
    const base = {
      v: PROTOCOL_VERSION,
      type: 'drive' as const,
      throttle: 0,
      steer: 0,
      speed: 50,
    };

    expect(parseClientMessage({ ...base, throttle: 1.01 }).ok).toBe(false);
    expect(parseClientMessage({ ...base, throttle: -1.01 }).ok).toBe(false);
    expect(parseClientMessage({ ...base, steer: 2 }).ok).toBe(false);
    expect(parseClientMessage({ ...base, speed: 101 }).ok).toBe(false);
    expect(parseClientMessage({ ...base, speed: -1 }).ok).toBe(false);
    expect(parseClientMessage({ ...base, speed: 50.5 }).ok).toBe(false);
  });

  it('rejects unknown type, wrong version, extra fields, and bad ids', () => {
    expect(parseClientMessage({ v: PROTOCOL_VERSION, type: 'honk' }).ok).toBe(
      false,
    );
    expect(parseClientMessage({ v: 2, type: 'request_control' }).ok).toBe(
      false,
    );
    expect(
      parseClientMessage({
        v: PROTOCOL_VERSION,
        type: 'request_control',
        extra: true,
      }).ok,
    ).toBe(false);
    expect(
      parseClientMessage({
        v: PROTOCOL_VERSION,
        type: 'hello',
        token: 'jwt',
        clientSessionId: 'not-a-uuid',
        wantControl: false,
      }).ok,
    ).toBe(false);
  });
});

describe('parseServerMessage', () => {
  it('accepts every server type', () => {
    const messages: ServerMessage[] = [
      {
        v: PROTOCOL_VERSION,
        type: 'welcome',
        robotId: UUID,
        permission: 'driver',
        role: 'driver',
        limits: { watchdogMs: 300, maxSpeedPercent: 100 },
        state: robotState,
      },
      {
        v: PROTOCOL_VERSION,
        type: 'role_changed',
        role: 'viewer',
        reason: 'seat_taken',
      },
      { v: PROTOCOL_VERSION, type: 'state', state: robotState },
      { v: PROTOCOL_VERSION, type: 'pong', id: 7, t: 1.5 },
      {
        v: PROTOCOL_VERSION,
        type: 'error',
        code: 'DRIVER_BUSY',
        message: 'seat taken',
        fatal: false,
      },
    ];

    for (const message of messages) {
      expect(expectServerOk(message)).toEqual(message);
      expect(expectServerOk(JSON.stringify(message))).toEqual(message);
    }
  });

  it('rejects unknown type, invalid error codes, and out-of-range state', () => {
    expect(parseServerMessage({ v: PROTOCOL_VERSION, type: 'ack' }).ok).toBe(
      false,
    );
    expect(
      parseServerMessage({
        v: PROTOCOL_VERSION,
        type: 'error',
        code: 'NOPE',
        message: 'x',
        fatal: false,
      }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({
        v: PROTOCOL_VERSION,
        type: 'state',
        state: { ...robotState, mode: 'flying' },
      }).ok,
    ).toBe(false);
    expect(
      parseServerMessage({
        v: PROTOCOL_VERSION,
        type: 'welcome',
        robotId: UUID,
        permission: 'driver',
        role: 'driver',
        limits: { watchdogMs: 50, maxSpeedPercent: 100 },
        state: robotState,
      }).ok,
    ).toBe(false);
  });
});

describe('parse helpers never throw', () => {
  const garbage = [
    undefined,
    null,
    12,
    true,
    '',
    '{',
    '[]',
    '"hello"',
    '{"type":',
    { type: 'hello' },
  ];

  it('returns ok: false for garbage JSON and non-objects', () => {
    for (const raw of garbage) {
      expect(() => parseClientMessage(raw)).not.toThrow();
      expect(() => parseServerMessage(raw)).not.toThrow();
      expect(parseClientMessage(raw).ok).toBe(false);
      expect(parseServerMessage(raw).ok).toBe(false);
    }
  });

  it('rejects oversize frames before JSON parse', () => {
    const oversize = 'x'.repeat(MAX_WS_MESSAGE_BYTES + 1);
    const client = parseClientMessage(oversize);
    const server = parseServerMessage(oversize);
    expect(client).toEqual({ ok: false, error: 'message too large' });
    expect(server).toEqual({ ok: false, error: 'message too large' });
  });

  it('allows frames up to MAX_WS_MESSAGE_BYTES', () => {
    const ping = {
      v: PROTOCOL_VERSION,
      type: 'ping' as const,
      id: 1,
      t: 0,
    };
    const json = JSON.stringify(ping);
    const padded = json + ' '.repeat(MAX_WS_MESSAGE_BYTES - json.length);
    expect(padded.length).toBe(MAX_WS_MESSAGE_BYTES);
    expect(parseClientMessage(padded).ok).toBe(true);
  });
});
