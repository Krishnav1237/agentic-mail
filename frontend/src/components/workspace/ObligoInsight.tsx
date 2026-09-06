/**
 * Obligo's own output inside an opened mail — the insight section, plus the
 * compact gold control both Obligo elements collapse into.
 *
 * THE PROBLEM THIS EXISTS TO SOLVE. A mail's row preview has always shown a
 * truncated Obligo insight in its own right-hand column, but the opened mail had
 * nowhere to put the full text: the insight was passed to the "Obligo Suggested
 * Reply" control as its one-line description, so a mail with an insight and no
 * drafted reply — the single most common case on Actions, where Obligo is blocked
 * precisely *because* it can't draft anything — showed the insight in the list
 * and then lost it completely the moment the user opened the mail. The row was
 * the only place Obligo's output could be read, and only ever in truncated form.
 *
 * THREE KINDS OF TEXT, THREE PLACES. The opened mail keeps them apart:
 *
 *   the message body   what the sender actually wrote     (MailThreadView)
 *   Obligo Insight        what Obligo inferred/recommends/flags (here)
 *   Obligo Suggested Reply a draft to review, edit and send  (ReplyComposer)
 *
 * AI-authored text never enters the message body, and the sender's words never
 * enter either Obligo element.
 *
 * SHARED VISUAL LANGUAGE, DISTINCT SEMANTIC LABEL. Both Obligo elements use the
 * same gold vocabulary the suggested reply already established — gold dot,
 * gold eyebrow, the `--approve-band`/`--approve-border` card — because both
 * are assistant-generated content and should read as one layer. What tells
 * them apart is the label ("Obligo Insight" vs "Obligo Suggested Reply") and the
 * interaction: the insight opens expanded because it's something to read, the
 * draft opens collapsed because it's something to act on.
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { GoldDot } from './primitives';
import { truncatePreview } from '../../lib/mailAdapters';

/**
 * The compact one-line control an Obligo element collapses into: gold dot, its
 * label, a short preview of what's inside, and a chevron. Shared by the
 * insight and the suggested reply so the two can't drift into two slightly
 * different gold rows — the label and the preview are the only differences,
 * which is exactly as it should be.
 *
 * The preview here is a *teaser for content that's one click away*, never the
 * only copy of it — the same rule the list rows follow.
 */
