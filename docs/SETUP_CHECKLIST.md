# Setup checklist

Things you must do by hand, in order. Later phases add Vercel, Cloudflare, and Pi steps.

## Important trade-off (no database)

Users and robots live in Vercel / `.env` JSON (`AUTH_USERS_JSON`, `ROBOTS_JSON`).
**Adding, removing, or changing a user or robot means editing that env var and redeploying** the web app. There is no admin UI and no runtime user table.

---

## 1. Generate secrets

From the repo root:

```bash
npm run secrets:generate
```

This prints `.env`-style lines to stdout only (it never writes files):

| Line                        | Where it goes                                              |
| --------------------------- | ---------------------------------------------------------- |
| `SESSION_SECRET`            | `web/.env.local` and Vercel                                |
| `TOKEN_SIGNING_PRIVATE_JWK` | `web/.env.local` and Vercel **only**                       |
| `TOKEN_PUBLIC_JWK`          | `robot/.env` (and `/etc/teleop/robot.env` on the Pi)       |
| `ROBOT_ID`                  | `robot/.env` **and** the `"id"` field inside `ROBOTS_JSON` |

Do not commit these values. Do not paste the private JWK or `SESSION_SECRET` into the robot env or into chat.

---

## 2. Hash passwords and build `AUTH_USERS_JSON`

For each person who should log in:

```bash
npm run user:hash
```

The script asks for email, permission (`driver` or `viewer`), robot access (slug list or `*`), and a password (hidden, not stored in shell history). It prints:

1. A `passwordHash` string (`scrypt$16384$8$1$…`)
2. A ready-to-paste user JSON object

Assemble a JSON **array** of those objects into a **single line** for `AUTH_USERS_JSON`.

**Critical for `.env.local`:** escape every `$` in `passwordHash` as `\$`.
Next/dotenv treats bare `$16384` as variable expansion and corrupts the hash
(login then fails with `password hash must have 6 $-separated parts`).

Bad:  `"passwordHash":"scrypt$16384$8$1$…"`
Good: `"passwordHash":"scrypt\$16384\$8\$1\$…"`  (every `$` → `\$`)

Example shape (shown unescaped for readability — escape `$` when pasting into `.env`):

```json
[
  {
    "email": "me@example.com",
    "passwordHash": "scrypt$16384$8$1$…",
    "permission": "driver",
    "robots": ["robot-1"]
  },
  {
    "email": "friend@example.com",
    "passwordHash": "scrypt$16384$8$1$…",
    "permission": "viewer",
    "robots": "*"
  }
]
```

Emails are matched case-insensitively. `robots` is either `"*"` or a list of slugs from `ROBOTS_JSON`.

---

## 3. Fill `web/.env.local`

1. Copy `web/.env.example` → `web/.env.local`
2. Paste `SESSION_SECRET` and `TOKEN_SIGNING_PRIVATE_JWK` from step 1
3. Paste your one-line `AUTH_USERS_JSON` from step 2
4. Set `ROBOTS_JSON` (one-line array). Use the same `ROBOT_ID` from step 1 as each robot’s `"id"`. `tunnelHost` is a hostname only (e.g. `robot-1.yourdomain.com`) — no `https://`, path, or port.
5. Optionally set ICE/TURN and `DEV_ROBOT_ORIGIN_OVERRIDE=http://localhost:8080` for local robot testing

Schema validation (readable field errors) lives in `web/src/lib/env.server.ts` / `env.schemas.ts`.

---

## 4. Fill `robot/.env` (laptop mock)

1. Copy `robot/.env.example` → `robot/.env`
2. Paste `ROBOT_ID` and `TOKEN_PUBLIC_JWK` from step 1
3. Set `ALLOWED_ORIGINS` to include `http://localhost:3000` (and your Vercel origin later)
4. Keep `MOTOR_DRIVER=mock`. Leave `MEDIA_MODE=disabled` until you want video; for laptop webcam testing set `MEDIA_MODE=mediamtx` and follow `docs/LOCAL_VIDEO.md`.

---

## Later (deployment)

- [ ] Vercel project (Root Directory `web`, Node 22); set all `web/.env.example` vars; redeploy when users/robots change  
- [ ] Cloudflare domain + tunnel → `http://127.0.0.1:8080`; hostname = `ROBOTS_JSON.tunnelHost`  
- [ ] Pi: follow `docs/PI_SETUP.md` (gpiod/rpi-io, MediaMTX v1.12.2, AV, robot service, cloudflared)  
- [ ] Wiring / power: `docs/HARDWARE.md`  
- [ ] Optional TURN for remote WebRTC (`docs/TROUBLESHOOTING.md`)  
- [ ] Laptop video without Pi: `docs/LOCAL_VIDEO.md`
