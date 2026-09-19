import { z } from 'zod';

import { PROTOCOL_VERSION } from './constants.js';
import { robotModeSchema } from './messages.js';

const nullableNumber = z.number().nullable();

export const robotStatusSchema = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  fwVersion: z.string().min(1),
  uptimeS: z.number().min(0),
  mode: robotModeSchema,
  driverPresent: z.boolean(),
  mediaReady: z.boolean(),
  clockSynced: z.boolean(),
  cpuTempC: nullableNumber,
  load1: nullableNumber,
  memFreeMb: nullableNumber,
  wifiRssiDbm: nullableNumber,
});
export type RobotStatus = z.infer<typeof robotStatusSchema>;
