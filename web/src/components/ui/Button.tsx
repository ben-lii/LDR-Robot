import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'ghost' | 'outline' | 'danger' | 'neutral';

const variantClass: Record<Variant, string> = {
  ghost:
    'bg-transparent text-text-muted hover:text-text disabled:opacity-40',
  outline:
    'border border-border-strong bg-transparent text-text hover:bg-border/40 disabled:opacity-40',
  danger:
    'border border-danger-border bg-danger-bg text-danger-fg hover:brightness-110 disabled:opacity-40',
  neutral:
    'border border-border-strong bg-border text-text hover:brightness-110 disabled:opacity-40',
};

export function Button({
  variant = 'outline',
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-badge)] px-3 py-1.5 text-sm font-medium transition-colors ${variantClass[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
