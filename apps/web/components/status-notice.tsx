import type { ReactNode } from 'react';

export type StatusTone = 'error' | 'info' | 'success' | 'warning';

export function StatusNotice({
  children,
  className = '',
  compact = false,
  role = 'status',
  tone = 'info',
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  role?: 'alert' | 'status';
  tone?: StatusTone;
}) {
  return (
    <p
      className={`status-notice ${compact ? 'status-notice-compact' : ''} ${className}`}
      data-tone={tone}
      role={role}
    >
      {children}
    </p>
  );
}
