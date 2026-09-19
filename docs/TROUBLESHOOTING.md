# Troubleshooting

Symptom → cause → fix table will grow in later phases.

| Symptom                                      | Cause                                                                      | Fix                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Login returns rate limited after a few tries | In-memory limiter: max 5 failures per IP+email per 10 minutes              | Wait, or restart the web process (clears the bucket). On Vercel this is per-instance only — a speed bump, not a hard global lock. |
| Login fails / server error about passwordHash parts | `.env` expanded `$` inside the scrypt hash                          | In `AUTH_USERS_JSON`, escape each `$` as `\$` (e.g. `scrypt\$16384\$8\$1\$…`). Restart `dev:web`.                                  |
| Session API 401                              | Missing/expired login cookie, or user removed from `AUTH_USERS_JSON`       | Sign in again; redeploy after editing users.                                                                                      |
| Session API 404 for a robot you expect       | Slug missing from `ROBOTS_JSON`, or user `robots` list does not include it | Fix env JSON and restart / redeploy.                                                                                              |
| Console shows Video unavailable              | `MEDIA_MODE=disabled`, MediaMTX down, or no publisher on path `robot` | Set `MEDIA_MODE=mediamtx`, start MediaMTX + ffmpeg publisher (see `docs/LOCAL_VIDEO.md`).                                         |
| Video works on LAN, black remotely           | NAT/UDP: browser cannot reach WebRTC UDP 8189 on the robot            | Add TURN (`ICE_TURN_*` or Cloudflare TURN keys), and/or port-forward UDP 8189 to the Pi.                                          |
| WHEP 503 too_many_viewers                    | More than `MAX_VIDEO_VIEWERS` concurrent sessions                     | Close extra tabs, or raise `MAX_VIDEO_VIEWERS` on the robot.                                                                      |
| `MOTOR_DRIVER=pigpio` fails on laptop        | Native `pigpio` only builds/runs on the Pi                            | Keep `MOTOR_DRIVER=mock` locally; use pigpio only on the Pi after `pigpiod` is running.                                           |
| Motors silent / one side wrong               | Wiring polarity or pin map                                            | Check `docs/HARDWARE.md`; try `INVERT_*` / `SWAP_MOTORS` before rewiring.                                                         |
| Tunnel 502 / console Offline                 | `teleop-robot` or `cloudflared` down, or hostname ≠ `tunnelHost`    | `systemctl status teleop-robot cloudflared`; fix DNS/ingress in `infra/cloudflared/config.example.yml`.                            |
