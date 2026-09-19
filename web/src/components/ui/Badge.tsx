import type { ReactNode } from 'react';

type BadgeTone = 'online' | 'offline' | 'live' | 'amber' | 'neutral' | 'danger';

const toneClass: Record<BadgeTone, string> = {
  online: 'bg-online-bg text-online-fg',
  offline: 'bg-border text-text-muted',
  live: 'bg-live-bg text-live-fg',
  amber: 'bg-amber-bg text-amber-fg',
  neutral: 'bg-border text-text',
  danger: 'bg-danger-bg text-danger-fg',
};

export function Badge({
  tone,
  children,
  icon,
  live,
}: {
  tone: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  live?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-badge)] px-2.5 text-xs font-medium ${toneClass[tone]}`}
      {...(live ? { 'aria-live': 'polite' as const } : {})}
    >
      {icon}
      {children}
    </span>
  );
}
