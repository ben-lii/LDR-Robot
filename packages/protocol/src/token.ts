import { z } from 'zod';

import { TOKEN_ISSUER } from './constants.js';
import { driverViewerSchema } from './messages.js';

export const ROBOT_AUDIENCE_PREFIX = 'robot:' as const;

export function audienceFor(robotId: string): string {
  return `${ROBOT_AUDIENCE_PREFIX}${robotId}`;
}

export const controlTokenClaimsSchema = z.object({
  iss: z.literal(TOKEN_ISSUER),
  aud: z
    .string()
    .startsWith(ROBOT_AUDIENCE_PREFIX)
    .min(ROBOT_AUDIENCE_PREFIX.length + 1),
  sub: z.email(),
  perm: driverViewerSchema,
  sid: z.uuid(),
  jti: z.uuid(),
  iat: z.int(),
  exp: z.int(),
});

export type ControlTokenClaims = z.infer<typeof controlTokenClaimsSchema>;
