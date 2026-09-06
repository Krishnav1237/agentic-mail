/**
 * The shared "N completed, in the last N days" footer every workflow page
 * (Actions/Opportunities/Approvals) ends on — one component so the
 * typography, spacing, underline-adjacent border, disclosure control, and
 * interaction behavior stay identical across the three instead of being
 * reimplemented per page (they used to be: two near-identical, both
 * decorative "show" buttons with no `onClick` at all).
 *
 * The count/day-window and the expanded content below it are each page's
 * own — derived from the one shared `StoredMailRow.completedAt`/
 * `completedNote` state (`lib/mailStore.ts`), not a page-local counter — but
 * the chrome around them is this one component, so a real backend swapping
 * in real completion data never has to touch three different footers.
 */
import type { CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import { Eyebrow } from './primitives';

export function CompletionSummaryHeader({
  label,
  count,
  days,
  expanded,
  onToggle,
}: {
  /** "Completed" on every workflow page today — kept as a prop rather than a
   * hardcoded string because the surrounding structure (this component) is
   * what's actually shared, not the label; a future page is still free to
   * use its own word here without forking the component. */
  label: string;
  count: number;
  /** Days since the oldest item in the window, or `null` when `count` is 0
   * (nothing to date a window by — the phrase is omitted rather than
   * showing a fabricated number). */
  days: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid rgb(var(--ink) / 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <Eyebrow alpha={0.56} style={{ fontWeight: 600 }}>
        {label} · {count}
        {days !== null ? ` in the last ${days} day${days === 1 ? '' : 's'}` : ''}
      </Eyebrow>
      <button
        type="button"
        className="iil-icon-btn iil-chip-btn"
        aria-expanded={expanded}
        onClick={onToggle}
        disabled={count === 0}
        style={
          {
            gap: 3,
            font: '500 calc(var(--type-scale, 1) * 10px) Inter, sans-serif',
            '--chip-color': 'var(--text-secondary)',
            opacity: count === 0 ? 0.5 : 1,
            cursor: count === 0 ? 'default' : 'pointer',
          } as CSSProperties
        }
      >
        <ChevronRight
          size={11}
          strokeWidth={1.6}
          aria-hidden
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.18s ease',
          }}
        />
        {expanded ? 'hide' : 'show'}
      </button>
    </div>
  );
}
