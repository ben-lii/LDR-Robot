'use client';

import { KeyCap } from '@/components/ui/KeyCap';

import { copy } from '../copy';
import type { DriveKey } from '../lib/intent';

export function KeyPad({
  pressed,
  disabled,
  onPress,
  onRelease,
}: {
  pressed: ReadonlySet<string>;
  disabled: boolean;
  onPress: (key: DriveKey) => void;
  onRelease: (key: DriveKey) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        <span />
        <KeyCap
          label="W"
          pressed={pressed.has('w')}
          disabled={disabled}
          onPress={() => onPress('w')}
          onRelease={() => onRelease('w')}
        />
        <span />
        <KeyCap
          label="A"
          pressed={pressed.has('a')}
          disabled={disabled}
          onPress={() => onPress('a')}
          onRelease={() => onRelease('a')}
        />
        <KeyCap
          label="S"
          pressed={pressed.has('s')}
          disabled={disabled}
          onPress={() => onPress('s')}
          onRelease={() => onRelease('s')}
        />
        <KeyCap
          label="D"
          pressed={pressed.has('d')}
          disabled={disabled}
          onPress={() => onPress('d')}
          onRelease={() => onRelease('d')}
        />
      </div>
      <KeyCap
        label={copy.space}
        pressed={pressed.has('space')}
        disabled={disabled}
        wide
        onPress={() => onPress('space')}
        onRelease={() => onRelease('space')}
      />
    </div>
  );
}
