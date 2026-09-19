import { z } from 'zod';

import {
  MAX_WS_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  WATCHDOG_MAX_MS,
  WATCHDOG_MIN_MS,
} from './constants.js';

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export const driverViewerSchema = z.enum(['driver', 'viewer']);
export type DriverViewer = z.infer<typeof driverViewerSchema>;
export type Permission = DriverViewer;
export type Role = DriverViewer;

export const robotModeSchema = z.enum([
  'idle',
  'driving',
  'braking',
  'estop',
  'fault',
]);
export type RobotMode = z.infer<typeof robotModeSchema>;

export const robotStateSchema = z.strictObject({
  mode: robotModeSchema,
  speedPercent: z.number().min(0).max(100),
  driverPresent: z.boolean(),
  mediaReady: z.boolean(),
  uptimeS: z.number().min(0),
});
export type RobotState = z.infer<typeof robotStateSchema>;

export const errorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'FORBIDDEN_ROLE',
  'DRIVER_BUSY',
  'BAD_MESSAGE',
  'RATE_LIMITED',
  'ROBOT_FAULT',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const roleChangedReasonSchema = z.enum([
  'granted',
  'seat_taken',
  'released',
  'permission',
  'token',
]);
export type RoleChangedReason = z.infer<typeof roleChangedReasonSchema>;

const v = z.literal(PROTOCOL_VERSION);
const signedUnit = z.number().min(-1).max(1);
const speedPercentInt = z.int().min(0).max(100);

export const helloMessageSchema = z.strictObject({
  v,
  type: z.literal('hello'),
  token: z.string().min(1),
  clientSessionId: z.uuid(),
  wantControl: z.boolean(),
});

export const requestControlMessageSchema = z.strictObject({
  v,
  type: z.literal('request_control'),
});

export const releaseControlMessageSchema = z.strictObject({
  v,
  type: z.literal('release_control'),
});

export const driveMessageSchema = z.strictObject({
  v,
  type: z.literal('drive'),
  throttle: signedUnit,
  steer: signedUnit,
  speed: speedPercentInt,
});

export const brakeMessageSchema = z.strictObject({
  v,
  type: z.literal('brake'),
  active: z.boolean(),
});

export const estopMessageSchema = z.strictObject({
  v,
  type: z.literal('estop'),
  engaged: z.boolean(),
});

export const pingMessageSchema = z.strictObject({
  v,
  type: z.literal('ping'),
  id: z.int(),
  t: z.number(),
});

export const tokenRefreshMessageSchema = z.strictObject({
  v,
  type: z.literal('token_refresh'),
  token: z.string().min(1),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  requestControlMessageSchema,
  releaseControlMessageSchema,
  driveMessageSchema,
  brakeMessageSchema,
  estopMessageSchema,
  pingMessageSchema,
  tokenRefreshMessageSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const robotLimitsSchema = z.strictObject({
  watchdogMs: z.int().min(WATCHDOG_MIN_MS).max(WATCHDOG_MAX_MS),
  maxSpeedPercent: speedPercentInt,
});
export type RobotLimits = z.infer<typeof robotLimitsSchema>;

export const welcomeMessageSchema = z.strictObject({
  v,
  type: z.literal('welcome'),
  robotId: z.uuid(),
  permission: driverViewerSchema,
  role: driverViewerSchema,
  limits: robotLimitsSchema,
  state: robotStateSchema,
});

export const roleChangedMessageSchema = z.strictObject({
  v,
  type: z.literal('role_changed'),
  role: driverViewerSchema,
  reason: roleChangedReasonSchema,
});

export const stateMessageSchema = z.strictObject({
  v,
  type: z.literal('state'),
  state: robotStateSchema,
});

export const pongMessageSchema = z.strictObject({
  v,
  type: z.literal('pong'),
  id: z.int(),
  t: z.number(),
});

export const errorMessageSchema = z.strictObject({
  v,
  type: z.literal('error'),
  code: errorCodeSchema,
  message: z.string(),
  fatal: z.boolean(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeMessageSchema,
  roleChangedMessageSchema,
  stateMessageSchema,
  pongMessageSchema,
  errorMessageSchema,
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

const utf8 = new TextEncoder();

function decodeRaw(raw: unknown): Result<unknown> {
  if (typeof raw === 'string') {
    if (utf8.encode(raw).length > MAX_WS_MESSAGE_BYTES) {
      return { ok: false, error: 'message too large' };
    }
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { ok: false, error: 'invalid json' };
    }
  }
  if (raw !== null && typeof raw === 'object') {
    return { ok: true, value: raw };
  }
  return { ok: false, error: 'invalid json' };
}

function fromSafeParse<T>(parsed: z.ZodSafeParseResult<T>): Result<T> {
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return { ok: false, error: z.prettifyError(parsed.error) };
}

export function parseClientMessage(raw: unknown): Result<ClientMessage> {
  const decoded = decodeRaw(raw);
  if (!decoded.ok) {
    return decoded;
  }
  return fromSafeParse(clientMessageSchema.safeParse(decoded.value));
}

export function parseServerMessage(raw: unknown): Result<ServerMessage> {
  const decoded = decodeRaw(raw);
  if (!decoded.ok) {
    return decoded;
  }
  return fromSafeParse(serverMessageSchema.safeParse(decoded.value));
}
