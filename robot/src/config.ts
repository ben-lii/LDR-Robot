import { z } from 'zod';

import {
  DEFAULT_WATCHDOG_MS,
  WATCHDOG_MAX_MS,
  WATCHDOG_MIN_MS,
} from '@teleop/protocol';

const boolFromEnv = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const intFromEnv = z.coerce.number().int();
const floatFromEnv = z.coerce.number();

const envSchema = z.object({
  ROBOT_ID: z.uuid(),
  TOKEN_PUBLIC_JWK: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
  PORT: intFromEnv.default(8080),
  BIND: z.string().default('127.0.0.1'),
  MAX_WS_CLIENTS: intFromEnv.default(4),
  MOTOR_DRIVER: z.enum(['mock', 'gpiod', 'pigpio']).default('mock'),
  PIN_AIN1: intFromEnv.default(5),
  PIN_AIN2: intFromEnv.default(6),
  PIN_BIN1: intFromEnv.default(13),
  PIN_BIN2: intFromEnv.default(26),
  PIN_SLEEP: intFromEnv.optional(),
  INVERT_LEFT: boolFromEnv.default(false),
  INVERT_RIGHT: boolFromEnv.default(false),
  SWAP_MOTORS: boolFromEnv.default(false),
  PWM_FREQUENCY_HZ: intFromEnv.default(1000),
  MIN_DRIVE_DUTY: floatFromEnv.min(0).max(1).default(0.25),
  RAMP_MS: intFromEnv.positive().default(250),
  MAX_SPEED_PERCENT: intFromEnv.min(0).max(100).default(100),
  WATCHDOG_MS: intFromEnv.default(DEFAULT_WATCHDOG_MS),
  MEDIA_MODE: z.enum(['mediamtx', 'disabled']).default('mediamtx'),
  MEDIAMTX_WHEP_URL: z.string().default('http://127.0.0.1:8889'),
  MEDIAMTX_API_URL: z.string().default('http://127.0.0.1:9997'),
  MEDIA_PATH: z.string().default('robot'),
  MAX_VIDEO_VIEWERS: intFromEnv.default(2),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Config = Readonly<{
  robotId: string;
  tokenPublicJwk: string;
  allowedOrigins: readonly string[];
  port: number;
  bind: string;
  maxWsClients: number;
  motorDriver: 'mock' | 'gpiod' | 'pigpio';
  pinAin1: number;
  pinAin2: number;
  pinBin1: number;
  pinBin2: number;
  pinSleep: number | undefined;
  invertLeft: boolean;
  invertRight: boolean;
  swapMotors: boolean;
  pwmFrequencyHz: number;
  minDriveDuty: number;
  rampMs: number;
  maxSpeedPercent: number;
  watchdogMs: number;
  mediaMode: 'mediamtx' | 'disabled';
  mediamtxWhepUrl: string;
  mediamtxApiUrl: string;
  mediaPath: string;
  maxVideoViewers: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}>;

function formatEnvError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse({
    ROBOT_ID: env['ROBOT_ID'],
    TOKEN_PUBLIC_JWK: env['TOKEN_PUBLIC_JWK'],
    ALLOWED_ORIGINS: env['ALLOWED_ORIGINS'],
    PORT: env['PORT'],
    BIND: env['BIND'],
    MAX_WS_CLIENTS: env['MAX_WS_CLIENTS'],
    MOTOR_DRIVER: env['MOTOR_DRIVER'],
    PIN_AIN1: env['PIN_AIN1'],
    PIN_AIN2: env['PIN_AIN2'],
    PIN_BIN1: env['PIN_BIN1'],
    PIN_BIN2: env['PIN_BIN2'],
    PIN_SLEEP: env['PIN_SLEEP'],
    INVERT_LEFT: env['INVERT_LEFT'],
    INVERT_RIGHT: env['INVERT_RIGHT'],
    SWAP_MOTORS: env['SWAP_MOTORS'],
    PWM_FREQUENCY_HZ: env['PWM_FREQUENCY_HZ'],
    MIN_DRIVE_DUTY: env['MIN_DRIVE_DUTY'],
    RAMP_MS: env['RAMP_MS'],
    MAX_SPEED_PERCENT: env['MAX_SPEED_PERCENT'],
    WATCHDOG_MS: env['WATCHDOG_MS'],
    MEDIA_MODE: env['MEDIA_MODE'],
    MEDIAMTX_WHEP_URL: env['MEDIAMTX_WHEP_URL'],
    MEDIAMTX_API_URL: env['MEDIAMTX_API_URL'],
    MEDIA_PATH: env['MEDIA_PATH'],
    MAX_VIDEO_VIEWERS: env['MAX_VIDEO_VIEWERS'],
    LOG_LEVEL: env['LOG_LEVEL'],
  });

  if (!parsed.success) {
    throw new Error(`Invalid robot env:\n${formatEnvError(parsed.error)}`);
  }

  let tokenPublicJwk: string;
  try {
    const jwk: unknown = JSON.parse(parsed.data.TOKEN_PUBLIC_JWK);
    if (jwk === null || typeof jwk !== 'object' || Array.isArray(jwk)) {
      throw new Error('TOKEN_PUBLIC_JWK must be a JSON object');
    }
    tokenPublicJwk = parsed.data.TOKEN_PUBLIC_JWK;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid robot env:\n  - TOKEN_PUBLIC_JWK: ${message}`);
  }

  const watchdogMs = Math.min(
    WATCHDOG_MAX_MS,
    Math.max(WATCHDOG_MIN_MS, parsed.data.WATCHDOG_MS),
  );

  const allowedOrigins = parseOrigins(parsed.data.ALLOWED_ORIGINS);
  if (allowedOrigins.length === 0) {
    throw new Error(
      'Invalid robot env:\n  - ALLOWED_ORIGINS: must list at least one origin',
    );
  }

  const config: Config = {
    robotId: parsed.data.ROBOT_ID,
    tokenPublicJwk,
    allowedOrigins,
    port: parsed.data.PORT,
    bind: parsed.data.BIND,
    maxWsClients: parsed.data.MAX_WS_CLIENTS,
    motorDriver: parsed.data.MOTOR_DRIVER,
    pinAin1: parsed.data.PIN_AIN1,
    pinAin2: parsed.data.PIN_AIN2,
    pinBin1: parsed.data.PIN_BIN1,
    pinBin2: parsed.data.PIN_BIN2,
    pinSleep: parsed.data.PIN_SLEEP,
    invertLeft: parsed.data.INVERT_LEFT,
    invertRight: parsed.data.INVERT_RIGHT,
    swapMotors: parsed.data.SWAP_MOTORS,
    pwmFrequencyHz: parsed.data.PWM_FREQUENCY_HZ,
    minDriveDuty: parsed.data.MIN_DRIVE_DUTY,
    rampMs: parsed.data.RAMP_MS,
    maxSpeedPercent: parsed.data.MAX_SPEED_PERCENT,
    watchdogMs,
    mediaMode: parsed.data.MEDIA_MODE,
    mediamtxWhepUrl: parsed.data.MEDIAMTX_WHEP_URL,
    mediamtxApiUrl: parsed.data.MEDIAMTX_API_URL,
    mediaPath: parsed.data.MEDIA_PATH,
    maxVideoViewers: parsed.data.MAX_VIDEO_VIEWERS,
    logLevel: parsed.data.LOG_LEVEL,
  };

  return Object.freeze(config);
}
