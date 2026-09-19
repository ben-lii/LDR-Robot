'use client';

import type { Permission, Role, RobotState } from '@teleop/protocol';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

import { copy } from '../copy';

export function RoleBadge({
  permission,
  role,
  robotState,
  socketOpen,
  onTakeControl,
}: {
  permission: Permission | null;
  role: Role | null;
  robotState: RobotState | null;
  socketOpen: boolean;
  onTakeControl: () => void;
}) {
  if (!socketOpen || !permission || !role) {
    return (
      <Badge tone="amber" live>
        {copy.roleConnecting}
      </Badge>
    );
  }

  if (role === 'driver') {
    return (
      <Badge tone="neutral" live>
        {copy.roleDriving}
      </Badge>
    );
  }

  if (permission === 'viewer') {
    return (
      <Badge tone="neutral" live>
        {copy.roleViewing}
      </Badge>
    );
  }

  // Driver permission but viewer role
  const seatTaken = robotState?.driverPresent === true;
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone="amber" live>
        {seatTaken ? copy.roleSomeoneElse : copy.roleViewing}
      </Badge>
      {!seatTaken ? (
        <Button variant="outline" className="h-7 px-2 text-xs" onClick={onTakeControl}>
          {copy.takeControl}
        </Button>
      ) : null}
    </span>
  );
}
