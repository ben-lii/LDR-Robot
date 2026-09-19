import 'server-only';

import type { IceServer } from '@teleop/protocol';

import { getServerEnv } from '@/lib/env.server';

const DEFAULT_STUN =
  'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478';

const CLOUDFLARE_TURN_TTL_S = 86_400;

export interface IceProvider {
  getIceServers(): Promise<IceServer[]> | IceServer[];
}

function splitUrls(raw: string | undefined, fallback: string): string[] {
  const source = raw && raw.trim().length > 0 ? raw : fallback;
  return source
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function urlsField(urls: string[]): string | string[] {
  if (urls.length === 1) {
    return urls[0]!;
  }
  return urls;
}

export class StaticIceProvider implements IceProvider {
  constructor(
    private readonly options: {
      stunUrls?: string | undefined;
      turnUrls?: string | undefined;
      turnUsername?: string | undefined;
      turnCredential?: string | undefined;
    } = {},
  ) {}

  getIceServers(): IceServer[] {
    const servers: IceServer[] = [];
    const stun = splitUrls(this.options.stunUrls, DEFAULT_STUN);
    if (stun.length > 0) {
      servers.push({ urls: urlsField(stun) });
    }

    const turn = splitUrls(this.options.turnUrls, '');
    if (turn.length > 0) {
      if (this.options.turnUsername && this.options.turnCredential) {
        servers.push({
          urls: urlsField(turn),
          username: this.options.turnUsername,
          credential: this.options.turnCredential,
        });
      } else {
        servers.push({ urls: urlsField(turn) });
      }
    }

    return servers;
  }
}

/**
 * Mints short-lived TURN credentials via Cloudflare Realtime.
 * @see https://developers.cloudflare.com/realtime/turn/generate-credentials/
 */
export class CloudflareTurnProvider implements IceProvider {
  constructor(
    private readonly keyId: string,
    private readonly apiToken: string,
    private readonly fallback: IceProvider,
  ) {}

  async getIceServers(): Promise<IceServer[]> {
    const base = await this.fallback.getIceServers();
    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${this.keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: CLOUDFLARE_TURN_TTL_S }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) {
        return base;
      }
      const json: unknown = await response.json();
      if (
        json === null ||
        typeof json !== 'object' ||
        !('iceServers' in json) ||
        !Array.isArray((json as { iceServers: unknown }).iceServers)
      ) {
        return base;
      }
      const minted: IceServer[] = [];
      for (const entry of (json as { iceServers: unknown[] }).iceServers) {
        if (entry === null || typeof entry !== 'object') {
          continue;
        }
        const urls = (entry as { urls?: unknown }).urls;
        if (typeof urls !== 'string' && !Array.isArray(urls)) {
          continue;
        }
        const username = (entry as { username?: unknown }).username;
        const credential = (entry as { credential?: unknown }).credential;
        if (
          typeof username === 'string' &&
          username.length > 0 &&
          typeof credential === 'string' &&
          credential.length > 0
        ) {
          minted.push({
            urls: urls as string | string[],
            username,
            credential,
          });
        } else {
          minted.push({ urls: urls as string | string[] });
        }
      }
      return [...base, ...minted];
    } catch {
      return base;
    }
  }
}

export function createIceProvider(): IceProvider {
  const env = getServerEnv();
  const staticProvider = new StaticIceProvider({
    stunUrls: env.iceStunUrls,
    turnUrls: env.iceTurnUrls,
    turnUsername: env.iceTurnUsername,
    turnCredential: env.iceTurnCredential,
  });

  if (env.cloudflareTurnKeyId && env.cloudflareTurnApiToken) {
    return new CloudflareTurnProvider(
      env.cloudflareTurnKeyId,
      env.cloudflareTurnApiToken,
      staticProvider,
    );
  }

  return staticProvider;
}
