# Architecture

No database. Users and robots live in validated env JSON on the web app;
runtime drive/media state lives in memory on the robot.

## Planes

1. **Auth / session (web)** — login cookie, control-token minting, ICE list.
   Never on the real-time path except token refresh.
2. **Control (WebSocket)** — browser ↔ robot Node server. Seat, drive, e-stop,
   watchdog. Continuously authorized via hello + `token_refresh`.
3. **Media (WHEP / WebRTC)** — browser POSTs SDP to robot `/whep`; Node checks
   the bearer token once, then proxies to local MediaMTX. An already-running
   video session is **not** continuously re-checked; control is.

## Local media

`MEDIA_MODE=disabled` → `/whep` returns `503 video_unavailable` (UI shows
"Video unavailable"). Laptop webcam testing: see `docs/LOCAL_VIDEO.md`.

## Pi deployment

End-to-end OS / systemd / tunnel steps: `docs/PI_SETUP.md`.  
Wiring and power: `docs/HARDWARE.md`. Motors use `MOTOR_DRIVER=pigpio` only on
the Pi; `pigpio` is loaded via dynamic import and is an optional dependency.
