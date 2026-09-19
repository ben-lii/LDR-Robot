import { notFound, redirect } from 'next/navigation';

import { RobotConsole } from '@/features/console';
import { getSessionFromCookies } from '@/server/auth/session';
import { findUserByEmail } from '@/server/auth/users';
import { getAccessibleRobot } from '@/server/robots';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function RobotPage({ params }: PageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect('/login');
  }
  const user = findUserByEmail(session.sub);
  if (!user) {
    redirect('/login');
  }

  const { slug } = await params;
  const robot = getAccessibleRobot(user.email, slug);
  if (!robot) {
    notFound();
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4 sm:p-6">
      <RobotConsole slug={robot.slug} robotName={robot.name} />
    </main>
  );
}
