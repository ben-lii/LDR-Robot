# Protocol

All WebSocket messages, token claims, HTTP bodies, and shared constants live in `@teleop/protocol`. Both the web app and the robot import this package. Every message is a JSON text frame with `v: 1` and a `type` discriminator.

Unknown `type` values, extra fields on WebSocket messages, out-of-range numbers, oversize frames (`> 2048` bytes), and garbage JSON are rejected. Parsers return a `Result` and never throw.

## Constants

| Name                         |            Value | Meaning                        |
| ---------------------------- | ---------------: | ------------------------------ |
| `PROTOCOL_VERSION`           |              `1` | Message `v` field              |
| `WS_PATH`                    |            `/ws` | Control WebSocket              |
| `WHEP_PATH`                  |          `/whep` | Authenticated WHEP proxy       |
| `STATUS_PATH`                |        `/status` | Authenticated robot status     |
| `HEALTH_PATH`                |       `/healthz` | Unauthenticated liveness       |
| `TOKEN_ISSUER`               |     `teleop-web` | JWT `iss`                      |
| `TOKEN_ALG`                  |          `ES256` | Control-token algorithm        |
| `TOKEN_TTL_S`                |             `45` | Control-token lifetime         |
| `TOKEN_REFRESH_S`            |             `15` | Client refresh interval        |
| `DRIVER_IDLE_RELEASE_S`      |            `300` | Idle driver releases the seat  |
| `SESSION_COOKIE_NAME`        | `teleop_session` | Web login cookie               |
| `SESSION_MAX_AGE_S`          |         `604800` | Login cookie lifetime (7 days) |
| `DRIVE_SEND_HZ`              |             `20` | Drive command rate             |
| `PING_INTERVAL_MS`           |           `2000` | WebSocket ping interval        |
| `DEFAULT_WATCHDOG_MS`        |            `300` | Motor watchdog                 |
| `AUTH_TIMEOUT_MS`            |           `3000` | Time to send `hello`           |
| `MAX_WS_MESSAGE_BYTES`       |           `2048` | Max text-frame size            |
| `MAX_WS_MSG_PER_SEC`         |             `60` | Per-connection rate limit      |
| `VIEWER_CAN_ESTOP`           |           `true` | Viewers may engage e-stop      |
| `STATUS_POLL_MS`             |           `5000` | Browser `/status` poll         |
| `OFFLINE_AFTER_FAILED_POLLS` |              `2` | Consecutive failures → offline |

WebSocket close codes: `UNAUTHORIZED` 4001, `TOKEN_EXPIRED` 4002, `PROTOCOL_ERROR` 4003, `AUTH_TIMEOUT` 4008, `SUPERSEDED` 4009, `SERVER_BUSY` 4010.

## Client → robot

### `hello`

Must be the first message. The token is never sent in the URL.

```json
{
  "v": 1,
  "type": "hello",
  "token": "<jwt>",
  "clientSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "wantControl": true
}
```

### `request_control`

Viewer with driver permission asks for the seat.

```json
{ "v": 1, "type": "request_control" }
```

### `release_control`

Driver gives up the seat.

```json
{ "v": 1, "type": "release_control" }
```

### `drive`

Sent at `DRIVE_SEND_HZ` while driving. `steer > 0` is right (D). Each valid `drive` from the driver feeds the watchdog. `throttle` and `steer` are in `[-1, 1]`; `speed` is an integer in `[0, 100]`.

```json
{ "v": 1, "type": "drive", "throttle": 1, "steer": 0, "speed": 50 }
```

### `brake`

Level state. Space held = `true`.

```json
{ "v": 1, "type": "brake", "active": true }
```

### `estop`

`engaged: true` is allowed for any authenticated role when `VIEWER_CAN_ESTOP`. `engaged: false` (clear) is drivers only.

```json
{ "v": 1, "type": "estop", "engaged": true }
```

### `ping`

Client timestamp `t` is echoed in `pong` for RTT.

