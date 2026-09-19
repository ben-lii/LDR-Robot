import { describe, expect, it, vi } from 'vitest';

import { waitForIceGathering } from './whep';

describe('waitForIceGathering', () => {
  it('resolves immediately when already complete', async () => {
    const pc = {
      iceGatheringState: 'complete',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection;
    await expect(waitForIceGathering(pc, 50)).resolves.toBeUndefined();
    expect(pc.addEventListener).not.toHaveBeenCalled();
  });

  it('resolves on icegatheringstatechange or timeout', async () => {
    let handler: (() => void) | undefined;
    const state = { value: 'gathering' as RTCIceGatheringState };
    const pc = {
      get iceGatheringState() {
        return state.value;
      },
      addEventListener: (_: string, fn: () => void) => {
        handler = fn;
      },
      removeEventListener: vi.fn(),
    } as unknown as RTCPeerConnection;

    const done = waitForIceGathering(pc, 500);
    state.value = 'complete';
    handler?.();
    await expect(done).resolves.toBeUndefined();
  });
});
