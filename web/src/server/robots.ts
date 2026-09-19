import 'server-only';

import type { RobotConfig } from '@/lib/env.schemas';
import { getServerEnv } from '@/lib/env.server';
import {
  findUserByEmail,
  listRobotsForUser,
  userCanAccessRobot,
} from '@/server/auth/users';

export function getRobotBySlug(slug: string): RobotConfig | undefined {
  return getServerEnv().robots.find((robot) => robot.slug === slug);
}

export function getAccessibleRobot(
  email: string,
  slug: string,
): RobotConfig | undefined {
  const user = findUserByEmail(email);
  if (!user) {
    return undefined;
  }
  const robot = getRobotBySlug(slug);
  if (!robot || !userCanAccessRobot(user, slug)) {
    return undefined;
  }
  return robot;
}

export function getRobotsForEmail(email: string): RobotConfig[] {
  const user = findUserByEmail(email);
  if (!user) {
    return [];
  }
  return listRobotsForUser(user);
}
