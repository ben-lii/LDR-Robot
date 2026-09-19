import { sessionRequestSchema, type SessionResponse } from '@teleop/protocol';

import { getServerEnv } from '@/lib/env.server';
import { getSessionFromCookies } from '@/server/auth/session';
import { findUserByEmail } from '@/server/auth/users';
import { createIceProvider } from '@/server/ice';
import { jsonError, jsonOk, originAllowed } from '@/server/http';
import { buildRobotUrls } from '@/server/robotUrls';
import { getAccessibleRobot } from '@/server/robots';
import { signControlToken } from '@/server/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  if (!originAllowed(request)) {
    return jsonError('bad_request', 400);
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError('unauthenticated', 401);
  }

  const user = findUserByEmail(session.sub);
  if (!user) {
    return jsonError('unauthenticated', 401);
  }

  const { slug } = await context.params;
  const robot = getAccessibleRobot(user.email, slug);
  if (!robot) {
    return jsonError('not_found', 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 400);
  }

  const parsed = sessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 400);
  }

  const env = getServerEnv();
  const signed = await signControlToken({
    robotId: robot.id,
    email: user.email,
    permission: user.permission,
    clientSessionId: parsed.data.clientSessionId,
  });

  const urls = buildRobotUrls({
    tunnelHost: robot.tunnelHost,
    nodeEnv: env.nodeEnv,
    devRobotOriginOverride: env.devRobotOriginOverride,
  });

  const iceServers = await createIceProvider().getIceServers();
  const now = new Date();

  const response: SessionResponse = {
    robot: {
      id: robot.id,
      slug: robot.slug,
      name: robot.name,
    },
    permission: user.permission,
    token: signed.token,
    tokenExpiresAt: signed.expiresAt.toISOString(),
    urls,
    iceServers,
    serverTime: now.toISOString(),
  };

  return jsonOk(response);
}
