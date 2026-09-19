export const PROTOCOL_VERSION = 1;

// Paths on the robot's Node server
export const WS_PATH = '/ws';
export const WHEP_PATH = '/whep'; // POST = offer, DELETE /whep/:id = end session
export const STATUS_PATH = '/status'; // GET, bearer token required
export const HEALTH_PATH = '/healthz'; // GET, no auth, minimal

// Token
export const TOKEN_ISSUER = 'teleop-web';
export const TOKEN_ALG = 'ES256';
export const TOKEN_TTL_S = 45; // token lifetime
export const TOKEN_REFRESH_S = 15; // client refreshes this often
export const DRIVER_IDLE_RELEASE_S = 300; // driver gives up the seat after this long with no input

// Web login session
export const SESSION_COOKIE_NAME = 'teleop_session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

// Real-time control
export const DRIVE_SEND_HZ = 20;
export const PING_INTERVAL_MS = 2000;
export const DEFAULT_WATCHDOG_MS = 300;
export const WATCHDOG_MIN_MS = 100;
export const WATCHDOG_MAX_MS = 1000;
export const AUTH_TIMEOUT_MS = 3000; // WS must authenticate within this
export const MAX_WS_MESSAGE_BYTES = 2048;
export const MAX_WS_MSG_PER_SEC = 60;
export const VIEWER_CAN_ESTOP = true; // any authenticated role may engage e-stop; only drivers may clear it

// Presence (browser asks the robot directly)
export const STATUS_POLL_MS = 5000;
export const OFFLINE_AFTER_FAILED_POLLS = 2;

// WebSocket close codes (4000–4999 are application-defined)
export const WS_CLOSE = {
  UNAUTHORIZED: 4001,
  TOKEN_EXPIRED: 4002,
  PROTOCOL_ERROR: 4003,
  AUTH_TIMEOUT: 4008,
  SUPERSEDED: 4009,
  SERVER_BUSY: 4010,
} as const;

export type WsCloseCode = (typeof WS_CLOSE)[keyof typeof WS_CLOSE];
