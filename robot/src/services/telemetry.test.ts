import { describe, expect, it } from 'vitest';

import { collectTelemetry } from './telemetry.js';

describe('collectTelemetry', () => {
  it('never throws and returns a snapshot shape', async () => {
    const snap = await collectTelemetry();
    expect(Object.keys(snap).sort()).toEqual([
      'cpuTempC',
      'load1',
      'memFreeMb',
      'wifiRssiDbm',
    ]);
    // On Windows/dev hosts thermal/wireless paths are usually missing → null.
    expect(
      snap.cpuTempC === null || typeof snap.cpuTempC === 'number',
    ).toBe(true);
    expect(snap.load1 === null || typeof snap.load1 === 'number').toBe(true);
    expect(
      snap.memFreeMb === null || typeof snap.memFreeMb === 'number',
    ).toBe(true);
    expect(
      snap.wifiRssiDbm === null || typeof snap.wifiRssiDbm === 'number',
    ).toBe(true);
  });
});
