import type { Role, RoleChangedReason } from '@teleop/protocol';

export type SeatHolder = {
  sid: string;
  connectionId: string;
};

export type SeatGrantResult =
  | { readonly granted: true; readonly supersededConnectionId?: string }
  | {
      readonly granted: false;
      readonly role: Role;
      readonly reason: RoleChangedReason;
      readonly errorCode: 'DRIVER_BUSY' | 'FORBIDDEN_ROLE';
    };

/**
 * In-memory driver seat. Pure logic — no I/O.
 */
export class SeatManager {
  #seat: SeatHolder | null = null;

  get holder(): SeatHolder | null {
    return this.#seat;
  }

  get driverPresent(): boolean {
    return this.#seat !== null;
  }

  isHolder(connectionId: string): boolean {
    return this.#seat?.connectionId === connectionId;
  }

  /**
   * Attempt to take the seat (hello wantControl or request_control).
   * Same sid reconnect supersedes the old connection.
   */
  request(connectionId: string, sid: string, perm: Role): SeatGrantResult {
    if (perm !== 'driver') {
      return {
        granted: false,
        role: 'viewer',
        reason: 'permission',
        errorCode: 'FORBIDDEN_ROLE',
      };
    }

    if (this.#seat === null) {
      this.#seat = { sid, connectionId };
      return { granted: true };
    }

    if (this.#seat.sid === sid) {
      const supersededConnectionId = this.#seat.connectionId;
      this.#seat = { sid, connectionId };
      return { granted: true, supersededConnectionId };
    }

    return {
      granted: false,
      role: 'viewer',
      reason: 'seat_taken',
      errorCode: 'DRIVER_BUSY',
    };
  }

  release(connectionId: string): boolean {
    if (this.#seat?.connectionId !== connectionId) {
      return false;
    }
    this.#seat = null;
    return true;
  }

  /** Free the seat regardless of who holds it (token downgrade / expiry). */
  clear(): void {
    this.#seat = null;
  }
}
