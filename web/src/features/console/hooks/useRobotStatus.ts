'use client';

import {
  OFFLINE_AFTER_FAILED_POLLS,
  STATUS_POLL_MS,
  robotStatusSchema,
  type RobotStatus,
} from '@teleop/protocol';
import { useEffect, useState } from 'react';

export type RobotStatusState = {
  readonly online: boolean;
  readonly status: RobotStatus | null;
};

export function useRobotStatus(options: {
  statusUrl: string | null;
  getToken: () => string | null;
  socketOpen: boolean;
}): RobotStatusState {
  const { statusUrl, getToken, socketOpen } = options;
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [pollOnline, setPollOnline] = useState(false);

  useEffect(() => {
    if (!statusUrl) {
      return;
    }
    const url = statusUrl;

    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (ms: number) => {
      clearTimer();
      timer = setTimeout(() => {
        void poll();
      }, ms);
    };

    async function poll(): Promise<void> {
      if (cancelled) {
        return;
      }
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        schedule(STATUS_POLL_MS);
        return;
      }

      const token = getToken();
      if (!token) {
        schedule(STATUS_POLL_MS);
        return;
      }

      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const json: unknown = await response.json();
        const parsed = robotStatusSchema.safeParse(json);
        if (!parsed.success) {
          throw new Error('invalid status');
        }
        if (cancelled) {
          return;
        }
        failures = 0;
        setStatus(parsed.data);
        setPollOnline(true);
      } catch {
        if (cancelled) {
          return;
        }
        failures += 1;
        if (failures >= OFFLINE_AFTER_FAILED_POLLS) {
          setPollOnline(false);
        }
      }
      schedule(STATUS_POLL_MS);
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    void poll();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [statusUrl, getToken]);

  const effectiveOnline = Boolean(statusUrl) && (socketOpen || pollOnline);
  const effectiveStatus = statusUrl ? status : null;

  return {
    online: effectiveOnline,
    status: effectiveStatus,
  };
}
