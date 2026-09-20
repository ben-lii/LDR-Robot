import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { systemClock, isClockSynced } from './control/clock.js';
import { createTokenVerifier } from './auth/verifyToken.js';
import { SeatManager } from './control/seatManager.js';
import { MotorController } from './control/motorController.js';
import { MockMotorDriver } from './hardware/mockDriver.js';
import type { MotorDriver } from './hardware/MotorDriver.js';
import { createRobotHttpServer } from './net/httpServer.js';
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { checkMediaReady } from './services/mediaHealth.js';

async function createDriver(config: Config, log: Logger): Promise<MotorDriver> {
  if (config.motorDriver === 'gpiod') {
    const { createGpiodDriver } = await import('./hardware/gpiodDriver.js');
    return createGpiodDriver(config, log);
  }
  if (config.motorDriver === 'pigpio') {
    const { createPigpioDriver } = await import('./hardware/pigpioDriver.js');
    return createPigpioDriver(config, log);
  }
  return new MockMotorDriver(log);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config);
  const clock = systemClock;
  const startedAtMs = clock.now();

  if (!isClockSynced(startedAtMs)) {
    log.error('CLOCK_INVALID — system year < 2025; tokens will be refused');
  }

  const driver = await createDriver(config, log);
  const seat = new SeatManager();
  let mediaReadyFlag = false;
  const refreshMedia = async (): Promise<void> => {
    try {
      mediaReadyFlag = await checkMediaReady(config, log);
    } catch {
      mediaReadyFlag = false;
    }
  };
  void refreshMedia();
  const mediaTimer = setInterval(() => {
    void refreshMedia();
  }, 5000);
  mediaTimer.unref();

  const controller = new MotorController({
    driver,
    clock,
    mixer: {
      maxSpeedPercent: config.maxSpeedPercent,
      swapMotors: config.swapMotors,
      invertLeft: config.invertLeft,
      invertRight: config.invertRight,
    },
    watchdogMs: config.watchdogMs,
    rampMs: config.rampMs,
    log,
    startedAtMs,
    driverPresent: () => seat.driverPresent,
    mediaReady: () => mediaReadyFlag,
  });
  controller.start();

  const verifier = await createTokenVerifier({
    robotId: config.robotId,
    tokenPublicJwk: config.tokenPublicJwk,
    clock,
  });

  const http = createRobotHttpServer({
    config,
    log,
    clock,
    verifier,
    seat,
    controller,
    startedAtMs,
  });

  let shuttingDown = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    log.warn({ reason }, 'shutting down');
    try {
      clearInterval(mediaTimer);
      controller.dispose();
    } catch (error) {
      log.error({ err: error }, 'controller dispose failed');
    }
    try {
      await http.close();
    } catch (error) {
      log.error({ err: error }, 'http close failed');
    }
    setTimeout(() => process.exit(0), 0);
    setTimeout(() => process.exit(1), 2000).unref();
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('uncaughtException', (error) => {
    log.fatal({ err: error }, 'uncaughtException');
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    log.fatal({ err: reason }, 'unhandledRejection');
    void shutdown('unhandledRejection');
  });

  await http.listen();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