export function ObligoDisclosure({
  label,
  preview,
  expanded,
  ariaLabel,
  onToggle,
}: {
  label: string;
  /** Short preview shown beside the label. Truncated by the caller if it
   * comes from long-form text. */
  preview?: ReactNode;
  expanded: boolean;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={ariaLabel}
      onClick={onToggle}
      style={{
        // `flex`, not `inline-flex`. An inline-flex box is shrink-to-fit: its
        // width IS its content's width, and the `maxWidth: '100%'` that used
        // to sit here only ever CAPPED that — nothing made it fill. So a
        // collapsed panel was as wide as whatever preview text happened to be
        // in it, while the same panel expanded (a block `<section>`) spanned
        // the reading pane. Two different widths for one component, decided by
        // its contents rather than by the space it was given.
        //
        // Block-level flex + `width: 100%` makes the container's width the
        // container's business in both states: expanding or collapsing now
        // changes how much content is VISIBLE, never how wide the panel is.
        // `flex: 1 1 auto` is inert here as a plain block child (the insight
        // case) and lets the panel take the row's leftover space where it IS a
        // flex item (the suggested-reply case, beside "Reply yourself") — one
        // declaration covering both call sites without a layout prop.
        display: 'flex',
        width: '100%',
        flex: '1 1 auto',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        padding: '9px 12px',
        borderRadius: 10,
        border: '1px solid rgb(var(--gold-2) / 0.25)',
        background:
          'linear-gradient(90deg, rgb(var(--gold-2) / 0.09), rgb(var(--gold-2) / 0.015))',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <GoldDot size={6} />
      <span
        style={{
          flex: 'none',
          font: '500 11.5px Inter, sans-serif',
          color: 'var(--gold-ink)',
        }}
      >
        {label}
      </span>
      {preview && (
        <span
          style={{
            // Takes the panel's slack now that the panel is full-width, which
            // is what puts the chevron on the trailing edge instead of
            // trailing the text — the same place the expanded header's own
            // collapse chevron sits (`marginLeft: 'auto'` below), so the two
            // states line their control up in the same spot. Still truncates:
            // `minWidth: 0` lets it shrink past its content, and the ellipsis
            // does the rest.
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            font: '400 11px Inter, sans-serif',
            // The one place a preview is allowed to be quiet: the full text is
            // always one click away in the same view, so this is a hint, not
            // the content itself.
            color: 'var(--text-faint)',
          }}
        >
          {preview}
        </span>
      )}
      <ChevronDown
        size={12}
        strokeWidth={2}
        aria-hidden
        style={{
          flex: 'none',
          // Keeps the chevron on the trailing edge even with no preview to
          // push it there (a no-op when the preview above took the slack).
          marginLeft: 'auto',
          color: 'var(--gold-ink)',
          transform: expanded ? 'rotate(180deg)' : undefined,
          transition: 'transform .16s ease',
        }}
      />
    </button>
  );
}

/**
 * The full Obligo insight for an opened mail.
 *
 * EXPANDED BY DEFAULT, AND COMPLETE. If Obligo has something to tell the user,
 * the user should see it on open without hunting for it — so this starts
 * expanded and shows the whole insight. It is never line-clamped, never
 * hover-only, never a tooltip: long insights wrap and, if the reading pane
 * runs short, scroll with everything else. Collapsing is a deliberate user
 * action, and the collapsed state (a compact `ObligoDisclosure` row) still shows
 * a preview plus a way back.
 *
 * Collapse state is intentionally per-thread and not persisted: the caller
 * keys this by the open mail's id, matching how `MailThreadView` already
 * resets its reply mode and thread-history state when the reader moves to a
 * different mail. Carrying one mail's collapsed insight over to the next mail
 * would hide a *different* insight the reader has never seen.
 *
 * Renders nothing at all when there's no insight — no header, no empty
 * container, no filler. The UI reflects what Obligo actually has.
 */
export function ObligoInsight({
  insight,
  defaultExpanded = true,
}: {
  insight: string;
  /** Escape hatch for a caller that genuinely wants this to start collapsed.
   * Defaults to expanded — see above. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const text = insight.trim();
  if (!text) return null;

  if (!expanded) {
    return (
      <ObligoDisclosure
        label="Obligo Insight"
        preview={truncatePreview(text, 90)}
        expanded={false}
        ariaLabel="Show the full Obligo insight"
        onToggle={() => setExpanded(true)}
      />
    );
  }

  return (
    <section
      aria-label="Obligo insight"
      style={{
        borderRadius: 14,
        padding: '12px 16px 14px',
        // The same smoked-gold card the suggested-reply composer uses, from
        // the same two tokens — so the two Obligo elements read as one layer in
        // both themes rather than two separately-tuned golds.
        background: 'var(--approve-band)',
        border: '1px solid var(--approve-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <GoldDot size={6} />
        <span className="obligo-eyebrow" style={{ color: 'var(--gold-ink)' }}>
          Obligo Insight
        </span>
        <button
          type="button"
          className="obligo-icon-btn"
          aria-expanded
          aria-label="Collapse Obligo insight"
          onClick={() => setExpanded(false)}
          style={{
            marginLeft: 'auto',
            color: 'var(--text-faint)',
            padding: 3,
            margin: '-3px -3px -3px auto',
          }}
        >
          <ChevronDown
            size={13}
            strokeWidth={2}
            aria-hidden
            style={{ transform: 'rotate(180deg)' }}
          />
        </button>
      </div>
      {/* Full text, always. `--text-secondary` is the same readable ladder
          token the message body above uses — Obligo's layer is identified by the
          gold label and the card, never by being dimmer than the email, which
          would make the assistant's output the hardest thing on screen to
          read. `pre-line` so a multi-paragraph insight stays multi-paragraph
          instead of collapsing into one run-on block. */}
      <p
        style={{
          // Same shared measure as the message body above it, so Obligo's
          // insight and the email it's about occupy the same column rather
          // than two independently-chosen widths that only looked equal.
          maxWidth: 'var(--measure-mail)',
          margin: '8px 0 0',
          font: '400 12.5px/1.7 Inter, sans-serif',
          color: 'var(--text-secondary)',
          whiteSpace: 'pre-line',
        }}
      >
        {text}
      </p>
    </section>
  );
}
