'use client';

import { CircleCheck, WifiOff } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';

import { copy } from '../copy';

export function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge
      tone={online ? 'online' : 'offline'}
      live
      icon={
        online ? (
          <CircleCheck className="size-3.5" aria-hidden />
        ) : (
          <WifiOff className="size-3.5" aria-hidden />
        )
      }
    >
      {online ? copy.online : copy.offline}
    </Badge>
  );
}
