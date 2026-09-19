import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSessionFromCookies } from '@/server/auth/session';
import { findUserByEmail } from '@/server/auth/users';
import { getRobotsForEmail } from '@/server/robots';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect('/login');
  }
  const user = findUserByEmail(session.sub);
  if (!user) {
    redirect('/login');
  }

  const robots = getRobotsForEmail(user.email);
  if (robots.length === 1) {
    const only = robots[0];
    if (only) {
      redirect(`/robots/${only.slug}`);
    }
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[736px] rounded-[var(--radius-card)] border border-border bg-surface p-[18px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text">Your robots</h1>
            <p className="text-sm text-text-muted">{user.email}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-text-muted hover:text-text"
            >
              Log out
            </button>
          </form>
        </div>
        {robots.length === 0 ? (
          <p className="text-sm text-text-muted">
            No robots are assigned to this account.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {robots.map((robot) => (
              <li key={robot.id}>
                <Link
                  href={`/robots/${robot.slug}`}
                  className="block rounded-[var(--radius-panel)] border border-border bg-stage px-4 py-3 text-text hover:border-border-strong"
                >
                  {robot.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
