import { z } from 'zod';

import { driverViewerSchema } from './messages.js';

export const robotSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);

export const loginRequestSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionRequestSchema = z.strictObject({
  clientSessionId: z.uuid(),
});
export type SessionRequest = z.infer<typeof sessionRequestSchema>;

export const apiErrorCodeSchema = z.enum([
  'unauthenticated',
  'not_found',
  'bad_request',
  'rate_limited',
  'server_error',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.strictObject({
  error: apiErrorCodeSchema,
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const iceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().min(1).exactOptional(),
  credential: z.string().min(1).exactOptional(),
});
export type IceServer = z.infer<typeof iceServerSchema>;

export const sessionRobotSchema = z.strictObject({
  id: z.uuid(),
  slug: robotSlugSchema,
  name: z.string().min(1),
});
export type SessionRobot = z.infer<typeof sessionRobotSchema>;

export const sessionUrlsSchema = z.strictObject({
  ws: z.string().min(1),
  whep: z.string().min(1),
  status: z.string().min(1),
});
export type SessionUrls = z.infer<typeof sessionUrlsSchema>;

export const sessionResponseSchema = z.strictObject({
  robot: sessionRobotSchema,
  permission: driverViewerSchema,
  token: z.string().min(1),
  tokenExpiresAt: z.iso.datetime(),
  urls: sessionUrlsSchema,
  iceServers: z.array(iceServerSchema),
  serverTime: z.iso.datetime(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
