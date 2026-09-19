import 'server-only';

import type { AuthUser, RobotConfig } from '@/lib/env.schemas';
import { getServerEnv } from '@/lib/env.server';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/server/auth/password';

export function findUserByEmail(email: string): AuthUser | undefined {
  const normalized = email.toLowerCase();
  return getServerEnv().authUsers.find((user) => user.email === normalized);
}

export function userCanAccessRobot(user: AuthUser, slug: string): boolean {
  if (user.robots === '*') {
    return true;
  }
  return user.robots.includes(slug);
}

export function listRobotsForUser(user: AuthUser): RobotConfig[] {
  const robots = getServerEnv().robots;
  if (user.robots === '*') {
    return [...robots];
  }
  const allowed = new Set(user.robots);
  return robots.filter((robot) => allowed.has(robot.slug));
}

/**
 * Verifies password. For unknown emails, still runs scrypt against a dummy hash
 * so timing does not reveal whether the account exists.
 */
export async function verifyLoginCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const user = findUserByEmail(email);
  const hash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) {
    return null;
  }
  return user;
}
