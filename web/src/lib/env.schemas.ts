import { z } from 'zod';

import { driverViewerSchema, robotSlugSchema } from '@teleop/protocol';

import { parsePasswordHash } from '../server/auth/password';

const passwordHashSchema = z.string().superRefine((value, ctx) => {
  try {
    parsePasswordHash(value);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'invalid password hash',
    });
  }
});

export const authUserRobotsSchema = z.union([
  z.literal('*'),
  z.array(robotSlugSchema).min(1),
]);

export const authUserSchema = z.strictObject({
  email: z.email().transform((email) => email.toLowerCase()),
  passwordHash: passwordHashSchema,
  permission: driverViewerSchema,
  robots: authUserRobotsSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authUsersJsonSchema = z
  .array(authUserSchema)
  .min(1)
  .superRefine((users, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < users.length; i += 1) {
      const user = users[i];
      if (user === undefined) {
        continue;
      }
      if (seen.has(user.email)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'email'],
          message: `duplicate email: ${user.email}`,
        });
      }
      seen.add(user.email);
    }
  });
export type AuthUsers = z.infer<typeof authUsersJsonSchema>;

/** Hostname only: no scheme, path, port, or whitespace. */
export const tunnelHostSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
    {
      message: 'tunnelHost must be a DNS hostname (no scheme, path, or port)',
    },
  )
  .refine((host) => !host.includes('/') && !host.includes(':'), {
    message: 'tunnelHost must be a hostname only (no scheme or path)',
  });

export const robotConfigSchema = z.strictObject({
  id: z.uuid(),
  slug: robotSlugSchema,
  name: z.string().min(1),
  tunnelHost: tunnelHostSchema,
});
export type RobotConfig = z.infer<typeof robotConfigSchema>;

export const robotsJsonSchema = z
  .array(robotConfigSchema)
  .min(1)
  .superRefine((robots, ctx) => {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (let i = 0; i < robots.length; i += 1) {
      const robot = robots[i];
      if (robot === undefined) {
        continue;
      }
      if (ids.has(robot.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'id'],
          message: `duplicate robot id: ${robot.id}`,
        });
      }
      if (slugs.has(robot.slug)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'slug'],
          message: `duplicate robot slug: ${robot.slug}`,
        });
      }
      ids.add(robot.id);
      slugs.add(robot.slug);
    }
  });
export type RobotsConfig = z.infer<typeof robotsJsonSchema>;

export function formatZodEnvError(label: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  - ${path}: ${issue.message}`;
  });
  return `${label} is invalid:\n${lines.join('\n')}`;
}

export function parseAuthUsersJson(raw: string): AuthUsers {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('AUTH_USERS_JSON is not valid JSON');
  }
  const result = authUsersJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatZodEnvError('AUTH_USERS_JSON', result.error));
  }
  return result.data;
}

export function parseRobotsJson(raw: string): RobotsConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('ROBOTS_JSON is not valid JSON');
  }
  const result = robotsJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatZodEnvError('ROBOTS_JSON', result.error));
  }
  return result.data;
}
