import {
  AUTH_TIMEOUT_MS,
  MAX_WS_MESSAGE_BYTES,
  MAX_WS_MSG_PER_SEC,
  PROTOCOL_VERSION,
  VIEWER_CAN_ESTOP,
  WS_CLOSE,
  parseClientMessage,
  type ClientMessage,
  type ControlTokenClaims,
  type Permission,
  type Role,
  type RobotState,
  type ServerMessage,
} from '@teleop/protocol';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

import type { TokenVerifier } from '../auth/verifyToken.js';
import type { Config } from '../config.js';
import type { Clock } from '../control/clock.js';
import type { MotorController } from '../control/motorController.js';
import type { SeatManager } from '../control/seatManager.js';
import type { Logger } from '../logger.js';
import { originAllowed } from './cors.js';

type Conn = {
  id: string;
  socket: WebSocket;
  authed: boolean;
  claims: ControlTokenClaims | null;
  role: Role;
  permission: Permission;
  authExpiresAtMs: number;
  msgWindowStart: number;
  msgCount: number;
  badMessages: number;
  lastForbiddenAt: number;
  authTimer: ReturnType<typeof setTimeout> | null;
};

export type WsServer = {
  close(): Promise<void>;
  broadcastState(state: RobotState): void;
  connectionCount(): number;
};

