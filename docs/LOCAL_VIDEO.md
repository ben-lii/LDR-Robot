# Local video test (laptop webcam → MediaMTX → teleop UI)

Yes — you can exercise the full WHEP path on a Windows laptop without a Pi
camera. Publish your webcam (or a test pattern) into MediaMTX, point the robot
proxy at it, and open the console.

## Prerequisites

1. [ffmpeg](https://ffmpeg.org/download.html) on your PATH  
2. [MediaMTX](https://github.com/bluenviron/mediamtx/releases) **v1.12.2** (or
   the pin in `infra/mediamtx/mediamtx.yml`)  
3. Robot + web already working (`npm run dev:robot`, `npm run dev:web`)

## 1. Start MediaMTX

From the repo root:

```powershell
# Download the release zip once, extract mediamtx.exe somewhere on PATH, then:
mediamtx .\infra\mediamtx\mediamtx.yml
```

Leave this terminal open. API: `127.0.0.1:9997`, WHEP: `127.0.0.1:8889`,
RTSP publish: `127.0.0.1:8554`.

## 2. Publish the webcam

List DirectShow devices:

```powershell
ffmpeg -list_devices true -f dshow -i dummy
```

Publish (replace the quoted names with yours):

```powershell
ffmpeg -f dshow -video_size 640x480 -framerate 30 `
  -i video="Integrated Camera" `
  -pix_fmt yuv420p `
  -c:v libx264 -profile:v baseline -bf 0 -g 30 -preset ultrafast -tune zerolatency `
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/robot
```

Many webcams deliver YUY2 (4:2:2); baseline H.264 needs `yuv420p` — without
`-pix_fmt yuv420p` you'll see `baseline profile doesn't support 4:2:2`.

Video-only is fine. To include a mic, add a second `-i audio="…"` and
`-c:a libopus -ac 1 -b:a 32k`.

No camera? Use a test pattern instead:

```powershell
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=30 `
  -pix_fmt yuv420p `
  -c:v libx264 -profile:v baseline -bf 0 -g 30 -preset ultrafast -tune zerolatency `
  -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/robot
```

## 3. Enable media on the robot

In `robot/.env`:

```env
MEDIA_MODE=mediamtx
MEDIAMTX_WHEP_URL=http://127.0.0.1:8889
MEDIAMTX_API_URL=http://127.0.0.1:9997
MEDIA_PATH=robot
```

Restart `npm run dev:robot`. Confirm MediaMTX sees the path:

```powershell
curl.exe http://127.0.0.1:9997/v3/paths/get/robot
```

`ready` should be `true` while ffmpeg is publishing.

## 4. Watch in the browser

Open the console (already logged in). You should see **Live** once frames
decode. Click the mic button to unmute robot audio (starts muted for autoplay).

If the badge stays on **Video unavailable**, check `MEDIA_MODE`, that MediaMTX
is running, and that `ALLOWED_ORIGINS` includes `http://localhost:3000`.

## Notes

- Browser ↔ MediaMTX **media** uses UDP **8189** (same machine → usually fine).
  Remote viewers need TURN and/or a forward of UDP 8189 (see TROUBLESHOOTING).
- Token is checked when WHEP connects; an existing video session is not
  continuously re-authorized (control WS is). See ARCHITECTURE.md.
