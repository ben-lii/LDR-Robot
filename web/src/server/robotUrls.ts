import { STATUS_PATH, WHEP_PATH, WS_PATH } from '@teleop/protocol';

export type RobotUrls = {
  readonly ws: string;
  readonly whep: string;
  readonly status: string;
};

/**
 * Builds robot tunnel URLs. DEV_ROBOT_ORIGIN_OVERRIDE is honored only when
 * nodeEnv !== 'production'.
 */
export function buildRobotUrls(options: {
  tunnelHost: string;
  nodeEnv: string;
  devRobotOriginOverride?: string | undefined;
}): RobotUrls {
  const override =
    options.nodeEnv !== 'production'
      ? options.devRobotOriginOverride?.trim()
      : undefined;

  if (override) {
    const origin = new URL(override);
    const wsProtocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
    const httpOrigin = origin.origin;
    return {
      ws: `${wsProtocol}//${origin.host}${WS_PATH}`,
      whep: `${httpOrigin}${WHEP_PATH}`,
      status: `${httpOrigin}${STATUS_PATH}`,
    };
  }

  return {
    ws: `wss://${options.tunnelHost}${WS_PATH}`,
    whep: `https://${options.tunnelHost}${WHEP_PATH}`,
    status: `https://${options.tunnelHost}${STATUS_PATH}`,
  };
}
