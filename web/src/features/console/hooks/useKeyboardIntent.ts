'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import {
  driveKeyFromCode,
  intentFromKeys,
  isDriveKey,
  type DriveIntent,
  type DriveKey,
} from '../lib/intent';

export type KeyboardIntent = {
  readonly intent: DriveIntent;
  readonly pressed: ReadonlySet<string>;
  readonly press: (key: DriveKey) => void;
  readonly release: (key: DriveKey) => void;
};

export function useKeyboardIntent(
  containerRef: RefObject<HTMLElement | null>,
  options: {
    driveEnabled: boolean;
    estopEnabled: boolean;
    onEstop: () => void;
    /** Bumps when the stage element mounts/unmounts so listeners re-attach. */
    attachKey: HTMLElement | null;
  },
): KeyboardIntent {
  const { driveEnabled, estopEnabled, onEstop, attachKey } = options;
  const [pressed, setPressed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pressedRef = useRef(new Set<string>());
  const driveEnabledRef = useRef(driveEnabled);
  const estopEnabledRef = useRef(estopEnabled);
  const onEstopRef = useRef(onEstop);

  useEffect(() => {
    driveEnabledRef.current = driveEnabled;
  }, [driveEnabled]);
  useEffect(() => {
    estopEnabledRef.current = estopEnabled;
  }, [estopEnabled]);
  useEffect(() => {
    onEstopRef.current = onEstop;
  }, [onEstop]);

  const sync = useCallback((next: Set<string>) => {
    pressedRef.current = next;
    setPressed(new Set(next));
  }, []);

  const releaseAll = useCallback(() => {
    if (pressedRef.current.size === 0) {
      return;
    }
    sync(new Set());
  }, [sync]);

  const press = useCallback(
    (key: DriveKey) => {
      if (!driveEnabledRef.current) {
        return;
      }
      if (pressedRef.current.has(key)) {
        return;
      }
      const next = new Set(pressedRef.current);
      next.add(key);
      sync(next);
    },
    [sync],
  );

  const release = useCallback(
    (key: DriveKey) => {
      if (!pressedRef.current.has(key)) {
        return;
      }
      const next = new Set(pressedRef.current);
      next.delete(key);
      sync(next);
    },
    [sync],
  );

  useEffect(() => {
    if (!driveEnabled) {
      releaseAll();
    }
  }, [driveEnabled, releaseAll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const mapped = driveKeyFromCode(event.code);
      if (!mapped) {
        return;
      }
      if (
        mapped === 'space' ||
        mapped === 'escape' ||
        event.code.startsWith('Arrow')
      ) {
        event.preventDefault();
      }
      if (event.repeat) {
        return;
      }
      if (mapped === 'escape') {
        if (estopEnabledRef.current) {
          onEstopRef.current();
        }
        return;
      }
      if (isDriveKey(mapped) && driveEnabledRef.current) {
        press(mapped);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const mapped = driveKeyFromCode(event.code);
      if (mapped && isDriveKey(mapped)) {
        release(mapped);
      }
    };

    const onBlur = () => {
      releaseAll();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        releaseAll();
      }
    };

    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('keyup', onKeyUp);
    el.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseAll();
    };
  }, [containerRef, press, release, releaseAll, attachKey]);

  return {
    intent: intentFromKeys(pressed),
    pressed,
    press,
    release,
  };
}
