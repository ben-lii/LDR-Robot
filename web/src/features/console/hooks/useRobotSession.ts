'use client';

import {
  TOKEN_REFRESH_S,
  sessionResponseSchema,
  type IceServer,
  type Permission,
  type SessionUrls,
} from '@teleop/protocol';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { backoffDelayMs } from '../lib/backoff';
import {
  SESSION_RETRY_MAX_MS,
  SESSION_RETRY_MIN_MS,
} from '../copy';

export type SessionPhase = 'loading' | 'ready' | 'error';

export type RobotSession = {
  readonly clientSessionId: string;
  readonly token: string | null;
  readonly permission: Permission | null;
  readonly urls: SessionUrls | null;
  readonly iceServers: IceServer[];
  readonly robotName: string | null;
  readonly phase: SessionPhase;
  readonly error: string | null;
  readonly getToken: () => string | null;
  readonly retry: () => void;
};

export function useRobotSession(slug: string): RobotSession {
  const router = useRouter();
  const [clientSessionId] = useState(() => crypto.randomUUID());
  const tokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef(0);
  const attemptRef = useRef(0);
  const routerRef = useRef(router);
  const [tick, setTick] = useState(0);

  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission | null>(null);
  const [urls, setUrls] = useState<SessionUrls | null>(null);
  const [iceServers, setIceServers] = useState<IceServer[]>([]);
  const [robotName, setRobotName] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const getToken = useCallback((): string | null => tokenRef.current, []);

  const retry = useCallback(() => {
    attemptRef.current = 0;
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      refreshTimer = setTimeout(() => {
        void fetchSession();
      }, TOKEN_REFRESH_S * 1000);
    };

    const scheduleRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      const delay = backoffDelayMs(
        attemptRef.current,
        SESSION_RETRY_MIN_MS,
        SESSION_RETRY_MAX_MS,
      );
      attemptRef.current += 1;
      retryTimer = setTimeout(() => {
        void fetchSession();
      }, delay);
    };

    async function fetchSession(): Promise<void> {
      if (cancelled) {
        return;
      }

      try {
        const response = await fetch(`/api/robots/${slug}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientSessionId }),
          credentials: 'same-origin',
        });

        if (cancelled) {
          return;
        }

        if (response.status === 401) {
          routerRef.current.replace('/login');
          return;
        }

        if (!response.ok) {
          throw new Error(`session ${response.status}`);
        }

        const json: unknown = await response.json();
        const parsed = sessionResponseSchema.safeParse(json);
        if (!parsed.success) {
          throw new Error('invalid session response');
        }

        const data = parsed.data;
        tokenRef.current = data.token;
        tokenExpiresAtRef.current = Date.parse(data.tokenExpiresAt);
        attemptRef.current = 0;

        setToken(data.token);
        setPermission(data.permission);
        setUrls(data.urls);
        setIceServers(data.iceServers);
        setRobotName(data.robot.name);
        setPhase('ready');
        setError(null);
        scheduleRefresh();
      } catch {
        if (cancelled) {
          return;
        }
        const stillValid =
          tokenRef.current !== null &&
          Date.now() < tokenExpiresAtRef.current - 2000;
        if (!stillValid) {
          setPhase('error');
        }
        setError('unreachable');
        scheduleRetry();
      }
    }

    void fetchSession();

    return () => {
      cancelled = true;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [slug, tick, clientSessionId]);

  return {
    clientSessionId,
    token,
    permission,
    urls,
    iceServers,
    robotName,
    phase,
    error,
    getToken,
    retry,
  };
}
