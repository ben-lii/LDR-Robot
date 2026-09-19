#!/usr/bin/env bash
# Publish Pi camera (+ optional I2S mic) to local MediaMTX over RTSP.
# Tunables live in /etc/teleop/av.env — see av.env.example.
set -euo pipefail

ENV_FILE="${TELEOP_AV_ENV:-/etc/teleop/av.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

VIDEO_WIDTH="${VIDEO_WIDTH:-640}"
VIDEO_HEIGHT="${VIDEO_HEIGHT:-480}"
VIDEO_FPS="${VIDEO_FPS:-30}"
VIDEO_BITRATE="${VIDEO_BITRATE:-1500000}"
AUDIO_ENABLED="${AUDIO_ENABLED:-1}"
# Example I2S device names (tune on hardware): plughw:1,0  or  default
AUDIO_DEVICE="${AUDIO_DEVICE:-plughw:1,0}"
RTSP_URL="${RTSP_URL:-rtsp://127.0.0.1:8554/robot}"

INTRA=$((VIDEO_FPS))
if (( INTRA < 1 )); then
  INTRA=30
fi

# Video: hardware H.264 from rpicam-vid, remuxed by ffmpeg (copy).
# Audio: optional Opus encode. AUDIO_ENABLED=0 must still produce a working
# video-only stream — audio must never be a hard dependency.
#
# Pipeline is a shell pipe (not exec): systemd Restart=always recovers crashes.

if [[ "$AUDIO_ENABLED" == "1" || "$AUDIO_ENABLED" == "true" ]]; then
  # Channel count / sample format may need tuning per I2S mic board.
  rpicam-vid -t 0 \
    --codec h264 \
    --profile baseline \
    --inline \
    --intra "$INTRA" \
    --width "$VIDEO_WIDTH" \
    --height "$VIDEO_HEIGHT" \
    --framerate "$VIDEO_FPS" \
    --bitrate "$VIDEO_BITRATE" \
    -n \
    -o - \
  | ffmpeg -hide_banner -loglevel warning \
    -fflags nobuffer \
    -flags low_delay \
    -use_wallclock_as_timestamps 1 \
    -f h264 -i - \
    -f alsa -channels 2 -sample_rate 48000 -i "$AUDIO_DEVICE" \
    -c:v copy \
    -c:a libopus -ac 1 -b:a 32k \
    -f rtsp -rtsp_transport tcp \
    "$RTSP_URL"
else
  rpicam-vid -t 0 \
    --codec h264 \
    --profile baseline \
    --inline \
    --intra "$INTRA" \
    --width "$VIDEO_WIDTH" \
    --height "$VIDEO_HEIGHT" \
    --framerate "$VIDEO_FPS" \
    --bitrate "$VIDEO_BITRATE" \
    -n \
    -o - \
  | ffmpeg -hide_banner -loglevel warning \
    -fflags nobuffer \
    -flags low_delay \
    -use_wallclock_as_timestamps 1 \
    -f h264 -i - \
    -c:v copy \
    -f rtsp -rtsp_transport tcp \
    "$RTSP_URL"
fi
