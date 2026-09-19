'use client';

import { PROTOCOL_VERSION, VIEWER_CAN_ESTOP } from '@teleop/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';

import { ConsoleHeader } from './components/ConsoleHeader';
import { KeyPad } from './components/KeyPad';
import { MicToggle } from './components/MicToggle';
import { StopButton } from './components/StopButton';
import { VideoStage } from './components/VideoStage';
import {
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  copy,
} from './copy';
import { useControlSocket } from './hooks/useControlSocket';
import { useDriveLoop } from './hooks/useDriveLoop';
import { useKeyboardIntent } from './hooks/useKeyboardIntent';
import { useRobotSession } from './hooks/useRobotSession';
import { useRobotStatus } from './hooks/useRobotStatus';
import { useSpeedPercent } from './hooks/useSpeedPercent';
import { useWhepVideo } from './hooks/useWhepVideo';

export function RobotConsole({
  slug,
  robotName: initialName,
}: {
  slug: string;
  robotName: string;
}) {
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const stageRef = useCallback((node: HTMLDivElement | null) => {
    setStageEl(node);
  }, []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    stageElRef.current = stageEl;
  }, [stageEl]);
  const [stageFocused, setStageFocused] = useState(false);
  const [micMuted, setMicMuted] = useState(true);

  const session = useRobotSession(slug);
  const { speed, setSpeed } = useSpeedPercent();

  const socket = useControlSocket({
    wsUrl: session.urls?.ws ?? null,
    getToken: session.getToken,
    permission: session.permission,
    clientSessionId: session.clientSessionId,
    token: session.token,
    enabled: session.phase === 'ready',
  });

  const socketOpen = socket.state === 'open';
  const { online } = useRobotStatus({
    statusUrl: session.urls?.status ?? null,
    getToken: session.getToken,
    socketOpen,
  });

  const { status: videoStatus } = useWhepVideo({
    whepUrl: session.urls?.whep ?? null,
    getToken: session.getToken,
    iceServers: session.iceServers,
    videoRef,
    enabled: session.phase === 'ready' && online,
  });

  const estopped = socket.robotState?.mode === 'estop';
  const canDrive =
    socketOpen &&
    socket.role === 'driver' &&
    !estopped &&
    online;

  const stopEnabled =
    socketOpen &&
    (estopped
      ? socket.role === 'driver'
      : VIEWER_CAN_ESTOP || socket.role === 'driver');

  const sendEstop = useCallback(
    (engaged: boolean) => {
      socket.send({
        v: PROTOCOL_VERSION,
        type: 'estop',
        engaged,
      });
    },
    [socket],
  );

  const onEstopKey = useCallback(() => {
    if (!socketOpen) {
      return;
    }
    if (estopped) {
      if (socket.role === 'driver') {
        sendEstop(false);
      }
      return;
    }
    if (VIEWER_CAN_ESTOP || socket.role === 'driver') {
      sendEstop(true);
    }
  }, [socketOpen, estopped, socket.role, sendEstop]);

  const keyboard = useKeyboardIntent(stageElRef, {
    driveEnabled: canDrive,
    estopEnabled: stopEnabled,
    onEstop: onEstopKey,
    attachKey: stageEl,
  });

  useDriveLoop({
    send: socket.send,
    intent: keyboard.intent,
    speed,
    enabled: canDrive,
    onActivity: socket.noteDriveActivity,
  });

  const driveControlsEnabled = canDrive;

  const onStopClick = () => {
    if (estopped) {
      sendEstop(false);
    } else {
      sendEstop(true);
    }
  };

  const onMicToggle = () => {
    const video = videoRef.current;
    const next = !micMuted;
    setMicMuted(next);
    if (video) {
      video.muted = next;
    }
  };

  if (session.phase === 'loading' && !session.token) {
    return (
      <div className="w-full max-w-[736px] rounded-[var(--radius-card)] border border-border bg-surface p-[18px]">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-40 rounded bg-border" />
          <div
            className="rounded-[var(--radius-panel)] bg-stage"
            style={{ aspectRatio: 'var(--stage-aspect)' }}
          />
          <p className="text-sm text-text-muted">{copy.sessionLoading}</p>
        </div>
      </div>
    );
  }

  if (session.phase === 'error' && !session.token) {
    return (
      <div className="flex w-full max-w-[736px] flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-[18px]">
        <p className="text-sm text-text">{copy.sessionError}</p>
        <Button variant="outline" onClick={session.retry}>
          {copy.sessionRetry}
        </Button>
      </div>
    );
  }

  const name = session.robotName ?? initialName;
  const offline = !online;

  return (
    <div className="flex w-full max-w-[736px] flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-[18px]">
      <ConsoleHeader
        name={name}
        online={online}
        permission={session.permission}
        role={socket.role}
        robotState={socket.robotState}
        socketOpen={socketOpen}
        latencyMs={socket.latencyMs}
        onTakeControl={socket.requestControl}
      />

      {session.error ? (
        <p className="text-xs text-amber-fg" aria-live="polite">
          {copy.sessionError}
        </p>
      ) : null}

      <VideoStage
        stageRef={stageRef}
        videoRef={videoRef}
        focused={stageFocused}
        online={online}
        offline={offline}
        videoStatus={videoStatus}
        onFocus={() => setStageFocused(true)}
        onBlur={() => setStageFocused(false)}
      />

      <div
        className={`flex flex-wrap items-end gap-3 ${offline || !socketOpen ? 'pointer-events-none opacity-50' : ''}`}
      >
        <KeyPad
          pressed={keyboard.pressed}
          disabled={!driveControlsEnabled}
          onPress={keyboard.press}
          onRelease={keyboard.release}
        />
        <Slider
          label={copy.speed}
          valueLabel={`${speed}%`}
          value={speed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          disabled={!driveControlsEnabled}
          onChange={setSpeed}
        />
        <MicToggle
          muted={micMuted}
          disabled={false}
          onToggle={onMicToggle}
        />
        <StopButton
          estopped={estopped}
          disabled={!stopEnabled}
          onClick={onStopClick}
        />
      </div>
    </div>
  );
}
