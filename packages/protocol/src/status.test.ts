import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, robotStatusSchema } from './index.js';

const validStatus = {
  v: PROTOCOL_VERSION,
  fwVersion: '0.0.0',
  uptimeS: 8,
  mode: 'idle' as const,
  driverPresent: false,
  mediaReady: false,
  clockSynced: true,
  cpuTempC: 47.2,
  load1: 0.31,
  memFreeMb: 220,
  wifiRssiDbm: -62,
};

describe('robotStatusSchema', () => {
  it('accepts a full status payload', () => {
    expect(robotStatusSchema.parse(validStatus)).toEqual(validStatus);
  });

  it('accepts null telemetry fields', () => {
    expect(
      robotStatusSchema.parse({
        ...validStatus,
        cpuTempC: null,
        load1: null,
        memFreeMb: null,
        wifiRssiDbm: null,
      }),
    ).toMatchObject({
      cpuTempC: null,
      load1: null,
      memFreeMb: null,
      wifiRssiDbm: null,
    });
  });

  it('rejects wrong version, unknown mode, and extra fields', () => {
    expect(robotStatusSchema.safeParse({ ...validStatus, v: 2 }).success).toBe(
      false,
    );
    expect(
      robotStatusSchema.safeParse({ ...validStatus, mode: 'offline' }).success,
    ).toBe(false);
    expect(
      robotStatusSchema.safeParse({ ...validStatus, extra: true }).success,
    ).toBe(false);
  });
});
