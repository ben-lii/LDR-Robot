# Raspberry Pi setup (end-to-end)

Fresh **Raspberry Pi OS Lite 64-bit (Bookworm)** on a **Zero 2 W**.  
Hardware wiring: `docs/HARDWARE.md`. Laptop webcam testing: `docs/LOCAL_VIDEO.md`.

## 0. Accounts / hostnames you need first

1. A Vercel deploy of `web/` with `AUTH_USERS_JSON`, `ROBOTS_JSON`, signing keys.  
2. A Cloudflare account + domain. Create a **tunnel** whose public hostname is the same as `tunnelHost` in `ROBOTS_JSON` (e.g. `robot-1.yourdomain.com`) → `http://127.0.0.1:8080`.  
3. On the PC: `npm run secrets:generate` — keep `ROBOT_ID` + public JWK for the Pi, private JWK + session secret for Vercel only.

## 1. Base OS

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl build-essential python3-dev
# Node 22 (nodesource or fnm/nvm — match engines in package.json)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Create a service user:

```bash
sudo useradd -r -m -s /bin/bash teleop
sudo usermod -aG video,gpio,i2c,spi teleop   # adjust groups as needed
```

Enable camera / I2S using the notes in `infra/pi/config.txt.notes.md`, then reboot.

## 2. pigpio

```bash
sudo apt install -y pigpio
sudo systemctl enable --now pigpiod
```

The Node binding is an **optional** dependency of `robot/` (`pigpio` npm package). It only installs cleanly on the Pi.

## 3. Clone and build

```bash
sudo mkdir -p /opt/teleop && sudo chown teleop:teleop /opt/teleop
sudo -u teleop git clone <your-repo-url> /opt/teleop/src
cd /opt/teleop/src
sudo -u teleop npm ci
sudo -u teleop npm run build -w @teleop/protocol -w robot
# Deploy built robot somewhere stable:
sudo -u teleop mkdir -p /opt/teleop/robot
sudo -u teleop cp -r robot/dist robot/package.json /opt/teleop/robot/
# On the Pi, install production deps including optional pigpio:
cd /opt/teleop/robot && sudo -u teleop npm install --omit=dev
```

## 4. Env files

```bash
sudo mkdir -p /etc/teleop
sudo cp /opt/teleop/src/infra/pi/robot.env.example /etc/teleop/robot.env
sudo cp /opt/teleop/src/infra/pi/av.env.example /etc/teleop/av.env
sudo cp /opt/teleop/src/infra/mediamtx/mediamtx.yml /etc/teleop/mediamtx.yml
sudo chmod 600 /etc/teleop/robot.env
```

Edit `/etc/teleop/robot.env`:

- `ROBOT_ID` = UUID from secrets (must match `ROBOTS_JSON[].id`)  
- `TOKEN_PUBLIC_JWK` = public JWK only  
- `ALLOWED_ORIGINS` = your Vercel origin(s), comma-separated  
- `MOTOR_DRIVER=pigpio`  
- `MEDIA_MODE=mediamtx`  
- Pin / invert / swap as needed (`docs/HARDWARE.md`)

Edit `/etc/teleop/av.env` — start with `AUDIO_ENABLED=0`.

## 5. MediaMTX

Pin: **MediaMTX v1.12.2** (see comment in `infra/mediamtx/mediamtx.yml`).

```bash
# Download the linux_arm64 (or armv7) release asset for v1.12.2 from GitHub,
# extract `mediamtx` → /usr/local/bin/mediamtx, chmod +x
sudo cp /opt/teleop/src/infra/systemd/mediamtx.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mediamtx
curl -sS http://127.0.0.1:9997/v3/config/get | head
```

## 6. AV publisher

```bash
sudo cp /opt/teleop/src/infra/pi/av-stream.sh /usr/local/bin/teleop-av-stream.sh
sudo chmod +x /usr/local/bin/teleop-av-stream.sh
sudo cp /opt/teleop/src/infra/systemd/teleop-av.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teleop-av
```

Confirm path ready: `curl -sS http://127.0.0.1:9997/v3/paths/get/robot`

## 7. Robot Node service

```bash
sudo cp /opt/teleop/src/infra/systemd/teleop-robot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teleop-robot
curl -sS http://127.0.0.1:8080/healthz
```

## 8. Cloudflare tunnel (`cloudflared`)

1. Install `cloudflared` for ARM from Cloudflare’s packages.  
2. Authenticate / create a tunnel (dashboard or `cloudflared tunnel create teleop-robot-1`).  
3. Copy `infra/cloudflared/config.example.yml` → `/etc/cloudflared/config.yml`, fill tunnel UUID + credentials file path, keep ingress to `http://127.0.0.1:8080`.  
4. Route DNS: `cloudflared tunnel route dns <tunnel> robot-1.yourdomain.com`  
5. Install as a service: `sudo cloudflared service install` (or use `infra/systemd/cloudflared.service`).  
6. `sudo systemctl enable --now cloudflared`

HTTPS/WSS for control + WHEP signaling go through the tunnel. **WebRTC media is UDP** (port **8189** on the Pi). Same-LAN often works with STUN; remote viewers usually need TURN (`ICE_TURN_*` or Cloudflare TURN on the web app) and/or a UDP 8189 forward — see `docs/TROUBLESHOOTING.md`.

## 9. Verify

1. From your laptop: open the Vercel app, log in, open Robot 1.  
2. Status badge **Online**, role **You're driving**.  
3. Video **Live** (mic button unmutes).  
4. WASD → motors move; Space brake; Stop e-stop / Resume.  
5. Kill Wi‑Fi briefly → motors stop via watchdog; reconnect recovers.

## 10. Updates

```bash
cd /opt/teleop/src && sudo -u teleop git pull
sudo -u teleop npm ci && sudo -u teleop npm run build -w robot
sudo -u teleop cp -r robot/dist/* /opt/teleop/robot/dist/
sudo systemctl restart teleop-robot
```

Redeploy Vercel whenever `AUTH_USERS_JSON` / `ROBOTS_JSON` / keys change.
