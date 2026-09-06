/**
 * The compact status summary beside every mail/workflow page's `<h1>` —
 * "12 open · 1 urgent · 2 important". One shared pattern every mail/workflow
 * page (Inbox/Actions/Opportunities/Approvals) renders through, rather than
 * each hand-rolling its own spans.
 *
 * The attention segments are built by `attentionSegments` below from
 * `summarizeAttention` (`lib/attention.ts`), so every page counts the same
 * way, off the same field, with the same words — never "1 overdue" here and
 * "1 closing soon" there for what is the same urgent count. Completed items
 * are excluded upstream, by `summarizeAttention`.
 *
 * This component owns only the shared chrome: typography, the "·"
 * separators, the coral/gold/neutral coloring (from the one shared attention
 * palette), and hiding a zero segment rather than cluttering the header with
 * "0 urgent · 0 important".
 */
import type { CSSProperties } from 'react';
import type { AttentionSummary } from '../../lib/attention';
import { IMPORTANT_COUNT_LABEL, URGENT_COUNT_LABEL } from '../../lib/attention';
import { attentionMetaColor } from './attention';

export type HeaderCountSegment = {
  /** e.g. "open", "urgent", "important" — the word, not the number. */
  label: string;
  value: number;
  /** `'total'` is the leading neutral count of items; `'urgent'`/`'important'`
   * name the two attention AXES, colored from the one shared palette. There is
   * deliberately no page-specific tone, and no combined tone — an urgent +
   * important item is simply counted in both segments. */
  tone: 'total' | 'urgent' | 'important';
  /** Always render this segment even when `value` is 0 — for the leading
   * total (e.g. "0 open" still communicates something; "0 urgent" is just
   * clutter). Defaults to false. */
  alwaysShow?: boolean;
};

function segmentColor(tone: HeaderCountSegment['tone']): string {
  if (tone === 'urgent') return attentionMetaColor({ urgency: 'urgent', importance: 'normal' });
  if (tone === 'important') return attentionMetaColor({ urgency: 'normal', importance: 'important' });
  return 'var(--text-muted)';
}

/**
 * The standard three-segment header summary: a page-appropriate total
 * ("open" / "pending" / "active" / "mails") followed by the two attention
 * counts, in the one global vocabulary.
 *
 * Pages choose only the noun for their own total — how many *things* the page
 * holds is genuinely page-specific. The attention words are not: they're
 * always "urgent" and "important", in that order, off the same counts.
 *
 * The two attention counts OVERLAP by design, because urgency and importance
 * are independent: an item that is both is counted once in each. So "10 open ·
 * 3 urgent · 4 important" can describe 2 urgent-only, 3 important-only, 1 both
 * and 4 with neither. They were never a partition of the total.
 */
export function attentionSegments(
  totalLabel: string,
  summary: AttentionSummary,
): HeaderCountSegment[] {
  return [
    { label: totalLabel, value: summary.activeCount, tone: 'total', alwaysShow: true },
    { label: URGENT_COUNT_LABEL, value: summary.urgentCount, tone: 'urgent' },
    { label: IMPORTANT_COUNT_LABEL, value: summary.importantCount, tone: 'important' },
  ];
}

export function HeaderCountSummary({ segments }: { segments: HeaderCountSegment[] }) {
  const visible = segments.filter((s) => s.alwaysShow || s.value > 0);
  if (visible.length === 0) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        font: '400 calc(var(--type-scale, 1) * 12px)/1.4 Inter, sans-serif',
      }}
    >
      {visible.map((s, i) => (
        <span
          key={s.label}
          style={
            {
              fontWeight: s.tone === 'total' ? 400 : 500,
              color: segmentColor(s.tone),
              whiteSpace: 'nowrap',
            } as CSSProperties
          }
        >
          {s.value} {s.label}
          {i < visible.length - 1 ? <span style={{ color: 'var(--text-muted)' }}>&nbsp;·&nbsp;</span> : null}
        </span>
      ))}
    </span>
  );
}
