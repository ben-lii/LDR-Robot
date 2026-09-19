import { loginRequestSchema } from '@teleop/protocol';

import { getServerEnv } from '@/lib/env.server';
import { setSessionCookie, signSessionToken } from '@/server/auth/session';
import { verifyLoginCredentials } from '@/server/auth/users';
import {
  clientIp,
  jsonError,
  jsonOk,
  originAllowed,
  sleep,
} from '@/server/http';
import { loginFailureLimiter } from '@/server/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAIL_DELAY_MS = 300;

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) {
    return jsonError('bad_request', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 400);
  }

  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 400);
  }

  const email = parsed.data.email.toLowerCase();
  const ip = clientIp(request);
  const limitKey = `${ip}:${email}`;

  if (loginFailureLimiter.isLimited(limitKey)) {
    await sleep(FAIL_DELAY_MS);
    return jsonError('rate_limited', 429);
  }

  try {
    getServerEnv();
  } catch (error) {
    console.error(error);
    return jsonError('server_error', 500);
  }

  const user = await verifyLoginCredentials(email, parsed.data.password);
  if (!user) {
    loginFailureLimiter.recordFailure(limitKey);
    await sleep(FAIL_DELAY_MS);
    return jsonError('unauthenticated', 401);
  }

  loginFailureLimiter.reset(limitKey);
  const token = await signSessionToken(user.email);
  await setSessionCookie(token);

  return jsonOk({ ok: true });
}
