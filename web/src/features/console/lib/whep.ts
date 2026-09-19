import type { IceServer } from '@teleop/protocol';

export type WhepStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'unavailable';

export type WhepSession = {
  readonly status: WhepStatus;
  readonly stop: () => void;
};

const ICE_GATHER_TIMEOUT_MS = 2500;
const FRAME_STALL_MS = 5000;
const STATS_POLL_MS = 2000;
const DISCONNECT_GRACE_MS = 3000;

export async function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs: number = ICE_GATHER_TIMEOUT_MS,
): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }, timeoutMs);
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

function toRtcIceServers(servers: readonly IceServer[]): RTCIceServer[] {
  return servers.map((server) => {
    const entry: RTCIceServer = { urls: server.urls };
    if (server.username !== undefined) {
      entry.username = server.username;
    }
    if (server.credential !== undefined) {
      entry.credential = server.credential;
    }
    return entry;
  });
}

async function readFramesDecoded(pc: RTCPeerConnection): Promise<number> {
  try {
    const stats = await pc.getStats();
    let frames = 0;
    stats.forEach((report) => {
      if (
        report.type === 'inbound-rtp' &&
        'framesDecoded' in report &&
        typeof report.framesDecoded === 'number'
      ) {
        frames += report.framesDecoded;
      }
    });
    return frames;
  } catch {
    return 0;
  }
}

export type StartWhepOptions = {
  whepUrl: string;
  getToken: () => string | null;
  iceServers: readonly IceServer[];
  video: HTMLVideoElement;
  onStatus: (status: WhepStatus) => void;
  signal: AbortSignal;
};

/**
 * One WHEP pull session. Caller owns reconnect policy.
 * Returns when stopped or aborted; throws on hard setup errors (caller may retry).
 */
export async function runWhepSession(options: StartWhepOptions): Promise<'ok' | 'unavailable'> {
  const { whepUrl, getToken, iceServers, video, onStatus, signal } = options;

  if (signal.aborted) {
    return 'ok';
  }

  onStatus('connecting');

  const pc = new RTCPeerConnection({
    iceServers: toRtcIceServers(iceServers),
  });

  let resourceUrl: string | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFrames = 0;
  let lastFrameAt = Date.now();
  let sawConnected = false;
  let endSession: (() => void) | null = null;

  const cleanup = async () => {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    if (resourceUrl) {
      const token = getToken();
      try {
        void fetch(resourceUrl, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          keepalive: true,
        });
      } catch {
        // ignore
      }
      resourceUrl = null;
    }
    for (const sender of pc.getSenders()) {
      try {
        sender.track?.stop();
      } catch {
        // ignore
      }
    }
    for (const receiver of pc.getReceivers()) {
      try {
        receiver.track?.stop();
      } catch {
        // ignore
      }
    }
    try {
      pc.close();
    } catch {
      // ignore
    }
    video.srcObject = null;
  };

  const abort = () => {
    void cleanup();
  };
  signal.addEventListener('abort', abort, { once: true });

  try {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      video.srcObject = stream;
      void video.play().catch(() => {
        // autoplay may require mute — already muted by default
      });
      for (const receiver of pc.getReceivers()) {
        try {
          // Best-effort low-latency hint (not in all browsers).
          (
            receiver as RTCRtpReceiver & { jitterBufferTarget?: number }
          ).jitterBufferTarget = 0;
        } catch {
          // ignore
        }
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    if (signal.aborted) {
      await cleanup();
      return 'ok';
    }

    const token = getToken();
    if (!token) {
      await cleanup();
      throw new Error('missing token');
    }

    const offerSdp = pc.localDescription?.sdp ?? offer.sdp;
    if (!offerSdp) {
      await cleanup();
      throw new Error('missing local sdp');
    }

    const response = await fetch(whepUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: offerSdp,
      signal,
    });

    if (response.status === 503) {
      try {
        await response.json();
      } catch {
        // ignore body
      }
      await cleanup();
      onStatus('unavailable');
      return 'unavailable';
    }

    if (response.status !== 201) {
      await cleanup();
      throw new Error(`whep ${response.status}`);
    }

    const location = response.headers.get('location');
    if (!location) {
      await cleanup();
      throw new Error('whep missing location');
    }
    resourceUrl = new URL(location, whepUrl).toString();
    const answerSdp = await response.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    statsTimer = setInterval(() => {
      void (async () => {
        if (pc.connectionState !== 'connected') {
          return;
        }
        const frames = await readFramesDecoded(pc);
        if (frames > lastFrames) {
          lastFrames = frames;
          lastFrameAt = Date.now();
          if (sawConnected) {
            onStatus('live');
          }
        } else if (
          sawConnected &&
          Date.now() - lastFrameAt > FRAME_STALL_MS
        ) {
          endSession?.();
        }
      })();
    }, STATS_POLL_MS);

    await new Promise<void>((resolve) => {
      endSession = resolve;
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          sawConnected = true;
          if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
          }
          void readFramesDecoded(pc).then((frames) => {
            lastFrames = frames;
            lastFrameAt = Date.now();
            if (frames > 0) {
              onStatus('live');
            }
          });
        } else if (state === 'disconnected') {
          if (!disconnectTimer) {
            disconnectTimer = setTimeout(() => {
              resolve();
            }, DISCONNECT_GRACE_MS);
          }
        } else if (state === 'failed' || state === 'closed') {
          resolve();
        }
      };

      if (signal.aborted) {
        resolve();
      }
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });

    await cleanup();
    signal.removeEventListener('abort', abort);
    return 'ok';
  } catch (error) {
    signal.removeEventListener('abort', abort);
    await cleanup();
    if (signal.aborted) {
      return 'ok';
    }
    throw error;
  }
}
