import { WHEP_PATH, type ControlTokenClaims } from '@teleop/protocol';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { TokenVerifier } from '../auth/verifyToken.js';
import type { Config } from '../config.js';
import type { Clock } from '../control/clock.js';
import type { Logger } from '../logger.js';

type SessionEntry = {
  upstreamLocation: string;
  createdAtMs: number;
};

const SESSION_TTL_MS = 60 * 60 * 1000;
const CLEAN_INTERVAL_MS = 5 * 60 * 1000;

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  corsHeaders: Headers,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  corsHeaders.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(JSON.stringify(body));
}

function upstreamWhepUrl(config: Config): string {
  const base = config.mediamtxWhepUrl.replace(/\/$/, '');
  return `${base}/${config.mediaPath}/whep`;
}

export type WhepProxy = {
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    corsHeaders: Headers,
  ): Promise<boolean>;
  dispose(): void;
};

export function createWhepProxy(options: {
  config: Config;
  log: Logger;
  clock: Clock;
  verifier: TokenVerifier;
}): WhepProxy {
  const { config, log, clock, verifier } = options;
  const sessions = new Map<string, SessionEntry>();

  const cleanTimer = setInterval(() => {
    const now = clock.now();
    for (const [id, entry] of sessions) {
      if (now - entry.createdAtMs > SESSION_TTL_MS) {
        sessions.delete(id);
      }
    }
  }, CLEAN_INTERVAL_MS);
  cleanTimer.unref();

  async function requireAuth(
    req: IncomingMessage,
    res: ServerResponse,
    corsHeaders: Headers,
  ): Promise<ControlTokenClaims | null> {
    const token = readBearer(req);
    if (!token) {
      sendJson(res, 401, { error: 'unauthenticated' }, corsHeaders);
      return null;
    }
    const verified = await verifier.verify(token, clock.now());
    if (!verified.ok) {
      sendJson(res, 401, { error: 'unauthenticated' }, corsHeaders);
      return null;
    }
    return verified.value;
  }

  async function handlePost(
    req: IncomingMessage,
    res: ServerResponse,
    corsHeaders: Headers,
  ): Promise<void> {
    if (config.mediaMode === 'disabled') {
      sendJson(res, 503, { error: 'video_unavailable' }, corsHeaders);
      return;
    }

    const claims = await requireAuth(req, res, corsHeaders);
    if (!claims) {
      return;
    }

    if (sessions.size >= config.maxVideoViewers) {
      sendJson(res, 503, { error: 'too_many_viewers' }, corsHeaders);
      return;
    }

    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (error) {
      log.warn({ err: error }, 'whep read body failed');
      sendJson(res, 400, { error: 'bad_request' }, corsHeaders);
      return;
    }

    let upstream: Response;
    try {
      upstream = await fetch(upstreamWhepUrl(config), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      log.warn({ err: error }, 'whep upstream unreachable');
      sendJson(res, 503, { error: 'video_unavailable' }, corsHeaders);
      return;
    }

    if (upstream.status === 503 || upstream.status >= 500) {
      sendJson(res, 503, { error: 'video_unavailable' }, corsHeaders);
      return;
    }

    if (upstream.status !== 201) {
      const text = await upstream.text().catch(() => '');
      log.warn(
        { status: upstream.status, body: text.slice(0, 200) },
        'whep upstream unexpected status',
      );
      sendJson(res, 503, { error: 'video_unavailable' }, corsHeaders);
      return;
    }

    const answer = await upstream.text();
    const upstreamLocation = upstream.headers.get('location');
    if (!upstreamLocation) {
      sendJson(res, 503, { error: 'video_unavailable' }, corsHeaders);
      return;
    }

    const absoluteUpstream = new URL(
      upstreamLocation,
      config.mediamtxWhepUrl.endsWith('/')
        ? config.mediamtxWhepUrl
        : `${config.mediamtxWhepUrl}/`,
    ).toString();

    const id = randomUUID();
    sessions.set(id, {
      upstreamLocation: absoluteUpstream,
      createdAtMs: clock.now(),
    });

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/sdp');
    res.setHeader('Location', `${WHEP_PATH}/${id}`);
    res.setHeader('Cache-Control', 'no-store');
    corsHeaders.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(answer);
  }

  async function handleDelete(
    req: IncomingMessage,
    res: ServerResponse,
    id: string,
    corsHeaders: Headers,
  ): Promise<void> {
    const claims = await requireAuth(req, res, corsHeaders);
    if (!claims) {
      return;
    }

    const entry = sessions.get(id);
    if (!entry) {
      sendJson(res, 404, { error: 'not_found' }, corsHeaders);
      return;
    }
    sessions.delete(id);

    try {
      await fetch(entry.upstreamLocation, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      log.debug({ err: error, id }, 'whep upstream delete failed');
    }

    res.statusCode = 204;
    corsHeaders.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end();
  }

  return {
    async handle(req, res, path, corsHeaders) {
      if (req.method === 'POST' && path === WHEP_PATH) {
        await handlePost(req, res, corsHeaders);
        return true;
      }

      if (req.method === 'DELETE' && path.startsWith(`${WHEP_PATH}/`)) {
        const id = path.slice(`${WHEP_PATH}/`.length);
        if (!id || id.includes('/')) {
          sendJson(res, 404, { error: 'not_found' }, corsHeaders);
          return true;
        }
        await handleDelete(req, res, id, corsHeaders);
        return true;
      }

      return false;
    },
    dispose() {
      clearInterval(cleanTimer);
      sessions.clear();
    },
  };
}
