'use client';

import { useCallback, useState } from 'react';

import {
  SPEED_DEFAULT,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STORAGE_KEY,
} from '../copy';

function readStoredSpeed(): number {
  if (typeof window === 'undefined') {
    return SPEED_DEFAULT;
  }
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    if (raw === null) {
      return SPEED_DEFAULT;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return SPEED_DEFAULT;
    }
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(n / 5) * 5));
  } catch {
    return SPEED_DEFAULT;
  }
}

export function useSpeedPercent(): {
  speed: number;
  setSpeed: (value: number) => void;
} {
  const [speed, setSpeedState] = useState(readStoredSpeed);

  const setSpeed = useCallback((value: number) => {
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, value));
    setSpeedState(clamped);
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  return { speed, setSpeed };
}
