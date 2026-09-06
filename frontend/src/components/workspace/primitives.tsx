import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Attention } from '../../lib/attention';
import { NORMAL_ATTENTION } from '../../lib/attention';
import {
  attentionDotFill,
  attentionDotGlow,
  attentionRailFill,
} from './attention';
import { getPortalRoot } from './ReplyComposer';

/** Mono, 10px, letter-spaced uppercase section label (the deck's `.lbl`). */
export function Eyebrow({
  children,
  alpha,
  style,
}: {
  children: ReactNode;
  /** Optional explicit ink alpha; omit to use the shared `--text-faint` token. */
  alpha?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      className="obligo-eyebrow"
      style={{
        ...(alpha !== undefined
          ? { color: `rgb(var(--ink) / ${alpha})` }
          : null),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * The leading accent rail — coral whenever the row is urgent, gold when it's
 * important without being urgent, nothing at all when neither, so callers can
 * drop it in unconditionally instead of repeating the same `{tinted && ...}`
 * guard in every row component. Urgency claims the rail because it's the
 * dominant treatment; an urgent + important row keeps its importance visible
 * through `AttentionDot`, whose single dot goes gold on exactly those rows.
 * The parent needs `position: relative` and (for a rounded row) `overflow:
 * hidden`.
 *
 * Colors come from `attentionRailFill` in `./attention`, the same mapping the
 * background wash and the dot read, so a rail can never be a different red
 * than the row it sits on.
 */
export function AttentionRail({ attention }: { attention: Attention }) {
  const background = attentionRailFill(attention);
  if (!background) return null;
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        background,
      }}
    />
  );
}

/** Small outlined metadata tag. Deliberately NOT an attention badge — the
 * old HIGH/MED/LOW ladder that used to live here is gone (attention is
 * carried by tint + rail + dot now, see `attention.tsx`); this remains for
 * genuinely non-attention labels. */
export function Tag({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className="obligo-tag" style={style}>
      {children}
    </span>
  );
}

/** Earned-attention gold dot. `glow` adds the soft halo used on the loudest row. */
export function GoldDot({
  size = 6,
  glow = false,
  opacity = 1,
}: {
  size?: number;
  glow?: boolean;
  opacity?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        opacity,
        background: 'var(--gold-grad-135)',
        boxShadow: glow ? '0 0 10px rgb(var(--gold-2) / 0.6)' : undefined,
      }}
    />
  );
}

/**
 * The one per-row attention dot every mail/workflow page renders — Inbox,
 * Actions, Opportunities, Approvals, Dashboard.
 *
 * AT MOST TWO DOTS, never more:
 *
 *   unread    → a plain neutral dot (white in dark, ink in light)
 *   attention → ONE coloured dot, gold if the row is important, coral if it's
 *               urgent-but-not-important, nothing if neither
 *
 * Urgency isn't lost when the dot goes gold — the row's whole surface (wash,
 * border, accent rail) is already coral and says so at a glance. The dot is
 * spent on importance because that's the fact the surface can't also carry.
 * A coral row with a gold dot is "urgent AND important"; a coral row with a
 * coral dot is "urgent". See `attentionDotFill` for the full reasoning.
 *
 * The rule that matters most: the unread dot NEVER changes color because a
 * mail is urgent or important. Read state is not attention; the moment the
 * unread dot starts carrying attention, "what have I not read" and "what needs
 * me" become impossible to tell apart at a glance.
 *
 * The unread dot is also always the same fixed shade everywhere. It's a plain
 * binary signal, not something that should fade with list position (pages
 * used to each pass their own fade-by-index alpha, which made the same dot
 * read as a different brightness on every page). `unreadAlpha` exists only
 * for a genuinely different design, never for per-row quieting.
 *
 * Renders an empty spacer (one dot's footprint) when neither applies, so rows
 * stay aligned down the column regardless of state.
 */
export function AttentionDot({
  attention = NORMAL_ATTENTION,
  unread,
  size = 6,
  unreadAlpha = 0.85,
  glow,
  className,
  style,
}: {
  /** The row's canonical attention pair. Defaults to fully normal — no dot. */
  attention?: Attention;
  unread?: boolean;
  size?: number;
  /** Ink alpha for the plain unread dot. Deliberately not varied per
   * caller/row — every page's unread dot should read as the same
   * brightness, so leave this at its default unless the design itself
   * (not list position) calls for a different fixed shade. */
  unreadAlpha?: number;
  /** Defaults to `unread` — the attention dot glows exactly when the row is
   * also unread, the same "louder while both signals hold" rule as before. */
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const fill = attentionDotFill(attention);
  const showGlow = glow ?? Boolean(unread);
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flex: 'none',
        ...style,
      }}
    >
      {unread && (
        <span
          style={{
            width: size,
            height: size,
            flex: 'none',
            borderRadius: '50%',
            // Neutral ink, always. Never tinted by `attention`.
            background: `rgb(var(--ink) / ${unreadAlpha})`,
          }}
        />
      )}
      {fill && (
        <span
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            flex: 'none',
            opacity: unread ? 1 : 0.9,
            background: fill,
            boxShadow: showGlow ? attentionDotGlow(attention) : undefined,
          }}
        />
      )}
      {!unread && !fill && (
        <span style={{ width: size, height: size, flex: 'none' }} />
      )}
    </span>
  );
}

