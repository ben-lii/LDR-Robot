'use client';

import { Hand } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import { copy } from '../copy';

export function StopButton({
  estopped,
  disabled,
  onClick,
}: {
  estopped: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={estopped ? 'neutral' : 'danger'}
      className="h-9 min-w-[88px]"
      disabled={disabled}
      onClick={onClick}
    >
      <Hand className="size-4" aria-hidden />
      {estopped ? copy.resume : copy.stop}
    </Button>
  );
}