```json
{ "v": 1, "type": "ping", "id": 1, "t": 1726740000123 }
```

### `token_refresh`

Extends authorization. May lower permission (`driver` → `viewer`).

```json
{ "v": 1, "type": "token_refresh", "token": "<jwt>" }
```

## Robot → client

### `welcome`

```json
{
  "v": 1,
  "type": "welcome",
  "robotId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "permission": "driver",
  "role": "driver",
  "limits": { "watchdogMs": 300, "maxSpeedPercent": 100 },
  "state": {
    "mode": "idle",
    "speedPercent": 0,
    "driverPresent": true,
    "mediaReady": true,
    "uptimeS": 12.5
  }
}
```

`permission` is the most this user may do. `role` is the effective seat (`driver` or `viewer`).

### `role_changed`

`reason` is one of `granted`, `seat_taken`, `released`, `permission`, `token`.

```json
{ "v": 1, "type": "role_changed", "role": "viewer", "reason": "seat_taken" }
```

### `state`

Sent on change and every 1 s. `mode` is `idle` | `driving` | `braking` | `estop` | `fault`.

```json
{
  "v": 1,
  "type": "state",
  "state": {
    "mode": "driving",
    "speedPercent": 40,
    "driverPresent": true,
    "mediaReady": true,
    "uptimeS": 88
  }
}
```

### `pong`

```json
{ "v": 1, "type": "pong", "id": 1, "t": 1726740000123 }
```

### `error`

`code` is `UNAUTHORIZED` | `TOKEN_EXPIRED` | `FORBIDDEN_ROLE` | `DRIVER_BUSY` | `BAD_MESSAGE` | `RATE_LIMITED` | `ROBOT_FAULT`.

```json
{
  "v": 1,
  "type": "error",
  "code": "DRIVER_BUSY",
  "message": "Another driver holds the seat",
  "fatal": false
}
```

## Control token (JWT, ES256)

Claims:

| Claim        | Meaning                                 |
| ------------ | --------------------------------------- |
| `iss`        | `teleop-web`                            |
| `aud`        | `robot:<robotId>` (exactly one robot)   |
| `sub`        | user email                              |
| `perm`       | `driver` or `viewer` (maximum allowed)  |
| `sid`        | client session id (uuid, one per tab)   |
| `jti`        | random uuid                             |
| `iat`, `exp` | unix seconds; `exp = iat + TOKEN_TTL_S` |

Use `audienceFor(robotId)` to build `aud`.

## HTTP: login

`POST /api/auth/login`

```json
{ "email": "me@example.com", "password": "secret" }
```

Non-2xx body for all web APIs:

```json
{ "error": "unauthenticated" }
```

`error` is `unauthenticated` | `not_found` | `bad_request` | `rate_limited` | `server_error`.

## HTTP: session

`POST /api/robots/[slug]/session`

Request:

```json
{ "clientSessionId": "550e8400-e29b-41d4-a716-446655440000" }
```

Response:

```json
{
  "robot": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "slug": "robot-1",
    "name": "Robot 1"
  },
  "permission": "driver",
  "token": "<jwt>",
  "tokenExpiresAt": "2026-09-19T13:00:00.000Z",
  "urls": {
    "ws": "wss://robot-1.example.com/ws",
    "whep": "https://robot-1.example.com/whep",
    "status": "https://robot-1.example.com/status"
  },
  "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }],
  "serverTime": "2026-09-19T12:59:15.000Z"
}
```

## HTTP: robot status

`GET /status` (bearer token required)

```json
{
  "v": 1,
  "fwVersion": "0.0.0",
  "uptimeS": 88,
  "mode": "idle",
  "driverPresent": false,
  "mediaReady": true,
  "clockSynced": true,
  "cpuTempC": 47.2,
  "load1": 0.31,
  "memFreeMb": 220,
  "wifiRssiDbm": -62
}
```

Telemetry fields are `null` when unavailable.
