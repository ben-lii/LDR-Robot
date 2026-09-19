/**
 * Origin allow-list for CORS and WebSocket upgrades.
 * Exact origins, plus optional `https://*.example.com` suffix patterns.
 */
export function originAllowed(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) {
    return false;
  }
  for (const entry of allowed) {
    if (entry === origin) {
      return true;
    }
    if (entry.startsWith('https://*.')) {
      const suffix = entry.slice('https://*'.length);
      try {
        const url = new URL(origin);
        if (url.protocol === 'https:' && url.host.endsWith(suffix)) {
          return true;
        }
      } catch {
        return false;
      }
    }
  }
  return false;
}

export function applyCorsHeaders(
  headers: Headers,
  origin: string | undefined,
  allowed: readonly string[],
): void {
  if (origin && originAllowed(origin, allowed)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Expose-Headers', 'Location');
  }
}
