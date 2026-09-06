/**
 * THE visual language for attention. One mapping, used by every page.
 *
 *   URGENCY pigment    = URGENT     — deal with this soon    (coral by default)
 *   IMPORTANCE pigment = IMPORTANT  — this matters           (gold by default)
 *   NEUTRAL            = neither    — nothing special
 *
 * The two colors mean exactly one thing each, always, on every page. The
 * urgency pigment never means "important", the importance pigment never means
 * "overdue", and neither color's meaning shifts with context. A first-time
 * user learns the pair once:
 *
 * WHICH TWO COLORS THOSE ARE IS A USER PREFERENCE, and deliberately the only
 * thing about this file that is. Settings → Advanced → Attention colors picks
 * one pigment per axis from a curated list; `AppShell` writes the choice onto
 * `.iil-root` as a data attribute and index.css resolves it into the
 * `--attention-*` tokens every function below returns. So the DEFAULTS are
 * still coral and gold, the two axes still map to exactly one hue each, and
 * the pairing below still holds — only the pigment those roles are drawn in
 * can move. Nothing here branches on the preference, and nothing here knows
 * what colour it currently resolves to; that is what keeps "recolour urgency"
 * from becoming an edit to twenty components. Read "coral" and "gold" below
 * as "the urgency pigment" and "the importance pigment".
 *
 *   🔴 act soon.  🟡 this matters.  🔴🟡 act soon, and this matters.  ⚪ nothing special.
 *
 * BOTH SIGNALS ARE SHOWN WHEN BOTH APPLY — but through two different channels
 * on the row, not two competing marks in the same one. There is no
 * arbitration, no "urgent wins over gold", no combined third hue and no
 * red→gold gradient:
 *
 *   SURFACE (wash, border, accent rail, timing/insight metadata) → URGENCY.
 *       The dominant, page-level treatment, because urgency is what decides
 *       what you look at first.
 *   DOT → IMPORTANCE when the row is important, otherwise urgency.
 *       See `attentionDotFill` for why the dot resolves in that order.
 *
 * So the four states read as:
 *
 *   neither             plain row, no attention dot
 *   important only      gold row, gold dot
 *   urgent only         coral row, coral dot
 *   urgent + important  CORAL row, GOLD dot
 *
 * The combined state is a coral row whose dot has gone gold — one glance, two
 * facts, and exactly one extra mark to learn. Red still leads (it owns the
 * whole surface); gold is still present and still means only "this matters".
 *
 * A row never carries more than one attention dot. Two coloured dots plus the
 * neutral unread dot is three marks in a 20px column, which reads as clutter
 * long before it reads as information.
 *
 * ACCESSIBILITY (the reason this refactor exists): attention is expressed
 * through container treatment — a background wash, an accent rail, a semantic
 * accent color on metadata, and at most a restrained weight difference. It is
 * NEVER expressed by making text dimmer, fainter, lower contrast or more
 * transparent. Normal mail is not quiet mail; it's mail with nothing special
 * about it, and it reads at full comfortable contrast. That's why every text
 * color below comes from the shared `--text-*` ladder with a floor, and why no
 * function here takes a list index.
 *
 * Pure functions only — the two components this language needs
 * (`AttentionRail`, `AttentionDot`) live in `primitives.tsx` alongside the
 * other shared visual primitives.
 */
import type { CSSProperties } from 'react';
import type { Attention, Importance, Urgency } from '../../lib/attention';
import { isImportant, isUrgent, needsAttention } from '../../lib/attention';
import type { RowVisual } from './InteractiveRow';

/**
 * How loudly a surface carries its attention treatment.
 *
 * `card`  — a standalone card that owns its own box (Actions' Overdue/Today
 *           rows, Approvals' pending rows, Opportunities' elevated card,
 *           Dashboard's decision rows).
 * `row`   — a line in a dense list that has no resting surface of its own
 *           (Inbox's stream, Actions' This week/Later tiers, the thread
 *           rail, Dashboard's compact rows).
 *
 * Both use the same hues, the same rail and — as of V1.0 — the same wash.
 *
 * The two now differ ONLY in their border. The wash used to differ too — a
 * row ran it at roughly half a card's strength — which meant the same
 * semantic state rendered visibly heavier on Actions/Approvals/Dashboard
 * (cards) than in the Inbox stream (rows). The Inbox treatment is the
 * canonical one, so it is now the only one; see `--attention-*-bg` in
 * index.css for the full reasoning on why the border legitimately still
 * varies when the wash doesn't.
 */
