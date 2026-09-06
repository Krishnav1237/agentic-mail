/**
 * {@link EmptyState} — calm, informational, never emotional (Constitution §57).
 * It explains why a surface is empty and what happens next; it never apologizes
 * or celebrates.
 */
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '56px 24px',
        gap: 10,
      }}
    >
      {icon && (
        <div style={{ color: 'var(--text-faint)', marginBottom: 4 }} aria-hidden>
          {icon}
        </div>
      )}
      <div
        style={{
          font: '400 calc(var(--type-scale, 1) * 15px)/1.4 Inter, sans-serif',
          color: 'var(--text)',
        }}
      >
        {title}
      </div>
      {description && (
        <p
          style={{
            margin: 0,
            maxWidth: '46ch',
            font: '400 calc(var(--type-scale, 1) * 12.5px)/1.6 Inter, sans-serif',
            color: 'var(--text-muted)',
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
