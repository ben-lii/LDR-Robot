import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

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
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[736px] rounded-[var(--radius-card)] border border-border bg-surface p-[18px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-text">{robot.name}</h1>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-text-muted hover:text-text">
              All robots
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-sm text-text-muted hover:text-text"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        <div
          className="flex aspect-[2/1] items-center justify-center rounded-[var(--radius-panel)] border border-border bg-stage text-sm text-text-muted"
          style={{ aspectRatio: 'var(--stage-aspect)' }}
        >
          Console UI arrives in Phase 5. Session API is ready.
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Permission: {user.permission} · slug: {robot.slug}
        </p>
      </div>
    </main>
  );
}