export function attachWsServer(options: {
  httpServer: HttpServer;
  config: Config;
  log: Logger;
  clock: Clock;
  verifier: TokenVerifier;
  seat: SeatManager;
  controller: MotorController;
  getState: () => RobotState;
}): WsServer {
  const { config, log, clock, verifier, seat, controller, getState } = options;
  const wss = new WebSocketServer({
    server: options.httpServer,
    path: '/ws',
    maxPayload: MAX_WS_MESSAGE_BYTES,
  });
  const conns = new Map<string, Conn>();
  let stateTimer: ReturnType<typeof setInterval> | null = null;

  const broadcast = (message: ServerMessage, exceptId?: string): void => {
    const raw = JSON.stringify(message);
    for (const conn of conns.values()) {
      if (!conn.authed || conn.id === exceptId) {
        continue;
      }
      if (conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(raw);
      }
    }
  };

  const send = (conn: Conn, message: ServerMessage): void => {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(message));
    }
  };

  const closeConn = (conn: Conn, code: number, reason: string): void => {
    try {
      conn.socket.close(code, reason);
    } catch {
      // ignore
    }
  };

  const releaseIfDriver = (conn: Conn): void => {
    if (seat.release(conn.id)) {
      controller.revokeControl();
      broadcast({
        v: PROTOCOL_VERSION,
        type: 'role_changed',
        role: 'viewer',
        reason: 'released',
      });
      broadcastState(getState());
    }
  };

  const broadcastState = (state: RobotState): void => {
    broadcast({ v: PROTOCOL_VERSION, type: 'state', state });
  };

  stateTimer = setInterval(() => {
    broadcastState(getState());
  }, 1000);
  stateTimer.unref?.();

  wss.on('connection', (socket, req) => {
    void handleConnection(socket, req);
  });

  async function handleConnection(
    socket: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const origin = req.headers.origin;
    if (!originAllowed(origin, config.allowedOrigins)) {
      socket.close(WS_CLOSE.UNAUTHORIZED, 'origin');
      return;
    }
    if (conns.size >= config.maxWsClients) {
      socket.close(WS_CLOSE.SERVER_BUSY, 'busy');
      return;
    }

    const conn: Conn = {
      id: randomUUID(),
      socket,
      authed: false,
      claims: null,
      role: 'viewer',
      permission: 'viewer',
      authExpiresAtMs: 0,
      msgWindowStart: clock.now(),
      msgCount: 0,
      badMessages: 0,
      lastForbiddenAt: 0,
      authTimer: setTimeout(() => {
        if (!conn.authed) {
          closeConn(conn, WS_CLOSE.AUTH_TIMEOUT, 'auth timeout');
        }
      }, AUTH_TIMEOUT_MS),
    };
    conns.set(conn.id, conn);

    socket.on('message', (data, isBinary) => {
      void onMessage(conn, data, isBinary);
    });
    socket.on('close', () => {
      if (conn.authTimer) {
        clearTimeout(conn.authTimer);
      }
      conns.delete(conn.id);
      releaseIfDriver(conn);
    });
    socket.on('error', (err) => {
      log.warn({ err, connId: conn.id }, 'ws error');
    });
  }

  async function onMessage(
    conn: Conn,
    data: WebSocket.RawData,
    isBinary: boolean,
  ): Promise<void> {
    try {
      if (isBinary) {
        closeConn(conn, WS_CLOSE.PROTOCOL_ERROR, 'binary');
        return;
      }
      const now = clock.now();
      if (now - conn.msgWindowStart >= 1000) {
        conn.msgWindowStart = now;
        conn.msgCount = 0;
      }
      conn.msgCount += 1;
      if (conn.msgCount > MAX_WS_MSG_PER_SEC) {
        closeConn(conn, WS_CLOSE.PROTOCOL_ERROR, 'rate');
        return;
      }

      const raw = typeof data === 'string' ? data : data.toString('utf8');
      const parsed = parseClientMessage(raw);
      if (!parsed.ok) {
        conn.badMessages += 1;
        send(conn, {
          v: PROTOCOL_VERSION,
          type: 'error',
          code: 'BAD_MESSAGE',
          message: parsed.error,
          fatal: false,
        });
        if (conn.badMessages >= 5) {
          closeConn(conn, WS_CLOSE.PROTOCOL_ERROR, 'bad messages');
        }
        return;
      }

      const msg = parsed.value;
      if (!conn.authed) {
        if (msg.type !== 'hello') {
          closeConn(conn, WS_CLOSE.PROTOCOL_ERROR, 'expected hello');
          return;
        }
        await handleHello(conn, msg);
        return;
      }

      if (now > conn.authExpiresAtMs) {
        await expireAuth(conn);
        return;
      }

      await dispatch(conn, msg);
    } catch (error) {
      log.error({ err: error, connId: conn.id }, 'ws message handler');
    }
  }

  async function handleHello(
    conn: Conn,
    msg: Extract<ClientMessage, { type: 'hello' }>,
  ): Promise<void> {
    const verified = await verifier.verify(msg.token, clock.now());
    if (!verified.ok) {
      if (verified.error === 'CLOCK_INVALID') {
        log.error('CLOCK_INVALID — refusing tokens until system clock syncs');
      }
      send(conn, {
        v: PROTOCOL_VERSION,
        type: 'error',
        code: 'UNAUTHORIZED',
        message: verified.error,
        fatal: true,
      });
      closeConn(conn, WS_CLOSE.UNAUTHORIZED, 'unauthorized');
      return;
    }

    const claims = verified.value;
    if (claims.sid !== msg.clientSessionId) {
      closeConn(conn, WS_CLOSE.UNAUTHORIZED, 'sid mismatch');
      return;
    }

    conn.authed = true;
    conn.claims = claims;
    conn.permission = claims.perm;
    conn.authExpiresAtMs = claims.exp * 1000;
    if (conn.authTimer) {
      clearTimeout(conn.authTimer);
      conn.authTimer = null;
    }

    let role: Role = 'viewer';
    if (msg.wantControl) {
      const grant = seat.request(conn.id, claims.sid, claims.perm);
      if (grant.granted) {
        role = 'driver';
        if (grant.supersededConnectionId) {
          const old = conns.get(grant.supersededConnectionId);
          if (old) {
            closeConn(old, WS_CLOSE.SUPERSEDED, 'superseded');
          }
        }
        broadcast({
          v: PROTOCOL_VERSION,
          type: 'role_changed',
          role: 'driver',
          reason: 'granted',
        });
      } else {
        send(conn, {
          v: PROTOCOL_VERSION,
          type: 'error',
          code: grant.errorCode,
          message: grant.reason,
          fatal: false,
        });
        send(conn, {
          v: PROTOCOL_VERSION,
          type: 'role_changed',
          role: 'viewer',
          reason: grant.reason,
        });
      }
    }
    conn.role = role;

    send(conn, {
      v: PROTOCOL_VERSION,
      type: 'welcome',
      robotId: config.robotId,
      permission: claims.perm,
      role,
      limits: {
        watchdogMs: config.watchdogMs,
        maxSpeedPercent: config.maxSpeedPercent,
      },
      state: getState(),
    });
    broadcastState(getState());
  }

  async function expireAuth(conn: Conn): Promise<void> {
    if (seat.isHolder(conn.id)) {
      seat.clear();
      controller.revokeControl();
      broadcast({
        v: PROTOCOL_VERSION,
        type: 'role_changed',
        role: 'viewer',
        reason: 'token',
      });
    }
    send(conn, {
      v: PROTOCOL_VERSION,
      type: 'error',
      code: 'TOKEN_EXPIRED',
      message: 'token expired',
      fatal: true,
    });
    closeConn(conn, WS_CLOSE.TOKEN_EXPIRED, 'expired');
  }

  async function dispatch(conn: Conn, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'hello':
        send(conn, {
          v: PROTOCOL_VERSION,
          type: 'error',
          code: 'BAD_MESSAGE',
          message: 'already authenticated',
          fatal: false,
        });
        return;
      case 'ping':
        send(conn, {
          v: PROTOCOL_VERSION,
          type: 'pong',
          id: msg.id,
          t: msg.t,
        });
        return;
      case 'token_refresh':
        await handleTokenRefresh(conn, msg.token);
        return;
      case 'request_control': {
        if (!conn.claims) {
          return;
        }
        const grant = seat.request(conn.id, conn.claims.sid, conn.permission);
        if (grant.granted) {
          conn.role = 'driver';
          if (grant.supersededConnectionId) {
            const old = conns.get(grant.supersededConnectionId);
            if (old) {
              closeConn(old, WS_CLOSE.SUPERSEDED, 'superseded');
            }
          }
          send(conn, {
            v: PROTOCOL_VERSION,
            type: 'role_changed',
            role: 'driver',
            reason: 'granted',
          });
          broadcastState(getState());
        } else {
          send(conn, {
            v: PROTOCOL_VERSION,
            type: 'error',
            code: grant.errorCode,
            message: grant.reason,
            fatal: false,
          });
          send(conn, {
            v: PROTOCOL_VERSION,
            type: 'role_changed',
            role: 'viewer',
            reason: grant.reason,
          });
        }
        return;
      }
      case 'release_control':
        if (seat.release(conn.id)) {
          conn.role = 'viewer';
          controller.revokeControl();
          send(conn, {
            v: PROTOCOL_VERSION,
            type: 'role_changed',
            role: 'viewer',
            reason: 'released',
          });
          broadcastState(getState());
        }
        return;
      case 'drive':
      case 'brake':
        if (!seat.isHolder(conn.id)) {
          forbid(conn);
          return;
        }
        if (msg.type === 'drive') {
          controller.setDrive({
            throttle: msg.throttle,
            steer: msg.steer,
            speed: msg.speed,
          });
        } else {
          controller.setBrake(msg.active);
        }
        return;
      case 'estop':
        if (msg.engaged) {
          if (!VIEWER_CAN_ESTOP && !seat.isHolder(conn.id)) {
            forbid(conn);
            return;
          }
          controller.setEstop(true);
          broadcastState(getState());
          return;
        }
        if (!seat.isHolder(conn.id)) {
          forbid(conn);
          return;
        }
        controller.setEstop(false);
        broadcastState(getState());
        return;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  function forbid(conn: Conn): void {
    const now = clock.now();
    if (now - conn.lastForbiddenAt < 5000) {
      return;
    }
    conn.lastForbiddenAt = now;
    send(conn, {
      v: PROTOCOL_VERSION,
      type: 'error',
      code: 'FORBIDDEN_ROLE',
      message: 'driver seat required',
      fatal: false,
    });
  }

  async function handleTokenRefresh(conn: Conn, token: string): Promise<void> {
    const verified = await verifier.verify(token, clock.now());
    if (!verified.ok) {
      await expireAuth(conn);
      return;
    }
    const claims = verified.value;
    if (conn.claims && claims.sid !== conn.claims.sid) {
      closeConn(conn, WS_CLOSE.UNAUTHORIZED, 'sid mismatch');
      return;
    }
    const prevPerm = conn.permission;
    conn.claims = claims;
    conn.permission = claims.perm;
    conn.authExpiresAtMs = claims.exp * 1000;

    if (
      prevPerm === 'driver' &&
      claims.perm === 'viewer' &&
      seat.isHolder(conn.id)
    ) {
      seat.clear();
      conn.role = 'viewer';
      controller.revokeControl();
      send(conn, {
        v: PROTOCOL_VERSION,
        type: 'role_changed',
        role: 'viewer',
        reason: 'permission',
      });
      broadcastState(getState());
    }
  }

  return {
    broadcastState,
    connectionCount: () => conns.size,
    async close() {
      if (stateTimer) {
        clearInterval(stateTimer);
        stateTimer = null;
      }
      for (const conn of conns.values()) {
        closeConn(conn, 1001, 'shutting down');
      }
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}
