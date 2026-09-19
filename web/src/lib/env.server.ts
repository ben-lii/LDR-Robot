import 'server-only';

import { z } from 'zod';

import {
  formatZodEnvError,
  parseAuthUsersJson,
  parseRobotsJson,
  type AuthUsers,
  type RobotsConfig,
} from './env.schemas';

export {
  authUserSchema,
  authUsersJsonSchema,
  parseAuthUsersJson,
  parseRobotsJson,
  robotConfigSchema,
  robotsJsonSchema,
  tunnelHostSchema,
  type AuthUser,
  type AuthUsers,
  type RobotConfig,
  type RobotsConfig,
} from './env.schemas';

const nonEmpty = z.string().min(1);

/** Single-line JSON JWK (validated as JSON object, not cryptographic strength). */
const jwkJsonSchema = z
  .string()
  .min(1)
  .superRefine((raw, ctx) => {
    try {
      const value: unknown = JSON.parse(raw);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        ctx.addIssue({
          code: 'custom',
          message: 'must be a JSON object',
        });
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
    }
  });

const optionalString = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined || value.trim() === '' ? undefined : value,
  );

const serverEnvSchema = z.object({
  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET must be at least 32 characters (use npm run secrets:generate)',
    ),
  AUTH_USERS_JSON: nonEmpty,
  ROBOTS_JSON: nonEmpty,
  TOKEN_SIGNING_PRIVATE_JWK: jwkJsonSchema,
  ICE_STUN_URLS: optionalString,
  ICE_TURN_URLS: optionalString,
  ICE_TURN_USERNAME: optionalString,
  ICE_TURN_CREDENTIAL: optionalString,
  CLOUDFLARE_TURN_KEY_ID: optionalString,
  CLOUDFLARE_TURN_API_TOKEN: optionalString,
  DEV_ROBOT_ORIGIN_OVERRIDE: optionalString,
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
});

export type ServerEnv = {
  readonly sessionSecret: string;
  readonly authUsers: AuthUsers;
  readonly robots: RobotsConfig;
  readonly tokenSigningPrivateJwk: string;
  readonly iceStunUrls: string | undefined;
  readonly iceTurnUrls: string | undefined;
  readonly iceTurnUsername: string | undefined;
  readonly iceTurnCredential: string | undefined;
  readonly cloudflareTurnKeyId: string | undefined;
  readonly cloudflareTurnApiToken: string | undefined;
  readonly devRobotOriginOverride: string | undefined;
  readonly nodeEnv: 'development' | 'test' | 'production';
};

let cached: ServerEnv | undefined;

function readProcessEnv(): Record<string, string | undefined> {
  return {
    SESSION_SECRET: process.env['SESSION_SECRET'],
    AUTH_USERS_JSON: process.env['AUTH_USERS_JSON'],
    ROBOTS_JSON: process.env['ROBOTS_JSON'],
    TOKEN_SIGNING_PRIVATE_JWK: process.env['TOKEN_SIGNING_PRIVATE_JWK'],
    ICE_STUN_URLS: process.env['ICE_STUN_URLS'],
    ICE_TURN_URLS: process.env['ICE_TURN_URLS'],
    ICE_TURN_USERNAME: process.env['ICE_TURN_USERNAME'],
    ICE_TURN_CREDENTIAL: process.env['ICE_TURN_CREDENTIAL'],
    CLOUDFLARE_TURN_KEY_ID: process.env['CLOUDFLARE_TURN_KEY_ID'],
    CLOUDFLARE_TURN_API_TOKEN: process.env['CLOUDFLARE_TURN_API_TOKEN'],
    DEV_ROBOT_ORIGIN_OVERRIDE: process.env['DEV_ROBOT_ORIGIN_OVERRIDE'],
    NODE_ENV: process.env['NODE_ENV'],
  };
}

/**
 * Parses and caches validated server env. Call from server code only.
 * Throws with a field-by-field list on failure.
 */
export function getServerEnv(): ServerEnv {
  if (cached) {
    return cached;
  }

  const raw = readProcessEnv();
  const parsed = serverEnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(formatZodEnvError('web server env', parsed.error));
  }

  let authUsers: AuthUsers;
  let robots: RobotsConfig;
  try {
    authUsers = parseAuthUsersJson(parsed.data.AUTH_USERS_JSON);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  try {
    robots = parseRobotsJson(parsed.data.ROBOTS_JSON);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  // Cross-check: every concrete robot slug referenced by a user must exist.
  const robotSlugs = new Set(robots.map((r) => r.slug));
  for (const user of authUsers) {
    if (user.robots === '*') {
      continue;
    }
    for (const slug of user.robots) {
      if (!robotSlugs.has(slug)) {
        throw new Error(
          `AUTH_USERS_JSON: user ${user.email} references unknown robot slug "${slug}"`,
        );
      }
    }
  }

  cached = {
    sessionSecret: parsed.data.SESSION_SECRET,
    authUsers,
    robots,
    tokenSigningPrivateJwk: parsed.data.TOKEN_SIGNING_PRIVATE_JWK,
    iceStunUrls: parsed.data.ICE_STUN_URLS,
    iceTurnUrls: parsed.data.ICE_TURN_URLS,
    iceTurnUsername: parsed.data.ICE_TURN_USERNAME,
    iceTurnCredential: parsed.data.ICE_TURN_CREDENTIAL,
    cloudflareTurnKeyId: parsed.data.CLOUDFLARE_TURN_KEY_ID,
    cloudflareTurnApiToken: parsed.data.CLOUDFLARE_TURN_API_TOKEN,
    devRobotOriginOverride: parsed.data.DEV_ROBOT_ORIGIN_OVERRIDE,
    nodeEnv: parsed.data.NODE_ENV,
  };
  return cached;
}

/** Test helper — clears the cached env. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
