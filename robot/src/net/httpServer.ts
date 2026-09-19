import {
  HEALTH_PATH,
  PROTOCOL_VERSION,
  STATUS_PATH,
  type RobotStatus,
} from '@teleop/protocol';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TokenVerifier } from '../auth/verifyToken.js';
import type { Config } from '../config.js';
import { isClockSynced, type Clock } from '../control/clock.js';
import type { MotorController } from '../control/motorController.js';
import type { SeatManager } from '../control/seatManager.js';
import type { Logger } from '../logger.js';
import { collectTelemetry } from '../services/telemetry.js';
import { checkMediaReady } from '../services/mediaHealth.js';
import { applyCorsHeaders, originAllowed } from './cors.js';
import { attachWsServer, type WsServer } from './wsServer.js';
import { createWhepProxy } from './whepProxy.js';

export type RobotHttpServer = {
  readonly server: Server;
  readonly ws: WsServer;
  listen(): Promise<void>;
  close(): Promise<void>;
};

function readFwVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Headers,
): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extraHeaders) {
    extraHeaders.forEach((value, key) => {
      res.setHeader(key, value);
    });
  }
  res.end(payload);
}

export function createRobotHttpServer(options: {
  config: Config;
  log: Logger;
  clock: Clock;
  verifier: TokenVerifier;
  seat: SeatManager;
  controller: MotorController;
  startedAtMs: number;
}): RobotHttpServer {
  const { config, log, clock, verifier, seat, controller, startedAtMs } =
    options;
  const fwVersion = readFwVersion();

  const getState = () => {
    const state = controller.getState();
    return {
      ...state,
      driverPresent: seat.driverPresent,
    };
  };

  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  const ws = attachWsServer({
    httpServer: server,
    config,
    log,
    clock,
    verifier,
    seat,
    controller,
    getState,
  });

  const whep = createWhepProxy({ config, log, clock, verifier });

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const origin = req.headers.origin;
      const corsHeaders = new Headers();
      applyCorsHeaders(corsHeaders, origin, config.allowedOrigins);

      const url = new URL(req.url ?? '/', `http://${config.bind}`);
      const path = url.pathname;

      if (req.method === 'OPTIONS') {
        if (origin && !originAllowed(origin, config.allowedOrigins)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        applyCorsHeaders(corsHeaders, origin, config.allowedOrigins);
        res.statusCode = 204;
        corsHeaders.forEach((value, key) => res.setHeader(key, value));
        res.end();
        return;
      }

      if (req.method === 'GET' && path === HEALTH_PATH) {
        sendJson(res, 200, {
          ok: true,
          clockSynced: isClockSynced(clock.now()),
        });
        return;
      }

      if (req.method === 'GET' && path === STATUS_PATH) {
        if (origin && !originAllowed(origin, config.allowedOrigins)) {
          sendJson(res, 403, { error: 'forbidden' }, corsHeaders);
          return;
        }
        const token = readBearer(req);
        if (!token) {
          sendJson(res, 401, { error: 'unauthenticated' }, corsHeaders);
          return;
        }
        const verified = await verifier.verify(token, clock.now());
        if (!verified.ok) {
          sendJson(res, 401, { error: 'unauthenticated' }, corsHeaders);
          return;
        }

        let mediaReady = false;
        try {
          mediaReady = await checkMediaReady(config, log);
        } catch {
          mediaReady = false;
        }

        let telemetry = {
          cpuTempC: null as number | null,
          load1: null as number | null,
          memFreeMb: null as number | null,
          wifiRssiDbm: null as number | null,
        };
        try {
          telemetry = await collectTelemetry();
        } catch {
          // keep nulls
        }

        const state = getState();
        const body: RobotStatus = {
          v: PROTOCOL_VERSION,
          fwVersion,
          uptimeS: Math.max(0, (clock.now() - startedAtMs) / 1000),
          mode: state.mode,
          driverPresent: seat.driverPresent,
          mediaReady,
          clockSynced: isClockSynced(clock.now()),
          cpuTempC: telemetry.cpuTempC,
          load1: telemetry.load1,
          memFreeMb: telemetry.memFreeMb,
          wifiRssiDbm: telemetry.wifiRssiDbm,
        };
        sendJson(res, 200, body, corsHeaders);
        return;
      }

      const handledWhep = await whep.handle(req, res, path, corsHeaders);
      if (handledWhep) {
        return;
      }

      sendJson(res, 404, { error: 'not_found' }, corsHeaders);
    } catch (error) {
      log.error({ err: error }, 'http handler error');
      try {
        sendJson(res, 500, { error: 'server_error' });
      } catch {
        // ignore
      }
    }
  }

  return {
    server,
    ws,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.bind, () => {
          server.off('error', reject);
          log.info(
            { bind: config.bind, port: config.port },
            'robot http listening',
          );
          resolve();
        });
      });
    },
    async close() {
      whep.dispose();
      await ws.close();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