export type AttentionDensity = 'card' | 'row';

/**
 * The rest/hover surface + border ring for a row.
 * Feed straight into `InteractiveRow`'s `visual` prop.
 *
 * The surface carries URGENCY. An urgent row takes the urgency wash whether or
 * not it's also important — its importance shows through the mark and dot
 * instead, so the surface never has to blend two hues into an ambiguous third.
 * A row that's important without being urgent gets the importance wash; a row
 * with neither deliberately returns only a hover treatment — no resting tint,
 * no border, nothing that would read as "this is flagged". A normal row looks
 * like a plain row, because that's exactly what it is.
 *
 * Every value below is a token, not a literal. The alphas live in index.css
 * (`--attention-*`) so the same semantic wash cannot be authored at two
 * different strengths in two components, and the pigment those alphas apply
 * to follows the user's Settings choice — which is why no `rgb()` or hue
 * appears anywhere in this file any more.
 */
export function attentionVisual(attention: Attention, density: AttentionDensity = 'card'): RowVisual {
  // Only the border ring is density-dependent; see `AttentionDensity`.
  const strong = density === 'card' ? '-strong' : '';
  if (isUrgent(attention)) {
    return {
      bg: 'var(--attention-urgency-bg)',
      border: `var(--attention-urgency-border${strong})`,
      hoverBg: 'var(--attention-urgency-bg-hover)',
      hoverBorder: `var(--attention-urgency-border${strong}-hover)`,
    };
  }
  if (isImportant(attention)) {
    return {
      bg: 'var(--attention-importance-bg)',
      border: `var(--attention-importance-border${strong})`,
      hoverBg: 'var(--attention-importance-bg-hover)',
      hoverBorder: `var(--attention-importance-border${strong}-hover)`,
    };
  }
  return { hoverBg: 'rgb(var(--ink) / 0.04)', hoverBorder: 'rgb(var(--ink) / 0.09)' };
}

/** Accent-rail fill for the 3px bar down a row's leading edge — coral when
 * urgent, gold when important-without-urgency, undefined when neither (no
 * rail at all; see `AttentionRail`). The rail is part of the dominant
 * treatment, so urgency claims it and importance rides the dot/mark. */
export function attentionRailFill(attention: Attention): string | undefined {
  if (isUrgent(attention)) return 'var(--attention-urgency-rail)';
  if (isImportant(attention)) return 'var(--attention-importance-rail)';
  return undefined;
}

/** Whether a row gets the tinted-card treatment at all (rail, resting wash,
 * `overflow: hidden` so the rail clips to the radius) — true on either axis. */
export function isTinted(attention: Attention): boolean {
  return needsAttention(attention);
}

/**
 * Semantic color for *attention metadata* — a due label, a closing date,
 * IIL's insight line, a header count segment. This is the one place a
 * coral/gold text color is allowed to come from, and it applies only to
 * metadata that is genuinely about attention.
 *
 * Metadata of this kind is overwhelmingly about timing ("2 days overdue",
 * "closes Friday"), so it follows urgency and falls back to gold only when
 * there's no urgency to report. Importance is never silently dropped as a
 * result: it keeps its own dot and mark on the same row.
 *
 * Neither-axis returns `--text-muted`, a real readable ladder token — not a
 * near-invisible alpha. Metadata is supporting text, not hidden text.
 */
export function attentionMetaColor(attention: Attention): string {
  if (isUrgent(attention)) return 'var(--attention-urgency-ink)';
  if (isImportant(attention)) return 'var(--attention-importance-ink)';
  return 'var(--text-muted)';
}

