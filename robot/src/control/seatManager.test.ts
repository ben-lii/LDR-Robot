import { describe, expect, it } from 'vitest';

import { SeatManager } from './seatManager.js';

describe('SeatManager', () => {
  it('grants an empty seat to a driver', () => {
    const seat = new SeatManager();
    const result = seat.request('c1', 'sid-a', 'driver');
    expect(result).toEqual({ granted: true });
    expect(seat.holder).toEqual({ sid: 'sid-a', connectionId: 'c1' });
  });

  it('same sid reconnect supersedes the old connection', () => {
    const seat = new SeatManager();
    seat.request('c1', 'sid-a', 'driver');
    const result = seat.request('c2', 'sid-a', 'driver');
    expect(result).toEqual({
      granted: true,
      supersededConnectionId: 'c1',
    });
    expect(seat.holder?.connectionId).toBe('c2');
  });

  it('refuses a different sid while seat is held', () => {
    const seat = new SeatManager();
    seat.request('c1', 'sid-a', 'driver');
    expect(seat.request('c2', 'sid-b', 'driver')).toEqual({
      granted: false,
      role: 'viewer',
      reason: 'seat_taken',
      errorCode: 'DRIVER_BUSY',
    });
  });

  it('viewer permission cannot take the seat', () => {
    const seat = new SeatManager();
    expect(seat.request('c1', 'sid-a', 'viewer')).toEqual({
      granted: false,
      role: 'viewer',
      reason: 'permission',
      errorCode: 'FORBIDDEN_ROLE',
    });
  });

  it('release and clear free the seat', () => {
    const seat = new SeatManager();
    seat.request('c1', 'sid-a', 'driver');
    expect(seat.release('c1')).toBe(true);
    expect(seat.driverPresent).toBe(false);
    seat.request('c2', 'sid-b', 'driver');
    seat.clear();
    expect(seat.holder).toBeNull();
  });
});
