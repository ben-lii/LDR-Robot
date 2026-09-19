'use client';

import { copy } from '../copy';

export function OfflineNotice() {
  return (
    <p className="rounded-[var(--radius-badge)] bg-border px-3 py-2 text-sm text-text-muted">
      {copy.offlineNotice}
    </p>
  );
}
