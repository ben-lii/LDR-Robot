# Notes for /boot/firmware/config.txt (Bookworm) or /boot/config.txt (older).
# Apply, then reboot. Exact lines vary by camera overlay package — verify against
# Raspberry Pi docs for your OS image.

## Camera (OV5647 / CSI)

# Bookworm typically:
#   camera_auto_detect=1
# Or legacy:
#   start_x=1
#   gpu_mem=128
#
# Confirm with: rpicam-hello --list-cameras

## I2S microphone

# Enable I2S and load your codec overlay (board-specific), e.g.:
#   dtparam=i2s=on
#   dtoverlay=googlevoicehat-soundcard
# or whatever overlay your mic HAT documents.
#
# List capture devices after reboot: arecord -l
# Put the device string into /etc/teleop/av.env as AUDIO_DEVICE.

## Performance (optional on Zero 2 W)

#   arm_boost=1
