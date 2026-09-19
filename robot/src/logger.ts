import pino from 'pino';

import type { Config } from './config.js';

export type Logger = pino.Logger;

export function createLogger(config: Pick<Config, 'logLevel'>): Logger {
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        'token',
        'password',
        'passwordHash',
        'Authorization',
        'req.headers.authorization',
        '*.token',
      ],
      censor: '[Redacted]',
    },
  });
}
