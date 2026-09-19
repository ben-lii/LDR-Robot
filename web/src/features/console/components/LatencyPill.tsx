'use client';

import { Wifi } from 'lucide-react';

import { latencyTone } from '../lib/latency';
import { copy } from '../copy';

export function LatencyPill({ latencyMs }: { latencyMs: number | null }) {
  const tone = latencyTone(latencyMs);
  const color =
    tone === 'ok'
      ? 'text-text-muted'
      : tone === 'warn'
        ? 'text-amber-fg'
        : 'text-danger-fg';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm tabular-nums ${color}`}
      title={copy.wifiLatency}
      aria-label={
        latencyMs === null
          ? copy.latencyUnknown
          : copy.latencyMs(latencyMs)
      }
    >
      <Wifi className="size-4" aria-hidden />
      {latencyMs === null ? copy.latencyUnknown : copy.latencyMs(latencyMs)}
    </span>
  );
}
