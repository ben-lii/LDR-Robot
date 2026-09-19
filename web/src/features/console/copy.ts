/** All console UI strings — nowhere else. */

export const copy = {
  online: 'Online',
  offline: 'Offline',
  roleDriving: "You're driving",
  roleViewing: 'Viewing only',
  roleSomeoneElse: 'Someone else is driving',
  roleConnecting: 'Connecting…',
  takeControl: 'Take control',
  logOut: 'Log out',
  live: 'Live',
  videoConnecting: 'Connecting…',
  videoReconnecting: 'Reconnecting…',
  videoOffline: 'Offline',
  videoUnavailable: 'Video unavailable',
  videoPlaceholder: 'Live video appears here',
  stageHintBlurred: 'Click the video, then use W A S D',
  stageHintFocused: 'W A S D to drive · Space to brake · Esc to stop',
  stageAriaLabel:
    'Robot video stage. Focus here, then use W A S D to drive, Space to brake, Escape to emergency stop.',
  speed: 'Speed',
  space: 'Space',
  stop: 'Stop',
  resume: 'Resume',
  micListen: 'Listen to robot microphone',
  micMute: 'Mute robot microphone',
  latencyUnknown: '— ms',
  latencyMs: (ms: number) => `${Math.round(ms)} ms`,
  offlineNotice: 'Robot is offline',
  sessionLoading: 'Connecting to robot…',
  sessionError: "Couldn't reach the server. Retrying…",
  sessionRetry: 'Retry',
  wifiLatency: 'Connection latency',
} as const;

export const SPEED_DEFAULT = 50;
export const SPEED_STEP = 5;
export const SPEED_MIN = 0;
export const SPEED_MAX = 100;
export const SPEED_STORAGE_KEY = 'teleop.speedPercent';

export const WS_RECONNECT_MIN_MS = 1000;
export const WS_RECONNECT_MAX_MS = 5000;
export const SESSION_RETRY_MIN_MS = 1000;
export const SESSION_RETRY_MAX_MS = 8000;
export const PONG_MISS_LIMIT = 3;
export const LATENCY_SAMPLE_COUNT = 5;
