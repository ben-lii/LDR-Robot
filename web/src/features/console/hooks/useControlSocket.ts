'use client';

import {
  DRIVER_IDLE_RELEASE_S,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type Permission,
  type Role,
  type RobotState,
} from '@teleop/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

import { backoffDelayMs } from '../lib/backoff';
import { median, pushSample } from '../lib/latency';
import {
  LATENCY_SAMPLE_COUNT,
  PONG_MISS_LIMIT,
  WS_RECONNECT_MAX_MS,
  WS_RECONNECT_MIN_MS,
} from '../copy';

export type SocketState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'open'
  | 'reconnecting'
  | 'closed';

export type ControlSocket = {
  readonly state: SocketState;
  readonly robotState: RobotState | null;
  readonly role: Role | null;
  readonly latencyMs: number | null;
  readonly send: (msg: ClientMessage) => void;
  readonly requestControl: () => void;
  readonly releaseControl: () => void;
  readonly noteDriveActivity: (hasNonZero: boolean) => void;
};

export function useControlSocket(options: {
  wsUrl: string | null;
  getToken: () => string | null;
  permission: Permission | null;
  clientSessionId: string;
  token: string | null;
  enabled: boolean;
}): ControlSocket {
  const {
    wsUrl,
    getToken,
    permission,
    clientSessionId,
    token,
    enabled,
  } = options;

  const active = Boolean(enabled && wsUrl && permission);

  const [connState, setConnState] = useState<SocketState>('idle');
  const [robotState, setRobotState] = useState<RobotState | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const stateRef = useRef<SocketState>('idle');
  const roleRef = useRef<Role | null>(null);
  const attemptRef = useRef(0);
  const pingIdRef = useRef(0);
  const pendingPingsRef = useRef(new Map<number, number>());
  const rttsRef = useRef<number[]>([]);
  const lastActivityRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const setSocketState = useCallback((next: SocketState) => {
    stateRef.current = next;
    setConnState(next);
  }, []);

  const sendRaw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(msg));
  }, []);

  const send = useCallback(
    (msg: ClientMessage) => {
      if (stateRef.current !== 'open') {
        return;
      }
      sendRaw(msg);
    },
    [sendRaw],
  );

  const requestControl = useCallback(() => {
    send({ v: PROTOCOL_VERSION, type: 'request_control' });
  }, [send]);

  const releaseControl = useCallback(() => {
    send({ v: PROTOCOL_VERSION, type: 'release_control' });
  }, [send]);

  const noteDriveActivity = useCallback((hasNonZero: boolean) => {
    if (hasNonZero) {
      lastActivityRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (!token || stateRef.current !== 'open') {
      return;
    }
    sendRaw({
      v: PROTOCOL_VERSION,
      type: 'token_refresh',
      token,
    });
  }, [token, sendRaw]);

  useEffect(() => {
    if (!active || !wsUrl || !permission) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      stateRef.current = 'idle';
      return;
    }

    let cancelled = false;

    const stopKeepalive = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (idleTimerRef.current) {
        clearInterval(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    const startKeepalive = () => {
      stopKeepalive();
      pendingPingsRef.current.clear();
      pingTimerRef.current = setInterval(() => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          return;
        }
        if (pendingPingsRef.current.size >= PONG_MISS_LIMIT) {
          try {
            ws.close();
          } catch {
            // ignore
          }
          return;
        }
        const id = pingIdRef.current++;
        const t = Date.now();
        pendingPingsRef.current.set(id, t);
        ws.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'ping',
            id,
            t,
          } satisfies ClientMessage),
        );
      }, PING_INTERVAL_MS);

      idleTimerRef.current = setInterval(() => {
        if (roleRef.current !== 'driver') {
          return;
        }
        if (lastActivityRef.current === 0) {
          return;
        }
        if (
          Date.now() - lastActivityRef.current >=
          DRIVER_IDLE_RELEASE_S * 1000
        ) {
          sendRaw({ v: PROTOCOL_VERSION, type: 'release_control' });
          lastActivityRef.current = Date.now();
        }
      }, 5000);
    };

    const detach = (ws: WebSocket) => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
    };

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }
      setSocketState('reconnecting');
      const delay = backoffDelayMs(
        attemptRef.current,
        WS_RECONNECT_MIN_MS,
        WS_RECONNECT_MAX_MS,
      );
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled) {
        return;
      }
      const authToken = getTokenRef.current();
      if (!authToken) {
        scheduleReconnect();
        return;
      }

      stopKeepalive();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        detach(wsRef.current);
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      setSocketState(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled || wsRef.current !== ws) {
          return;
        }
        setSocketState('authenticating');
        const current = getTokenRef.current();
        if (!current) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            type: 'hello',
            token: current,
            clientSessionId,
            wantControl: permission === 'driver',
          } satisfies ClientMessage),
        );
      };

      ws.onmessage = (event) => {
        if (cancelled || wsRef.current !== ws) {
          return;
        }
        const parsed = parseServerMessage(
          typeof event.data === 'string' ? event.data : String(event.data),
        );
        if (!parsed.ok) {
          return;
        }
        const msg = parsed.value;
        switch (msg.type) {
          case 'welcome':
            attemptRef.current = 0;
            setRole(msg.role);
            setRobotState(msg.state);
            setSocketState('open');
            lastActivityRef.current = Date.now();
            startKeepalive();
            break;
          case 'role_changed':
            setRole(msg.role);
            break;
          case 'state':
            setRobotState(msg.state);
            break;
          case 'pong': {
            const sentAt = pendingPingsRef.current.get(msg.id);
            pendingPingsRef.current.delete(msg.id);
            if (sentAt !== undefined) {
              const rtt = Date.now() - sentAt;
              rttsRef.current = pushSample(
                rttsRef.current,
                rtt,
                LATENCY_SAMPLE_COUNT,
              );
              setLatencyMs(median(rttsRef.current));
            }
            break;
          }
          case 'error':
            if (msg.fatal) {
              try {
                ws.close();
              } catch {
                // ignore
              }
            }
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        // close handler drives reconnect
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        detach(ws);
        stopKeepalive();
        if (cancelled) {
          return;
        }
        setRole(null);
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopKeepalive();
      if (wsRef.current) {
        detach(wsRef.current);
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      stateRef.current = 'closed';
    };
  }, [active, wsUrl, permission, clientSessionId, sendRaw, setSocketState]);

  const state: SocketState = active ? connState : 'idle';
  const displayRole = active ? role : null;
  const displayRobotState = active ? robotState : null;
  const displayLatency = active ? latencyMs : null;

  return {
    state,
    robotState: displayRobotState,
    role: displayRole,
    latencyMs: displayLatency,
    send,
    requestControl,
    releaseControl,
    noteDriveActivity,
  };
}
