'use client';

import { Mic, MicOff } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import { copy } from '../copy';

export function MicToggle({
  muted,
  disabled,
  onToggle,
}: {
  muted: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="h-9 w-12 px-0"
      disabled={disabled}
      aria-pressed={!muted}
      aria-label={muted ? copy.micListen : copy.micMute}
      onClick={onToggle}
    >
      {muted ? (
        <MicOff className="size-4" aria-hidden />
      ) : (
        <Mic className="size-4" aria-hidden />
      )}
    </Button>
  );
}
