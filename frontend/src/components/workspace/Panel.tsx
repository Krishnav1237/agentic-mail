/**
 * Shared surfaces: the glass {@link Panel} and the {@link Divider} hairline.
 *
 * Panel is the primary building block for grouped content (Reference §23). It
 * owns only surface, padding, border and elevation — never product logic
 * (Constitution §77). Depth comes from the shared elevation system, so panels
 * never define their own shadow.
 */
import type { CSSProperties, ReactNode } from 'react';

export function Panel({
  children,
  /** Inner padding in px. */
  padding = 16,
  /** Adds the shared hover lift for clickable surfaces. */
  interactive = false,
  className = '',
  style,
  onClick,
}: {
  children: ReactNode;
  padding?: number;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      className={`obligo-panel${interactive ? ' obligo-panel--interactive' : ''} ${className}`.trim()}
      style={{ padding, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * A hairline separator. Prefer whitespace first; reach for a divider only where
 * the design splits two adjacent thoughts (Constitution §34).
 */
export function Divider({
  spacing = 0,
  style,
}: {
  /** Vertical margin above and below, in px. */
  spacing?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      role="separator"
      style={{
        height: 1,
        background: 'rgb(var(--ink) / 0.07)',
        margin: `${spacing}px 0`,
        ...style,
      }}
    />
  );
}
