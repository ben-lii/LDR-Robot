import type { PointerEvent as ReactPointerEvent } from 'react';

export function KeyCap({
  label,
  pressed,
  disabled,
  wide,
  onPress,
  onRelease,
}: {
  label: string;
  pressed: boolean;
  disabled: boolean;
  wide?: boolean;
  onPress: () => void;
  onRelease: () => void;
}) {
  const handleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onPress();
  };

  const handleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onRelease();
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled}
      disabled={disabled}
      tabIndex={-1}
      className={`select-none touch-none rounded-[var(--radius-key)] border text-sm font-bold transition-colors ${
        wide ? 'h-11 w-[88px]' : 'h-11 w-11'
      } ${
        pressed
          ? 'border-border-strong bg-border-strong text-text'
          : 'border-border-strong bg-transparent text-text'
      } ${disabled ? 'opacity-40' : 'hover:bg-border/50'}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={(event) => {
        if (event.buttons === 0) {
          return;
        }
        handleUp(event);
      }}
    >
      {label}
    </button>
  );
}
