# Hardware

Raspberry Pi Zero 2 W teleop robot: camera, mic, DRV8833, two N20 motors.

## Bill of materials (reference)

| Part | Role |
| --- | --- |
| Raspberry Pi Zero 2 W | Compute, Wi‑Fi, GPIO |
| OV5647 camera module | CSI video (H.264 via `rpicam-vid`) |
| I2S MEMS microphone | Robot listen-back audio |
| DRV8833 dual H-bridge | Motor driver |
| 2× N20 gearmotors | Differential / tank drive |
| Separate motor battery + 5 V logic supply | Split rails, **shared ground** |

## GPIO map (BCM) — defaults in `robot/.env`

| Signal | BCM | DRV8833 / notes |
| --- | --- | --- |
| Left IN1 (`PIN_AIN1`) | 5 | PWM or digital |
| Left IN2 (`PIN_AIN2`) | 6 | PWM or digital |
| Right IN1 (`PIN_BIN1`) | 13 | PWM or digital |
| Right IN2 (`PIN_BIN2`) | 26 | PWM or digital |
| nSLEEP (`PIN_SLEEP`) | optional | High = enabled; omit if tied high in hardware |

Verify against your board silkscreen before powering motors. Change pins only via env — never hard-code elsewhere.

## Motor polarity

Software can fix wiring mistakes without rewiring:

- `INVERT_LEFT` / `INVERT_RIGHT` — flip that side’s sign  
- `SWAP_MOTORS` — swap left/right after mix  

`MIN_DRIVE_DUTY` (default `0.25`) lifts small commands so N20s overcome stiction. `PWM_FREQUENCY_HZ` defaults to `1000` (pigpio may round to a supported rate).

## Drive truth table (DRV8833)

| Mode | IN1 | IN2 |
| --- | --- | --- |
| Forward | PWM | LOW |
| Reverse | LOW | PWM |
| Coast | LOW | LOW |
| Brake | HIGH | HIGH |

## Power (critical)

- **Logic rail** (Pi 5 V / 3.3 V GPIO) and **motor rail** (battery → VMOT on DRV8833) must be separate supplies.  
- **Connect grounds together** (common GND).  
- Never power motors from the Pi 5 V pin.  
- Add bulk capacitance near the DRV8833 VMOT pins as the module recommends.  
- Fit a physical kill switch / fuse on the motor battery.

## Camera / audio

- Enable camera (and legacy stack notes) in `infra/pi/config.txt.notes.md`.  
- Mic device name is tuned in `/etc/teleop/av.env` (`AUDIO_DEVICE`). Start with `AUDIO_ENABLED=0` until video is stable.

## Safety

- Software watchdog (~300 ms) and e-stop live on the Pi.  
- Hardware still needs a way to cut motor power if software hangs.
