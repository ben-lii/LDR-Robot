import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

/** Asks MediaMTX whether the path is ready. Never throws. */
export async function checkMediaReady(
  config: Pick<Config, 'mediaMode' | 'mediamtxApiUrl' | 'mediaPath'>,
  log?: Logger,
): Promise<boolean> {
  if (config.mediaMode === 'disabled') {
    return false;
  }
  const url = `${config.mediamtxApiUrl.replace(/\/$/, '')}/v3/paths/get/${config.mediaPath}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      return false;
    }
    const body: unknown = await response.json();
    if (
      body !== null &&
      typeof body === 'object' &&
      'ready' in body &&
      typeof (body as { ready: unknown }).ready === 'boolean'
    ) {
      return (body as { ready: boolean }).ready;
    }
    return false;
  } catch (error) {
    log?.debug({ err: error }, 'media health check failed');
    return false;
  }
}