/**
 * Semantic color for a DEADLINE label specifically — "9 days overdue",
 * "closes in 2 days". An overdue row's `attention.urgency` is `urgent` like
 * any other urgent row (overdue is a subset of urgent, see `attention.ts`'s
 * module doc, and `mailStore.ts`'s `refreshDerivedState` escalates it there),
 * so `attentionMetaColor` alone already reads red for it. This function keeps
 * an explicit `overdue` param anyway so the deadline TEXT reads red in the
 * exact token the Overdue section heading itself uses
 * (`--attention-urgency-soft`) even in the hypothetical case a row's urgency
 * were ever authored/escalated differently — a mail's own "9 days overdue"
 * and the section heading above it stay visibly making the same statement
 * everywhere either appears — Dashboard, Actions, Approvals, Opportunities,
 * or any future page that renders one.
 *
 * Overdue wins outright, ahead of importance: this is specifically a
 * deadline label, and a deadline reads as overdue regardless of whether the
 * item behind it also happens to be important — that fact stays visible
 * elsewhere on the row (the gold dot/rail), not by recoloring this one piece
 * of timing text.
 */
export function deadlineMetaColor(attention: Attention, overdue: boolean): string {
  return overdue ? 'var(--attention-urgency-soft)' : attentionMetaColor(attention);
}

/** Softer variant of the above for a longer run of insight text, where the
 * full-strength accent would shout. Still on the readable ladder when neither
 * axis is raised. */
export function attentionInsightColor(attention: Attention): string {
  if (isUrgent(attention)) return 'var(--attention-urgency-soft)';
  if (isImportant(attention)) return 'var(--attention-importance-soft)';
  return 'var(--text-secondary)';
}

/**
 * Restrained weight bump for a row's primary line. Attention is allowed to
 * add *weight* (500 → 600 is a legible, non-destructive emphasis); it is
 * never allowed to subtract contrast, change the font family, or change the
 * font size. Either axis earns the bump, and both together earn it once —
 * emphasis doesn't stack into a third weight, because there is no third
 * level.
 */
export function attentionWeight(attention: Attention, base = 500): number {
  return needsAttention(attention) ? base + 100 : base;
}

/* -------------------------------- The dot --------------------------------- */

/**
 * Fill for the row's single attention dot, or nothing when neither axis is
 * raised. Consumed by `AttentionDot` in `primitives.tsx`.
 *
 * IMPORTANCE IS CHECKED FIRST, and that ordering is the whole design:
 *
 *   important (urgent or not) → gold
 *   urgent, not important     → coral
 *   neither                   → no dot
 *
 * This is not "gold wins over red" arbitration — nothing is being suppressed.
 * Urgency is already carried, at full strength, by the surface this dot sits
 * on: an urgent + important row is unmistakably coral before you ever look at
 * the dot. Spending the dot on urgency too would say the same thing twice and
 * leave importance with nowhere to go. So the surface reports urgency and the
 * dot reports importance, and the only reason the dot falls back to coral is
 * that a merely-urgent row would otherwise have no dot at all.
 *
 * Read off a row: coral surface + coral dot = urgent. Coral surface + gold dot
 * = urgent AND important. Gold surface + gold dot = important. The gold dot on
 * coral is the one thing to learn, and it means exactly what gold always
 * means.
 *
 * Kept beside the rest of the mapping so the dot can never drift to a
 * different red or gold than the rail above it.
 */
export function attentionDotFill(attention: Attention): string | undefined {
  if (isImportant(attention)) return 'var(--attention-importance-dot)';
  if (isUrgent(attention)) return 'var(--attention-urgency-dot)';
  return undefined;
}

/** Soft halo for the attention dot on the loudest surfaces (Dashboard's
 * decision rows). Matches whichever fill `attentionDotFill` chose, so the glow
 * can never be a different hue than the dot it surrounds. */
export function attentionDotGlow(attention: Attention): string | undefined {
  if (isImportant(attention)) return 'var(--attention-importance-glow)';
  if (isUrgent(attention)) return 'var(--attention-urgency-glow)';
  return undefined;
}

/** Convenience for the small square swatch in the style guide / filter menus.
 * Takes an axis value rather than a whole `Attention`, because that's exactly
 * what a filter option is: one value on one axis. */
export function urgencySwatchStyle(urgency: Urgency): CSSProperties {
  return swatch(urgency === 'urgent' ? 'var(--attention-urgency-dot)' : undefined);
}

export function importanceSwatchStyle(importance: Importance): CSSProperties {
  return swatch(importance === 'important' ? 'var(--attention-importance-dot)' : undefined);
}

function swatch(background: string | undefined): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 2,
    flex: 'none',
    background: background ?? 'rgb(var(--ink) / 0.22)',
  };
}
