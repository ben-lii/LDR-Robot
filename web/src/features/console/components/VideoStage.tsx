'use client';

import { Video } from 'lucide-react';
import type { Ref } from 'react';

import { Badge } from '@/components/ui/Badge';

import { copy } from '../copy';
import type { WhepStatus } from '../lib/whep';

export function VideoStage({
  stageRef,
  videoRef,
  focused,
  online,
  offline,
  videoStatus,
  onFocus,
  onBlur,
}: {
  stageRef: Ref<HTMLDivElement>;
  videoRef: Ref<HTMLVideoElement>;
  focused: boolean;
  online: boolean;
  offline: boolean;
  videoStatus: WhepStatus;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const live = videoStatus === 'live';
  const showPlaceholder = !live;

  let badge: { tone: 'live' | 'amber' | 'offline'; label: string };
  if (offline) {
    badge = { tone: 'offline', label: copy.videoOffline };
  } else if (videoStatus === 'live') {
    badge = { tone: 'live', label: copy.live };
  } else if (videoStatus === 'reconnecting') {
    badge = { tone: 'amber', label: copy.videoReconnecting };
  } else if (videoStatus === 'unavailable') {
    badge = { tone: 'offline', label: copy.videoUnavailable };
  } else {
    badge = { tone: 'amber', label: copy.videoConnecting };
  }

  return (
    <div
      ref={stageRef}
      role="application"
      tabIndex={0}
      aria-label={copy.stageAriaLabel}
      className="relative overflow-hidden rounded-[var(--radius-panel)] border border-border bg-stage outline-none focus-visible:ring-2 focus-visible:ring-amber-fg"
      style={{ aspectRatio: 'var(--stage-aspect)' }}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="absolute left-3 top-3 z-10">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <video
        ref={videoRef}
        className={`absolute inset-0 size-full bg-black object-contain ${live ? 'block' : 'hidden'}`}
        playsInline
        muted
        autoPlay
      />

      {showPlaceholder ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
          {offline ? (
            <p className="text-sm">{copy.offlineNotice}</p>
          ) : videoStatus === 'unavailable' ? (
            <p className="text-sm">{copy.videoUnavailable}</p>
          ) : (
            <>
              <Video className="size-8 opacity-60" aria-hidden />
              <p className="text-sm">{copy.videoPlaceholder}</p>
            </>
          )}
        </div>
      ) : null}

      {!offline && online ? (
        <p className="absolute bottom-3 left-3 z-10 text-xs text-text-muted">
          {focused ? copy.stageHintFocused : copy.stageHintBlurred}
        </p>
      ) : null}
    </div>
  );
}
