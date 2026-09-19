'use client';

import type { IceServer } from '@teleop/protocol';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { backoffDelayMs } from '../lib/backoff';
import { runWhepSession, type WhepStatus } from '../lib/whep';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10_000;
const UNAVAILABLE_RETRY_MS = 10_000;

export function useWhepVideo(options: {
  whepUrl: string | null;
  getToken: () => string | null;
  iceServers: readonly IceServer[];
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
}): { status: WhepStatus } {
  const { whepUrl, getToken, iceServers, videoRef, enabled } = options;
  const [status, setStatus] = useState<WhepStatus>('idle');
  const getTokenRef = useRef(getToken);
  const iceRef = useRef(iceServers);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);
  useEffect(() => {
    iceRef.current = iceServers;
  }, [iceServers]);

  useEffect(() => {
    if (!enabled || !whepUrl) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const loop = async () => {
      while (!cancelled) {
        const video = videoRef.current;
        if (!video) {
          await new Promise((r) => {
            timer = setTimeout(r, 250);
          });
          continue;
        }

        controller = new AbortController();
        try {
          const result = await runWhepSession({
            whepUrl,
            getToken: () => getTokenRef.current(),
            iceServers: iceRef.current,
            video,
            onStatus: (next) => {
              if (!cancelled) {
                setStatus(next);
              }
            },
            signal: controller.signal,
          });

          if (cancelled) {
            return;
          }

          if (result === 'unavailable') {
            setStatus('unavailable');
            await new Promise((r) => {
              timer = setTimeout(r, UNAVAILABLE_RETRY_MS);
            });
            attempt = 0;
            continue;
          }

          setStatus('reconnecting');
          const delay = backoffDelayMs(
            attempt,
            RECONNECT_MIN_MS,
            RECONNECT_MAX_MS,
          );
          attempt += 1;
          await new Promise((r) => {
            timer = setTimeout(r, delay);
          });
        } catch {
          if (cancelled) {
            return;
          }
          setStatus('reconnecting');
          const delay = backoffDelayMs(
            attempt,
            RECONNECT_MIN_MS,
            RECONNECT_MAX_MS,
          );
          attempt += 1;
          await new Promise((r) => {
            timer = setTimeout(r, delay);
          });
        }
      }
    };

    void loop();

    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
    };
  }, [enabled, whepUrl, videoRef]);

  return { status: enabled && whepUrl ? status : 'idle' };
}
