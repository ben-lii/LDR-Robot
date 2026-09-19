'use client';

import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import { LatencyPill } from './LatencyPill';
import { RoleBadge } from './RoleBadge';
import { StatusBadge } from './StatusBadge';
import { copy } from '../copy';
import type { Permission, Role, RobotState } from '@teleop/protocol';

export function ConsoleHeader({
  name,
  online,
  permission,
  role,
  robotState,
  socketOpen,
  latencyMs,
  onTakeControl,
}: {
  name: string;
  online: boolean;
  permission: Permission | null;
  role: Role | null;
  robotState: RobotState | null;
  socketOpen: boolean;
  latencyMs: number | null;
  onTakeControl: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="truncate text-xl font-semibold text-text">{name}</h1>
        <StatusBadge online={online} />
        <RoleBadge
          permission={permission}
          role={role}
          robotState={robotState}
          socketOpen={socketOpen}
          onTakeControl={onTakeControl}
        />
      </div>
      <div className="flex items-center gap-3">
        <LatencyPill latencyMs={latencyMs} />
        <form action="/auth/signout" method="post">
          <Button variant="ghost" type="submit" aria-label={copy.logOut}>
            <LogOut className="size-4" aria-hidden />
            {copy.logOut}
          </Button>
        </form>
      </div>
    </header>
  );
}
