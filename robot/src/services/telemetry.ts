import os from 'node:os';
import { readFile } from 'node:fs/promises';

export type TelemetrySnapshot = {
  cpuTempC: number | null;
  load1: number | null;
  memFreeMb: number | null;
  wifiRssiDbm: number | null;
};

async function readCpuTempC(): Promise<number | null> {
  try {
    const raw = await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    const milli = Number(raw.trim());
    if (!Number.isFinite(milli)) {
      return null;
    }
    return milli / 1000;
  } catch {
    return null;
  }
}

async function readWifiRssiDbm(): Promise<number | null> {
  try {
    const raw = await readFile('/proc/net/wireless', 'utf8');
    const lines = raw.split('\n');
    for (const line of lines) {
      if (!line.includes(':')) {
        continue;
      }
      const parts = line.trim().split(/\s+/);
      // iface: status link level noise ...
      const level = parts[3];
      if (level === undefined) {
        continue;
      }
      const value = Number(level.replace('.', ''));
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Best-effort telemetry; every field null on failure. Never throws. */
export async function collectTelemetry(): Promise<TelemetrySnapshot> {
  try {
    const [cpuTempC, wifiRssiDbm] = await Promise.all([
      readCpuTempC(),
      readWifiRssiDbm(),
    ]);
    const load = os.loadavg()[0];
    return {
      cpuTempC,
      load1: typeof load === 'number' && Number.isFinite(load) ? load : null,
      memFreeMb: Math.round(os.freemem() / (1024 * 1024)),
      wifiRssiDbm,
    };
  } catch {
    return {
      cpuTempC: null,
      load1: null,
      memFreeMb: null,
      wifiRssiDbm: null,
    };
  }
}
