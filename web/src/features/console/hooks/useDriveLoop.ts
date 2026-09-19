'use client';

import { DRIVE_SEND_HZ, PROTOCOL_VERSION } from '@teleop/protocol';
import { useEffect, useRef } from 'react';

import type { DriveIntent } from '../lib/intent';
import type { ClientMessage } from '@teleop/protocol';

export function useDriveLoop(options: {
  send: (msg: ClientMessage) => void;
  intent: DriveIntent;
  speed: number;
  enabled: boolean;
  onActivity: (hasNonZero: boolean) => void;
}): void {
  const { send, intent, speed, enabled, onActivity } = options;
  const intentRef = useRef(intent);
  const speedRef = useRef(speed);
  const sendRef = useRef(send);
  const onActivityRef = useRef(onActivity);
  const brakeRef = useRef(false);

  useEffect(() => {
    intentRef.current = intent;
  }, [intent]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  useEffect(() => {
    if (!enabled) {
      if (brakeRef.current) {
        sendRef.current({
          v: PROTOCOL_VERSION,
          type: 'brake',
          active: false,
        });
        brakeRef.current = false;
      }
      return;
    }

    const intervalMs = 1000 / DRIVE_SEND_HZ;
    const timer = setInterval(() => {
      const current = intentRef.current;
      const hasNonZero =
        current.throttle !== 0 || current.steer !== 0 || current.brake;
      onActivityRef.current(hasNonZero);

      if (current.brake !== brakeRef.current) {
        brakeRef.current = current.brake;
        sendRef.current({
          v: PROTOCOL_VERSION,
          type: 'brake',
          active: current.brake,
        });
      }

      if (!current.brake) {
        sendRef.current({
          v: PROTOCOL_VERSION,
          type: 'drive',
          throttle: current.throttle,
          steer: current.steer,
          speed: speedRef.current,
        });
      }
    }, intervalMs);

    return () => {
      clearInterval(timer);
      if (brakeRef.current) {
        sendRef.current({
          v: PROTOCOL_VERSION,
          type: 'brake',
          active: false,
        });
        brakeRef.current = false;
      }
    };
  }, [enabled]);
}
