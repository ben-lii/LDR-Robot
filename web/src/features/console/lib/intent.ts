export type DriveKey = 'w' | 'a' | 's' | 'd' | 'space';

export type DriveIntent = {
  readonly throttle: number;
  readonly steer: number;
  readonly brake: boolean;
};

/**
 * Maps a pressed-key set to normalized drive intent.
 * W+S cancel; A+D cancel. Space is brake only (no throttle while braking still applies).
 */
export function intentFromKeys(keys: ReadonlySet<string>): DriveIntent {
  const forward = keys.has('w');
  const back = keys.has('s');
  const left = keys.has('a');
  const right = keys.has('d');
  const brake = keys.has('space');

  let throttle = 0;
  if (forward && !back) {
    throttle = 1;
  } else if (back && !forward) {
    throttle = -1;
  }

  let steer = 0;
  if (left && !right) {
    steer = -1;
  } else if (right && !left) {
    steer = 1;
  }

  return { throttle, steer, brake };
}

export function isDriveKey(value: string): value is DriveKey {
  return (
    value === 'w' ||
    value === 'a' ||
    value === 's' ||
    value === 'd' ||
    value === 'space'
  );
}

/** Map KeyboardEvent.code → drive key. */
export function driveKeyFromCode(code: string): DriveKey | 'escape' | null {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      return 'w';
    case 'KeyS':
    case 'ArrowDown':
      return 's';
    case 'KeyA':
    case 'ArrowLeft':
      return 'a';
    case 'KeyD':
    case 'ArrowRight':
      return 'd';
    case 'Space':
      return 'space';
    case 'Escape':
      return 'escape';
    default:
      return null;
  }
}