/**
 * Pill filter chip (Inbox categories, Opportunities lifecycle tabs).
 *
 * Passes through the rest of the native button attributes — the same thing
 * `Button` in `controls.tsx` already does, and for the same reason: a chip
 * group is sometimes a set of independent filters and sometimes three views of
 * one thing (Settings' attention preview), and only the caller knows which.
 * Without this, expressing that difference would have meant a second chip
 * component whose only distinction was its ARIA role.
 */
export function Chip({
  active,
  children,
  onClick,
  ...props
}: {
  active?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...props}
      style={{
        font: '500 calc(var(--ui-scale) * var(--type-scale, 1) * 10.5px)/1 Inter, sans-serif',
        borderRadius: 'calc(var(--ui-scale) * 14px)',
        padding: 'calc(var(--ui-scale) * 5px) calc(var(--ui-scale) * 12px)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        color: active ? 'var(--paper)' : 'var(--text-muted)',
        background: active ? 'rgb(var(--ink) / 0.82)' : 'transparent',
        border: active
          ? '1px solid transparent'
          : '1px solid rgb(var(--ink) / 0.1)',
        transition: 'color .18s ease, background .18s ease',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Uppercase, letter-spaced group/section label used for every sub-header in
 * the workspace (Actions/Opportunities/Approvals shelves, Settings' section
 * and Advanced sub-headings). The differentiator is *typeface*, not size or
 * dimness — monospace (the same JetBrains Mono family Eyebrow/mono metadata
 * already use elsewhere) has a visibly different letterform texture from the
 * Inter row titles beneath it, so it reads as a different *kind* of text at
 * a glance without needing to be smaller or fainter than the content it
 * labels. Bold weight + a bright-enough alpha keep it easy to read, not
 * shrunk into a caption.
 */
export function ShelfHeading({
  children,
  alpha = 0.72,
  size = 12.5,
  style,
}: {
  children: ReactNode;
  alpha?: number;
  size?: number;
  /** Optional override, e.g. a tinted color for a channel like Actions'
   * rust "Overdue" tier — merged on top of the default ink-alpha color. */
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        font: `700 calc(var(--type-scale, 1) * ${size}px)/1.3 'JetBrains Mono', monospace`,
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: `rgb(var(--ink) / ${alpha})`,
        paddingBottom: 3,
        borderBottom: '2px solid rgb(var(--ink) / 1)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * `ConfirmDialog`'s own content, portalled to `.obligo-root` rather than
 * rendered in place. Every workspace page renders inside `.obligo-page`, which
 * carries its own `transform: scale(...)` (per-page content zoom) — a
 * `transform` on an ancestor gives the browser a new containing block for
 * `position: fixed`, so without the portal this dialog centers on the
 * *page's* transformed box instead of the real viewport, landing off-screen
 * (or requiring a scroll) whenever the page itself is scrolled. Split into
 * its own component (rather than calling `createPortal` inline inside
 * `AnimatePresence`'s `{open && ...}`) because `AnimatePresence` needs a
 * real element with stable identity as its direct child to track enter/exit
 * — handing it a `createPortal(...)` call directly (a Portal object, not a
 * plain element) makes it silently render nothing. Same shape as
 * `ReplyComposer`'s `LinkDialog`/`SchedulePopover`, which is why this works.
 */
function ConfirmDialogPortal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const messageId = `${baseId}-message`;

  /**
   * The three things that make this an actual modal rather than a
   * modal-looking box, none of which it had: Escape dismisses it (every
   * other overlay in the workspace — `Select`, the filter menu, the metadata
   * popover — already closes on Escape, so this was the one that trapped a
   * keyboard user), focus moves into the dialog on open and returns to
   * whatever opened it on close, and Tab cycles inside instead of walking
   * off into the page behind the scrim. It guards the two most destructive
   * actions in the product (Reset settings, Delete account), so "the only
   * way out is a mouse click" was the wrong contract for it specifically.
   *
   * Initial focus lands on Cancel, not Confirm — for a dialog whose confirm
   * side is "Delete account", a stray Enter should never be the thing that
   * commits it.
   */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.45)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--overlay)',
          border: '1px solid var(--overlay-border)',
          boxShadow: 'var(--overlay-shadow), inset 0 1px 0 var(--inset-hi)',
          backdropFilter: 'blur(var(--glass-blur-strong))',
          WebkitBackdropFilter: 'blur(var(--glass-blur-strong))',
          borderRadius: 16,
          padding: '24px 26px',
          color: 'var(--text)',
        }}
      >
        <div
          id={titleId}
          style={{
            font: '500 16px/1.3 Inter, sans-serif',
            color: 'var(--text-strong)',
          }}
        >
          {title}
        </div>
        <p
          id={messageId}
          style={{
            font: '400 12.5px/1.6 Inter, sans-serif',
            color: 'var(--text-secondary)',
            margin: '10px 0 0',
          }}
        >
          {message}
        </p>
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            marginTop: 22,
          }}
        >
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{
              font: '400 12px Inter, sans-serif',
              color: 'var(--text-secondary)',
              border: '1px solid rgb(var(--ink) / 0.12)',
              background: 'transparent',
              borderRadius: 8,
              padding: '9px 16px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              font: '500 12px Inter, sans-serif',
              color: 'var(--paper)',
              background: 'rgb(var(--ink) / 0.88)',
              border: '1px solid transparent',
              borderRadius: 8,
              padding: '9px 18px',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    getPortalRoot()
  );
}

/**
 * Confirmation dialog for Reset Settings / Delete Account. No destructive color
 * (Constitution §23) — hierarchy comes from a single filled neutral action.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <ConfirmDialogPortal
          title={title}
          message={message}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}
    </AnimatePresence>
  );
}
