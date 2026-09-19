import 'server-only';

import type { IceServer } from '@teleop/protocol';

import { getServerEnv } from '@/lib/env.server';

const DEFAULT_STUN =
  'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478';

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
 * Optional Cloudflare TURN — implemented in Phase 6 after verifying the
 * current Cloudflare Realtime TURN API. Until then we fall back to static ICE.
 */
export class CloudflareTurnProvider implements IceProvider {
  getIceServers(): IceServer[] {
    return [];
  }
}

export function createIceProvider(): IceProvider {
  const env = getServerEnv();
  // Phase 6 will switch to CloudflareTurnProvider when keys are set.
  return new StaticIceProvider({
    stunUrls: env.iceStunUrls,
    turnUrls: env.iceTurnUrls,
    turnUsername: env.iceTurnUsername,
    turnCredential: env.iceTurnCredential,
  });
}
