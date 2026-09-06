/**
 * Obligo Suggested Reply — the opened-email view's reply composer.
 *
 * Owns its own state machine (preview → editing → scheduled/sent) so that
 * switching threads (`key={openId}` at the call site) resets it cleanly.
 * Formatting runs on a plain contentEditable surface via `execCommand` —
 * there's no rich-text dependency in this project yet, and a lightweight
 * editable div is enough for the feature set asked for here.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eraser,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreHorizontal,
  Outdent,
  Paperclip,
  Pencil,
  Send,
  Underline,
  X as XIcon,
} from 'lucide-react';
import { GoldDot } from './primitives';
import { EASE } from './motion';
import {
  computePresetDate,
  formatScheduled,
  SCHEDULE_PRESETS,
} from '../../lib/scheduling';
import {
  formatAttachmentSize,
  localAttachmentFromFile,
  type Attachment,
  type MailBodyContent,
} from '../../lib/mailContent';
import type { Recipients } from '../../lib/mailStore';
import { stripHtml } from '../../lib/mailAdapters';

type ComposerStatus = 'preview' | 'editing' | 'scheduled' | 'sent';

/**
 * Everything the composer is holding when the user acts on it.
 *
 * Sending, scheduling and saving all hand back the SAME object, because they
 * are the same message at three different moments. It exists because the
 * previous callbacks took `(contentHtml)` alone: the recipient chips and the
 * attachment list were rendered, editable, and then thrown away at the moment
 * they mattered.
 */
export type ComposerPayload = {
  recipients: Recipients;
  body: MailBodyContent;
  attachments: Attachment[];
};

/* -------------------------------- helpers -------------------------------- */

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text → the editor's initial HTML. Every caller so far has passed a
 * single-line draft, so this stayed a single `<p>` — but a multi-paragraph
 * draft (blank-line-separated, e.g. an Approvals letter with its own
 * sign-off line) needs one `<p>` per paragraph, or the blank lines just
 * collapse away in HTML and the whole draft reads as one run-on paragraph.
 * A single-paragraph draft still produces exactly the one `<p>` it always
 * did. */
function draftToHtml(text: string) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const source = paragraphs.length > 0 ? paragraphs : [text];
  return source
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

const isMacPlatform =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPod|iPad/.test(navigator.platform || navigator.userAgent);

/** Hover hint shown on inserted links (native `title` tooltip) — the one
 * modifier that actually opens the link from inside the editor, spelled per
 * platform rather than always "Ctrl". */
const LINK_HINT_TEXT = isMacPlatform
  ? 'Cmd + Click to open'
  : 'Ctrl + Click to open';

/** Schemes an inserted link is allowed to use. Anything already carrying a
 * scheme outside this set is rejected outright rather than linked — an
 * `href` is not just text here: the editor's own Ctrl/Cmd+click handler
 * calls `window.open` on it, so `javascript:` (and `data:`/`vbscript:`,
 * which the same permissive `^scheme:` test used to wave through) would be
 * an executable payload dressed as a hyperlink. A bare host with no scheme
 * still gets `https://` prepended, exactly as before. */
const SAFE_LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    // `new URL` is the parser the browser itself will use for this href —
    // matching on it (rather than a regex over the raw string) means a
    // scheme obfuscated by whitespace/control characters, or by casing, is
    // normalized before the check rather than after it.
    return SAFE_LINK_SCHEMES.includes(new URL(candidate).protocol)
      ? candidate
      : '';
  } catch {
    return '';
  }
}

/**
 * A "valid" To/Cc entry here just means a non-blank chip — this composer's
 * recipient chips (like the rest of this mock data set) are sometimes a
 * real address and sometimes a display name with no address on file
 * (`selected.senderEmail ?? selected.sender`, same fallback `mailActions`
 * uses for the actual send). Requiring RFC email syntax would reject that
 * legitimate, already-working default and block sending threads that have
 * always been sendable. `RecipientField` already refuses to commit a
 * whitespace-only draft as a chip, so this mostly guards the case both
 * lists end up genuinely empty.
 */
function isValidRecipient(value: string) {
  return value.trim().length > 0;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Viewport-aware anchoring for the schedule-send popover. Fixed positioning
 * (not the `.obligo-menu` class default of absolute-inside-the-trigger) so the
 * popover can never be clipped by an ancestor, then flips above/below and
 * clamps horizontally based on the anchor's actual position — no hardcoded
 * offset, so it holds up at any viewport size or scroll position. Runs a
 * second pass on the next frame once the popover has real dimensions, since
 * the first measurement (before mount) has to guess at its size.
 */
export function usePopoverPosition(
  anchorRef: RefObject<HTMLElement>,
  popoverRef: RefObject<HTMLElement>,
  // Components that portal conditionally (rather than mount/unmount a fresh
  // instance per open) reuse the same anchor/popover ref identities across
  // opens — without this in the effect's deps, the layout effect only ever
  // runs once, before the portal exists, and the popover stays stuck
  // `visibility: hidden`.
  active = true,
  // Which edge of the anchor the popover's own edge lines up with —
  // 'right' (the default, existing behavior) anchors the popover's right
  // edge to the anchor's right edge; 'left' anchors their left edges
  // instead, for triggers whose popover should grow rightward.
  align: 'left' | 'right' = 'right'
) {
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
  });

  useLayoutEffect(() => {
    if (!active) return;
    const compute = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const popW = popoverRef.current?.offsetWidth || 260;
      const popH = popoverRef.current?.offsetHeight || 320;

      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < popH + margin && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(margin, rect.top - popH - margin)
        : Math.min(rect.bottom + margin, Math.max(margin, vh - popH - margin));

      let left = align === 'left' ? rect.left : rect.right - popW;
      if (left < margin) left = Math.max(margin, rect.left);
      if (left + popW > vw - margin)
        left = Math.max(margin, vw - margin - popW);

      setStyle({
        position: 'fixed',
        top,
        left,
        maxHeight: vh - margin * 2,
        overflowY: 'auto',
        visibility: 'visible',
      });
    };

    compute();
    const raf = requestAnimationFrame(compute);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);

    // The custom scheduler changes height as its sections open/close (e.g.
    // toggling "Custom") — a ResizeObserver keeps the popover repositioned
    // (flipping above the trigger, clamping horizontally) as that happens,
    // rather than only on mount/scroll/resize.
    let ro: ResizeObserver | undefined;
    if (popoverRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => compute());
      ro.observe(popoverRef.current);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      ro?.disconnect();
    };
  }, [anchorRef, popoverRef, active, align]);

  return style;
}

/** Outside-pointerdown close, same contract as `Select`'s dismiss behavior. */
/**
 * `extraRef` covers content that isn't a DOM descendant of the trigger
 * wrapper `ref` returns — e.g. a popover portalled elsewhere in the tree
 * (`createPortal`). Without it, any pointerdown inside a portalled popover
 * reads as "outside" and closes it on the very first interaction (a click
 * into an input, a drag-select) since `ref.current.contains(...)` can
 * never be true for a node that isn't actually inside `ref`.
 */
export function useOutsideClose<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  extraRef?: RefObject<HTMLElement>
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (extraRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose, extraRef]);
  return ref;
}

const POPOVER_TRANSITION = { duration: 0.16, ease: EASE };

/**
 * `.obligo-root` is the theme-token scope (`--text`, `--ink`, `--overlay`, …)
 * and — unlike the `<article>` reading pane, which sets `backdrop-filter` —
 * has no transform/filter/backdrop-filter of its own, so it isn't a
 * containing block for `position: fixed` descendants. Portalling here (not
 * `document.body`) keeps `position: fixed` genuinely viewport-relative
 * while keeping every CSS variable the popover renders with in scope.
 */
export function getPortalRoot(): Element {
  return document.querySelector('.obligo-root') ?? document.body;
}

/* ------------------------------- toolbar ui ------------------------------- */

function ToolbarButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 7,
        border: 'none',
        cursor: 'pointer',
        color: active ? 'var(--text-strong)' : 'var(--text-muted)',
        background: active ? 'rgb(var(--ink) / 0.09)' : 'transparent',
        transition: 'background-color .14s ease, color .14s ease',
      }}
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 16,
        background: 'rgb(var(--ink) / 0.1)',
        flex: 'none',
      }}
    />
  );
}

function ToolbarPopoverMenu({
  icon,
  label,
  items,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  items: { label: string; value: string }[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));
  const popoverRef = useRef<HTMLUListElement>(null);
  const position = usePopoverPosition(ref, popoverRef, open, 'left');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ToolbarButton
        icon={icon}
        label={label}
        active={open}
        onClick={() => setOpen((o) => !o)}
      />
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={popoverRef}
              role="menu"
              aria-label={label}
              className="obligo-menu"
              style={{
                margin: 0,
                listStyle: 'none',
                minWidth: 140,
                zIndex: 70,
                ...position,
              }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={POPOVER_TRANSITION}
            >
              {items.map((it) => (
                <li key={it.value}>
                  <button
                    type="button"
                    className="obligo-option"
                    style={{ width: '100%' }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect(it.value);
                      setOpen(false);
                    }}
                  >
                    {it.label}
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>,
        getPortalRoot()
      )}
    </div>
  );
}

const COLOR_SWATCHES = [
  { label: 'Default', value: 'inherit' },
  { label: 'Gold', value: '#B8912B' },
  { label: 'Coral', value: '#C0604A' },
  { label: 'Blue', value: '#3C6E9E' },
  { label: 'Green', value: '#4C7F5E' },
  { label: 'Muted', value: '#8A8A8A' },
];

function ColorPopoverButton({
  onSelect,
}: {
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));
  const popoverRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(ref, popoverRef, open, 'left');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ToolbarButton
        icon={
          <span
            aria-hidden
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #B8912B, #3C6E9E)',
            }}
          />
        }
        label="Text color"
        active={open}
        onClick={() => setOpen((o) => !o)}
      />
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              role="menu"
              aria-label="Text color"
              className="obligo-menu"
              style={{
                display: 'flex',
                gap: 6,
                padding: 8,
                width: 'max-content',
                zIndex: 70,
                ...position,
              }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={POPOVER_TRANSITION}
            >
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={c.label}
                  title={c.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(c.value);
                    setOpen(false);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    border:
                      c.value === 'inherit'
                        ? '1px solid rgb(var(--ink) / 0.25)'
                        : '1px solid rgba(0,0,0,0.1)',
                    background:
                      c.value === 'inherit'
                        ? 'var(--text-secondary)'
                        : c.value,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        getPortalRoot()
      )}
    </div>
  );
}

/* --------------------------------- link ---------------------------------- */

const LINK_FIELD_STYLE: CSSProperties = {
  width: '100%',
  font: '400 12px Inter, sans-serif',
  color: 'var(--text)',
  background: 'transparent',
  border: '1px solid rgb(var(--ink) / 0.14)',
  borderRadius: 6,
  padding: '6px 8px',
};

/**
 * Rendered as its own component (mounted only while `open`) rather than
 * inline inside `LinkButton` — `AnimatePresence` needs a real element with
 * stable identity as its direct child to track enter/exit; handing it
 * `createPortal(...)` directly (a Portal object, not a plain element) makes
 * it silently render nothing. Same shape as `SchedulePopover` below, which
 * is why that one already worked.
 */
function LinkDialog({
  anchorRef,
  popoverRef,
  text,
  url,
  onTextChange,
  onUrlChange,
  onCancel,
  onApply,
}: {
  anchorRef: RefObject<HTMLElement>;
  /** Owned by `LinkButton` (not created here) so its outside-click
   * detection can recognize this portalled popover as "inside" too. */
  popoverRef: RefObject<HTMLDivElement>;
  text: string;
  url: string;
  onTextChange: (v: string) => void;
  onUrlChange: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const position = usePopoverPosition(anchorRef, popoverRef);

  return createPortal(
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-label="Insert link"
      className="obligo-menu"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        // `.obligo-menu`'s own `min-width: 100%` is written for its usual
        // absolute-inside-a-trigger use — resolved against the trigger's
        // own width there, but against the *viewport* for a portalled,
        // fixed-position popover like this one. Without an explicit
        // min-width here to override it, the dialog stretches to fill
        // nearly the full screen instead of staying a compact control.
        width: 240,
        minWidth: 240,
        maxWidth: 'calc(100vw - 16px)',
        zIndex: 70,
        ...position,
      }}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={POPOVER_TRANSITION}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            font: '500 10px Inter, sans-serif',
            color: 'var(--text-faint)',
          }}
        >
          Link text
        </span>
        <input
          autoFocus
          value={text}
          placeholder="View scholarship details"
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply();
            if (e.key === 'Escape') onCancel();
          }}
          style={LINK_FIELD_STYLE}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            font: '500 10px Inter, sans-serif',
            color: 'var(--text-faint)',
          }}
        >
          URL
        </span>
        <input
          value={url}
          placeholder="https://example.com"
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply();
            if (e.key === 'Escape') onCancel();
          }}
          style={LINK_FIELD_STYLE}
        />
      </label>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 2,
        }}
      >
        <button
          type="button"
          className="obligo-btn obligo-btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="obligo-btn obligo-btn--primary"
          disabled={!url.trim()}
          onClick={onApply}
        >
          Add link
        </button>
      </div>
    </motion.div>,
    getPortalRoot()
  );
}

/**
 * Link text and URL are independent inputs, not one field doing double
 * duty — the resulting anchor's visible text is whatever the user typed
 * into "Link text" (falling back to the URL only if they left it blank),
 * never the raw href. Built via `insertHTML` rather than
 * `execCommand('createLink')` so the visible text can differ from the
 * selection it replaces (or be inserted fresh when nothing was selected).
 */
function LinkButton({
  editorRef,
  onApplied,
}: {
  editorRef: React.RefObject<HTMLDivElement>;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const savedRange = useRef<Range | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const ref = useOutsideClose<HTMLDivElement>(
    open,
    () => setOpen(false),
    popoverRef
  );

  const openPopover = () => {
    const sel = window.getSelection();
    let selectedText = '';
    if (
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current?.contains(sel.anchorNode)
    ) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
      selectedText = sel.toString();
    } else {
      savedRange.current = null;
    }
    setText(selectedText);
    setUrl('');
    setOpen(true);
  };

  const apply = () => {
    const href = normalizeUrl(url);
    if (!href) return;
    const editor = editorRef.current;
    if (!editor) return;
    const label = text.trim() || href;
    editor.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      // No prior selection inside the editor (the toolbar button was
      // clicked without ever placing a caret there) — `.focus()` alone
      // doesn't reliably leave a usable Range behind across browsers, and
      // `execCommand('insertHTML')` silently no-ops without one. Fall back
      // to a caret collapsed at the end of the content, a sensible default
      // insertion point.
      const range =
        savedRange.current ??
        (() => {
          const r = document.createRange();
          r.selectNodeContents(editor);
          r.collapse(false);
          return r;
        })();
      sel.addRange(range);
    }
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${escapeHtml(href)}" title="${escapeHtml(LINK_HINT_TEXT)}">${escapeHtml(label)}</a>`
    );
    onApplied();
    setOpen(false);
    setText('');
    setUrl('');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <ToolbarButton
        icon={<Link2 size={14} strokeWidth={2} aria-hidden />}
        label="Insert link"
        active={open}
        onClick={openPopover}
      />
      <AnimatePresence>
        {open && (
          <LinkDialog
            anchorRef={ref}
            popoverRef={popoverRef}
            text={text}
            url={url}
            onTextChange={setText}
            onUrlChange={setUrl}
            onCancel={() => setOpen(false)}
            onApply={apply}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ analog clock ------------------------------ */

const CLOCK_SIZE = 176;
const CLOCK_CENTER = CLOCK_SIZE / 2;
const CLOCK_RADIUS = 70;

/** Angle (degrees, clockwise from 12 o'clock) from the clock's center to a
 * pointer event's client position. */
function angleFromCenter(clientX: number, clientY: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * A functional analog face, not a decorative clock icon — dragging or
 * clicking anywhere on the ring moves whichever hand is active (hour or
 * minute, switched via the digital readout), and releasing after setting
 * the hour hands off to the minute so picking a full time is one
 * continuous gesture.
 */
function AnalogClock({
  hour12,
  minute,
  meridiem,
  onHourChange,
  onMinuteChange,
  onMeridiemChange,
}: {
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
  onMeridiemChange: (meridiem: 'AM' | 'PM') => void;
}) {
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [dragging, setDragging] = useState(false);
  const faceRef = useRef<SVGSVGElement>(null);
  // True once the pointer has actually moved during the current gesture —
  // a plain click (down+up, no movement) still gets an eased sweep to the
  // new value; a real drag tracks the pointer with zero added lag so the
  // gesture stays precise while your finger/cursor is still moving.
  const movedRef = useRef(false);

  const updateFromPoint = (clientX: number, clientY: number) => {
    const rect = faceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const angle = angleFromCenter(clientX, clientY, rect);
    if (mode === 'hour') {
      const raw = Math.round(angle / 30) % 12;
      onHourChange(raw === 0 ? 12 : raw);
    } else {
      onMinuteChange(Math.round(angle / 6) % 60);
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    movedRef.current = false;
    updateFromPoint(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    movedRef.current = true;
    updateFromPoint(e.clientX, e.clientY);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    movedRef.current = false;
    if (mode === 'hour') setMode('minute');
  };

  const angle =
    mode === 'hour' ? ((hour12 % 12) / 12) * 360 : (minute / 60) * 360;
  const handLength =
    mode === 'hour' ? CLOCK_RADIUS * 0.52 : CLOCK_RADIUS * 0.82;
  const knobRadius = CLOCK_RADIUS - 2;

  // Rotating a fixed-length hand via `transform` (instead of recomputing
  // x2/y2 from trig on every render) is what makes the sweep animatable at
  // all — CSS can smoothly transition a `rotate()`, but browsers won't
  // interpolate a `<line>`'s raw coordinate attributes. The angle is kept
  // as an unbounded running total (not clamped to 0-360) and nudged by the
  // shortest signed delta each time the target changes, so going from
  // "11" to "12" sweeps forward 30° instead of spinning almost a full
  // circle backwards to reach the equivalent 0°.
  const [displayAngle, setDisplayAngle] = useState(angle);
  const prevAngleRef = useRef(angle);
  useEffect(() => {
    const currentMod = ((prevAngleRef.current % 360) + 360) % 360;
    let delta = angle - currentMod;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    const next = prevAngleRef.current + delta;
    prevAngleRef.current = next;
    setDisplayAngle(next);
  }, [angle]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* digital readout — HH/MM independently select which ring the drag
          gesture edits; AM/PM is its own explicit toggle. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          className="obligo-mono"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 2,
            font: '500 22px "JetBrains Mono", monospace',
          }}
        >
          <button
            type="button"
            onClick={() => setMode('hour')}
            aria-pressed={mode === 'hour'}
            style={{
              border: 'none',
              background:
                mode === 'hour' ? 'rgb(var(--gold-2) / 0.14)' : 'transparent',
              borderRadius: 6,
              padding: '2px 5px',
              cursor: 'pointer',
              color: mode === 'hour' ? 'var(--gold-ink)' : 'var(--text-strong)',
              font: 'inherit',
            }}
          >
            {pad2(hour12)}
          </button>
          <span style={{ color: 'var(--text-faint)' }}>:</span>
          <button
            type="button"
            onClick={() => setMode('minute')}
            aria-pressed={mode === 'minute'}
            style={{
              border: 'none',
              background:
                mode === 'minute' ? 'rgb(var(--gold-2) / 0.14)' : 'transparent',
              borderRadius: 6,
              padding: '2px 5px',
              cursor: 'pointer',
              color:
                mode === 'minute' ? 'var(--gold-ink)' : 'var(--text-strong)',
              font: 'inherit',
            }}
          >
            {pad2(minute)}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(['AM', 'PM'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={meridiem === m}
              onClick={() => onMeridiemChange(m)}
              style={{
                border: '1px solid rgb(var(--ink) / 0.14)',
                background: meridiem === m ? 'var(--gold-ink)' : 'transparent',
                color: meridiem === m ? 'var(--paper)' : 'var(--text-muted)',
                borderRadius: 5,
                width: 26,
                font: '600 9.5px Inter, sans-serif',
                padding: '2px 0',
                cursor: 'pointer',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={faceRef}
        width={CLOCK_SIZE}
        height={CLOCK_SIZE}
        viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
        role="slider"
        aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
        aria-valuenow={mode === 'hour' ? hour12 : minute}
        aria-valuemin={mode === 'hour' ? 1 : 0}
        aria-valuemax={mode === 'hour' ? 12 : 59}
        style={{
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'pointer',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <circle
          cx={CLOCK_CENTER}
          cy={CLOCK_CENTER}
          r={CLOCK_RADIUS}
          fill="rgb(var(--ink) / 0.03)"
          stroke="rgb(var(--ink) / 0.12)"
          strokeWidth={1}
        />
        {Array.from({ length: 12 }, (_, i) => {
          const n = i === 0 ? 12 : i;
          const a = (i / 12) * 2 * Math.PI;
          const x = CLOCK_CENTER + Math.sin(a) * (CLOCK_RADIUS - 16);
          const y = CLOCK_CENTER - Math.cos(a) * (CLOCK_RADIUS - 16);
          const active = mode === 'hour' && n === hour12;
          return (
            <text
              key={n}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontFamily="Inter, sans-serif"
              fontWeight={active ? 700 : 500}
              fill={active ? 'var(--gold-ink)' : 'var(--text-muted)'}
              style={{ pointerEvents: 'none' }}
            >
              {n}
            </text>
          );
        })}
        <g
          style={{
            transform: `rotate(${displayAngle}deg)`,
            transformOrigin: `${CLOCK_CENTER}px ${CLOCK_CENTER}px`,
            transition: movedRef.current
              ? 'none'
              : 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
          }}
        >
          <line
            x1={CLOCK_CENTER}
            y1={CLOCK_CENTER}
            x2={CLOCK_CENTER}
            y2={CLOCK_CENTER - handLength}
            stroke="var(--gold-ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* The selected-time handle. Was r=9 (18px) — nearly as wide as the
              clock face's own hour numerals and a full 3x the center pivot
              dot below, which read as a lollipop rather than a clock hand.
              Same position, same rotation, same fill — only the radius
              changes, down to a size that still reads clearly as "the
              selected point" without dominating the hand it sits on. */}
          <circle
            cx={CLOCK_CENTER}
            cy={CLOCK_CENTER - knobRadius}
            r={5}
            fill="var(--gold-ink)"
          />
        </g>
        <circle
          cx={CLOCK_CENTER}
          cy={CLOCK_CENTER}
          r={3}
          fill="var(--gold-ink)"
          style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  );
}

/* -------------------------------- date wheel ------------------------------- */

const WHEEL_ITEM_H = 30;
const WHEEL_VISIBLE = 3;
const WHEEL_HEIGHT = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = (WHEEL_HEIGHT - WHEEL_ITEM_H) / 2;
const WHEEL_STEP_BTN_H = 16;
const WHEEL_STEP_GAP = 2;
// Vertical offset from the stepped column's own top to where the wheel
// itself (and so its centered row) actually starts, once the up-stepper
// and its gap are stacked above it — the shared center band in `DateWheel`
// needs this to stay aligned with all three columns' middle row.
const WHEEL_STEP_OFFSET = WHEEL_STEP_BTN_H + WHEEL_STEP_GAP;

/** One scroll-snapped column (day, month or year). Wheel/trackpad and touch
 * scrolling work for free via native `overflow-y` + `scroll-snap-type`;
 * mouse click-drag is added on top via pointer events so a plain mouse can
 * drag the column the same way touch does. */
function WheelColumn({
  labels,
  selectedIndex,
  onSelect,
  minWidth = 44,
  isDisabled,
}: {
  labels: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  minWidth?: number;
  /** e.g. a past day/month — dimmed, inert to clicks, and scroll-settle
   * refuses to commit onto it (the sync effect below then eases the
   * column back to the last valid value instead). */
  isDisabled?: (index: number) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef<{
    startY: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the column visually synced when the selection changes from outside
  // (e.g. day count shrinking when the month changes).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * WHEEL_ITEM_H;
    if (Math.abs(el.scrollTop - target) > 1)
      el.scrollTo({ top: target, behavior: 'smooth' });
  }, [selectedIndex, labels.length]);

  const commitFromScroll = () => {
    const el = ref.current;
    if (!el) return;
    const index = Math.max(
      0,
      Math.min(labels.length - 1, Math.round(el.scrollTop / WHEEL_ITEM_H))
    );
    if (isDisabled?.(index)) return; // sync effect eases back to the last valid index
    if (index !== selectedIndex) onSelect(index);
  };

  const onScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(commitFromScroll, 110);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return; // touch/pen keep native scrolling
    const el = ref.current;
    if (!el) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // `scroll-behavior: smooth` (set below) is what gives the snap-to-value
    // settle its native-picker ease — but applied to a raw mouse drag it
    // would lag the cursor instead of tracking it 1:1. Drop to instant
    // scrolling only while a drag is actually in progress.
    el.style.scrollBehavior = 'auto';
    dragging.current = {
      startY: e.clientY,
      startScroll: el.scrollTop,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    const el = ref.current;
    if (!drag || !el) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 2) drag.moved = true;
    el.scrollTop = drag.startScroll - dy;
  };
  const endPointerDrag = () => {
    const el = ref.current;
    if (el) el.style.scrollBehavior = '';
    dragging.current = null;
    commitFromScroll();
  };

  return (
    <div
      ref={ref}
      className="obligo-wheel-col"
      role="listbox"
      aria-label="Select value"
      onScroll={onScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
      style={{
        minWidth,
        height: WHEEL_HEIGHT,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        scrollBehavior: 'smooth',
        touchAction: 'pan-y',
        cursor: 'grab',
        borderRadius: 8,
        background: 'rgb(var(--ink) / 0.025)',
        border: '1px solid rgb(var(--ink) / 0.08)',
      }}
    >
      <div style={{ height: WHEEL_PAD }} aria-hidden />
      {labels.map((label, i) => {
        const active = i === selectedIndex;
        const disabled = isDisabled?.(i) ?? false;
        return (
          <div
            key={`${label}-${i}`}
            role="option"
            aria-selected={active}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (dragging.current?.moved) return;
              if (disabled) return;
              onSelect(i);
            }}
            style={{
              height: WHEEL_ITEM_H,
              scrollSnapAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: active
                ? '600 13px Inter, sans-serif'
                : '400 12.5px Inter, sans-serif',
              color: active
                ? 'var(--gold-ink)'
                : disabled
                  ? 'rgb(var(--ink) / 0.16)'
                  : 'var(--text-faint)',
              opacity: active ? 1 : disabled ? 0.5 : 0.75,
              cursor: disabled ? 'not-allowed' : undefined,
              transition: 'color .12s ease, opacity .12s ease',
              userSelect: 'none',
            }}
          >
            {label}
          </div>
        );
      })}
      <div style={{ height: WHEEL_PAD }} aria-hidden />
    </div>
  );
}

function WheelStepButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'up' | 'down';
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = direction === 'up' ? ChevronUp : ChevronDown;
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={direction === 'up' ? 'Previous value' : 'Next value'}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: WHEEL_STEP_BTN_H,
        borderRadius: 5,
        border: 'none',
        background: disabled
          ? 'transparent'
          : hover
            ? 'rgb(var(--gold-2) / 0.16)'
            : 'rgb(var(--ink) / 0.05)',
        color: disabled
          ? 'rgb(var(--ink) / 0.14)'
          : hover
            ? 'var(--gold-ink)'
            : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'color .12s ease, background-color .12s ease',
      }}
    >
      <Icon size={13} strokeWidth={2.5} aria-hidden />
    </button>
  );
}

/**
 * `WheelColumn` plus a subtle one-step up/down control pair — the wheel's
 * own scroll/drag/tap-to-select interaction is untouched, this just gives a
 * precise, discrete alternative for nudging by exactly one day/month/year
 * without a scroll gesture, closer to a native picker's stepper.
 */
function SteppedWheelColumn(props: {
  labels: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  minWidth?: number;
  isDisabled?: (index: number) => boolean;
}) {
  const { labels, selectedIndex, onSelect, isDisabled } = props;
  const prevIndex = selectedIndex - 1;
  const nextIndex = selectedIndex + 1;
  const canStepUp = prevIndex >= 0 && !(isDisabled?.(prevIndex) ?? false);
  const canStepDown =
    nextIndex <= labels.length - 1 && !(isDisabled?.(nextIndex) ?? false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: WHEEL_STEP_GAP,
      }}
    >
      <WheelStepButton
        direction="up"
        disabled={!canStepUp}
        onClick={() => onSelect(prevIndex)}
      />
      <WheelColumn {...props} />
      <WheelStepButton
        direction="down"
        disabled={!canStepDown}
        onClick={() => onSelect(nextIndex)}
      />
    </div>
  );
}

/** Day/month/year selected independently — changing the month re-derives
 * the day column's length (and clamps a now-invalid day) without touching
 * year, and vice versa. */
function DateWheel({
  year,
  month,
  day,
  onChange,
  today,
}: {
  year: number;
  month: number;
  day: number;
  onChange: (next: { year?: number; month?: number; day?: number }) => void;
  /** Reference "now" for disabling past months/days — passed down rather
   * than read fresh here so the whole popover judges "past" against the
   * same instant, and so a live-ticking clock in the parent (see
   * `SchedulePopover`) actually reaches this far to keep it current while
   * the popover sits open. */
  today: Date;
}) {
  const yearStart = today.getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => yearStart + i);
  const dayCount = daysInMonth(year, month);
  const days = Array.from({ length: dayCount }, (_, i) => String(i + 1));

  const isPastMonth = (monthIndex: number) => {
    if (year < today.getFullYear()) return true;
    if (year > today.getFullYear()) return false;
    return monthIndex < today.getMonth();
  };
  const isPastDay = (dayNum: number) => {
    if (year < today.getFullYear()) return true;
    if (year > today.getFullYear()) return false;
    if (month < today.getMonth()) return true;
    if (month > today.getMonth()) return false;
    return dayNum < today.getDate();
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {/* Center band marking the "selected" row across all three columns —
          offset down by the up-stepper's own height now that one sits above
          each wheel, so it still lines up with the middle (selected) row
          rather than the stepper button. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: WHEEL_STEP_OFFSET + WHEEL_PAD,
          height: WHEEL_ITEM_H,
          borderRadius: 6,
          background:
            'linear-gradient(90deg, rgb(var(--gold-2) / 0.1), rgb(var(--gold-2) / 0.03))',
          border: '1px solid rgb(var(--gold-2) / 0.2)',
          pointerEvents: 'none',
        }}
      />
      <SteppedWheelColumn
        labels={MONTH_LABELS}
        selectedIndex={month}
        onSelect={(i) => onChange({ month: i })}
        minWidth={52}
        isDisabled={isPastMonth}
      />
      <SteppedWheelColumn
        labels={days}
        selectedIndex={day - 1}
        onSelect={(i) => onChange({ day: i + 1 })}
        minWidth={40}
        isDisabled={(i) => isPastDay(i + 1)}
      />
      <SteppedWheelColumn
        labels={years.map(String)}
        selectedIndex={Math.max(0, years.indexOf(year))}
        onSelect={(i) => onChange({ year: years[i] })}
        minWidth={56}
      />
    </div>
  );
}

/* ------------------------------ schedule ui ------------------------------ */

function SchedulePopover({
  anchorRef,
  initialDate,
  onCancel,
  onSchedule,
}: {
  anchorRef: RefObject<HTMLElement>;
  initialDate?: Date | null;
  onCancel: () => void;
  onSchedule: (date: Date) => void;
}) {
  const base = initialDate ?? new Date();
  const [customOpen, setCustomOpen] = useState(false);
  const [year, setYear] = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth());
  const [day, setDay] = useState(base.getDate());
  const [hour12, setHour12] = useState(() => ((base.getHours() + 11) % 12) + 1);
  const [minute, setMinute] = useState(base.getMinutes());
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(
    base.getHours() >= 12 ? 'PM' : 'AM'
  );
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const popoverRef = useRef<HTMLDivElement>(null);
  const position = usePopoverPosition(anchorRef, popoverRef);

  // "Now" the whole popover judges past-vs-future against — re-read every
  // 15s so a selection that was valid when picked (e.g. "today, 4:00 PM")
  // gets caught and disabled if the clock ticks past it while this stays
  // open, rather than only being checked once at mount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const presets = SCHEDULE_PRESETS;

  // Keep the day valid whenever month/year changes make the current one
  // impossible (e.g. sitting on the 31st and switching to April).
  const maxDay = daysInMonth(year, month);
  const clampedDay = Math.min(day, maxDay);

  const customDate = new Date(
    year,
    month,
    clampedDay,
    (hour12 % 12) + (meridiem === 'PM' ? 12 : 0),
    minute
  );
  // Strictly after "now" — a time equal to the current minute is already
  // in the past by the time the send would actually fire.
  const customInPast = customDate.getTime() <= now.getTime();

  const applyDateWheel = (next: {
    year?: number;
    month?: number;
    day?: number;
  }) => {
    if (next.year !== undefined) setYear(next.year);
    if (next.month !== undefined) setMonth(next.month);
    if (next.day !== undefined) setDay(next.day);
  };

  const commitCustomSchedule = () => {
    // Second line of defense: re-check against a fresh timestamp (not the
    // possibly-15s-stale `now`) rather than trusting the disabled state of
    // the button alone.
    if (customDate.getTime() <= Date.now()) return;
    onSchedule(customDate);
  };

  return createPortal(
    <motion.div
      ref={popoverRef}
      role="dialog"
      aria-label="Schedule send"
      className="obligo-menu"
      style={{
        width: customOpen ? 320 : 260,
        minWidth: 260,
        padding: 14,
        zIndex: 70,
        ...position,
      }}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={POPOVER_TRANSITION}
    >
      <div
        style={{
          font: '500 12px Inter, sans-serif',
          color: 'var(--text-strong)',
          marginBottom: 8,
        }}
      >
        Schedule send
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginBottom: customOpen ? 10 : 0,
        }}
      >
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className="obligo-option"
            style={{ width: '100%' }}
            onClick={() => onSchedule(computePresetDate(p.key, new Date()))}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="obligo-option"
          aria-pressed={customOpen}
          data-selected={customOpen ? 'true' : undefined}
          style={{ width: '100%' }}
          onClick={() => setCustomOpen((o) => !o)}
        >
          Custom
          <ChevronDown
            size={12}
            strokeWidth={2}
            aria-hidden
            style={{
              marginLeft: 'auto',
              transform: customOpen ? 'rotate(180deg)' : undefined,
              transition: 'transform .16s ease',
            }}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {customOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                borderTop: '1px solid rgb(var(--ink) / 0.08)',
                paddingTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <AnalogClock
                hour12={hour12}
                minute={minute}
                meridiem={meridiem}
                onHourChange={setHour12}
                onMinuteChange={setMinute}
                onMeridiemChange={setMeridiem}
              />
              <DateWheel
                year={year}
                month={month}
                day={clampedDay}
                onChange={applyDateWheel}
                today={now}
              />

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  padding: '9px 11px',
                  borderRadius: 9,
                  background: 'rgb(var(--ink) / 0.03)',
                  border: '1px solid rgb(var(--ink) / 0.08)',
                }}
              >
                <span
                  className="obligo-eyebrow"
                  style={{ color: 'var(--text-faint)' }}
                >
                  Schedule for
                </span>
                <span
                  style={{
                    font: '500 13px Inter, sans-serif',
                    color: 'var(--text-strong)',
                  }}
                >
                  {customDate.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span
                  style={{
                    font: '500 13px Inter, sans-serif',
                    color: 'var(--gold-ink)',
                  }}
                >
                  {customDate.toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <span
                  style={{
                    font: '400 10px Inter, sans-serif',
                    color: 'var(--text-faint)',
                    marginTop: 3,
                  }}
                >
                  {tz}
                </span>
              </div>

              {customInPast && (
                <span
                  style={{
                    font: '400 11px Inter, sans-serif',
                    color: 'rgb(var(--coral) / 0.9)',
                  }}
                >
                  Pick a time in the future — that moment has already passed.
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          className="obligo-btn obligo-btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        {customOpen && (
          <button
            type="button"
            className="obligo-btn obligo-btn--primary"
            disabled={customInPast}
            onClick={commitCustomSchedule}
          >
            Schedule send
          </button>
        )}
      </div>
    </motion.div>,
    getPortalRoot()
  );
}

/* ------------------------------ recipients -------------------------------- */

/** Compact chip field for To/Cc — preserves whatever recipients the thread
 * already carries when edit mode opens, and lets the user add or remove
 * from there. Typing a comma or pressing Enter commits the current draft
 * as a chip; Backspace on an empty draft pops the last one, same contract
 * most mail composers use. */
function RecipientField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim();
    if (v) onChange([...values, v]);
    setDraft('');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span
        style={{
          flex: 'none',
          width: 24,
          font: '500 11px Inter, sans-serif',
          color: 'var(--text-faint)',
          paddingTop: 7,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 5,
          padding: '4px 6px',
          borderRadius: 8,
          border: '1px solid rgb(var(--ink) / 0.14)',
        }}
      >
        {values.map((v) => (
          <span
            key={v}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              font: '400 11px Inter, sans-serif',
              color: 'var(--text-secondary)',
              background: 'rgb(var(--ink) / 0.06)',
              borderRadius: 999,
              padding: '3px 4px 3px 9px',
              maxWidth: '100%',
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
            >
              {v}
            </span>
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 14,
                height: 14,
                flex: 'none',
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-faint)',
                cursor: 'pointer',
              }}
            >
              <XIcon size={9} strokeWidth={2.5} aria-hidden />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(',')) {
              const trimmed = v.slice(0, -1).trim();
              if (trimmed) onChange([...values, trimmed]);
              setDraft('');
            } else {
              setDraft(v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={values.length ? '' : placeholder}
          style={{
            flex: 1,
            minWidth: 60,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            font: '400 11.5px Inter, sans-serif',
            color: 'var(--text)',
            padding: '3px 2px',
          }}
        />
      </div>
    </div>
  );
}

/* ---------------------------- discard prompt ------------------------------ */

/**
 * The header X's confirmation when there's unsaved reply content to lose —
 * same portal/overlay/focus-trap shell as `ConfirmDialog` (`primitives.tsx`)
 * and `Dialog` (`Dialog.tsx`), reimplemented locally rather than imported:
 * `Dialog.tsx` itself imports `getPortalRoot` from THIS file, so importing
 * `Dialog` back here would be a circular module dependency. Three choices
 * instead of two is the only real difference from `ConfirmDialog`.
 */
function DiscardPromptPortal({
  title,
  canSaveDraft,
  saving,
  error,
  onCancel,
  onSaveDraft,
  onDiscard,
}: {
  title: string;
  canSaveDraft: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSaveDraft: () => void;
  onDiscard: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;

  // Same three properties `ConfirmDialogPortal` establishes: Escape
  // dismisses, focus lands inside on open and returns to the trigger on
  // close, Tab cycles inside rather than leaking to the composer behind it.
  // Initial focus on Cancel — the least consequential of the three choices.
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
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,.45)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          maxWidth: 'calc(100vw - 32px)',
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
          style={{
            font: '400 12.5px/1.6 Inter, sans-serif',
            color: 'var(--text-secondary)',
            margin: '10px 0 0',
          }}
        >
          You have unsaved changes.
        </p>
        {error && (
          <p
            style={{
              font: '400 11.5px/1.4 Inter, sans-serif',
              color: 'rgb(var(--coral) / 0.85)',
              margin: '10px 0 0',
            }}
          >
            {error}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 20,
          }}
        >
          <button
            ref={cancelRef}
            type="button"
            className="obligo-btn obligo-btn--ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="obligo-btn obligo-btn--outline"
            onClick={onDiscard}
            disabled={saving}
          >
            Yes, discard
          </button>
          {canSaveDraft && (
            <button
              type="button"
              className="obligo-btn obligo-btn--primary"
              onClick={onSaveDraft}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save as draft'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    getPortalRoot()
  );
}

/* -------------------------------- composer -------------------------------- */

export function ReplyComposer({
  initialDraft,
  initialTo = [],
  initialCc = [],
  initialAttachments,
  eyebrow = 'Obligo suggested reply',
  sendLabel = 'Send',
  onDiscard,
  onSend,
  onSchedule,
  onSaveDraft,
}: {
  initialDraft: string;
  /** Recipients the thread already carries when the composer mounts — edit
   * mode starts from these rather than blank fields, so opening Edit never
   * loses who the reply was already addressed to. */
  initialTo?: string[];
  initialCc?: string[];
  /** Files already attached to a resumed draft. */
  initialAttachments?: Attachment[];
  /** Label on the small eyebrow row up top — lets the same composer read as
   * either "Obligo suggested reply" (AI draft) or "Reply" (manual, blank)
   * depending on which flow mounted it, without forking the component. */
  eyebrow?: string;
  /** Label on the primary send button — e.g. "Approve & send" for an
   * approval-review composer, where sending *is* the approval action. */
  sendLabel?: string;
  /** When provided, renders a small close control next to the eyebrow that
   * calls this instead of just resetting internal edit state — the caller
   * (e.g. `ThreadView`) uses it to collapse the composer back to its own
   * idle state entirely. Omitted when the composer has nowhere to collapse
   * to (no callers currently need that, but it keeps this optional rather
   * than assumed). */
  onDiscard?: () => void;
  /** Called the moment the composer transitions to `sent`, with the final
   * HTML content — lets the caller record the outgoing message (e.g. into
   * the Sent view) without the composer itself owning that business logic. */
  onSend?: (payload: ComposerPayload) => void;
  /** Called the moment the composer transitions to `scheduled`, with the
   * chosen send date and the final HTML content — lets the caller record it
   * (e.g. into the Scheduled view). */
  onSchedule?: (date: Date, payload: ComposerPayload) => void;
  /** Persist what's currently in the composer without sending it. */
  onSaveDraft?: (payload: ComposerPayload) => void;
}) {
  // A blank manual reply has nothing to preview — start it straight in
  // editing mode so the user can begin typing immediately instead of
  // clicking Edit on an empty box first. A seeded AI draft still opens on
  // its read-only preview, same as before.
  const [status, setStatus] = useState<ComposerStatus>(
    initialDraft.trim() ? 'preview' : 'editing'
  );
  const [content, setContent] = useState(() => draftToHtml(initialDraft));
  const [editSession, setEditSession] = useState(0);
  const [preEditContent, setPreEditContent] = useState(content);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>(
    initialAttachments ?? []
  );
  const [to, setTo] = useState<string[]>(initialTo);
  const [cc, setCc] = useState<string[]>(initialCc);
  const [preEditTo, setPreEditTo] = useState(to);
  const [preEditCc, setPreEditCc] = useState(cc);
  // Whether Ctrl/Cmd is currently held — swaps the editor's link cursor from
  // the default text caret to a pointer, the same "you can click this now"
  // signal a real link gives, without weakening the click-to-edit default.
  const [linkModifierHeld, setLinkModifierHeld] = useState(false);
  /** When this reply was last saved as a draft, if it has been — drives the
   * small confirmation beside the eyebrow so saving is visibly acknowledged
   * rather than silently swallowed. */
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  /**
   * What's currently PERSISTED as this thread's draft — the baseline the
   * header X's "is there anything to lose" check diffs the live composer
   * state against. Starts at the props the composer mounted with (a resumed
   * draft's own saved content, or blank for a fresh reply), and only moves
   * forward when a save actually succeeds — never on every keystroke, or a
   * save would erase its own reason to exist. Kept separate from
   * `draftSavedAt` (a display timestamp) because the diff needs the actual
   * last-saved values, not just the fact that a save once happened.
   */
  const [savedBaseline, setSavedBaseline] = useState(() => ({
    content: draftToHtml(initialDraft),
    to: initialTo,
    cc: initialCc,
    attachments: initialAttachments ?? [],
  }));
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [savingDraftFromPrompt, setSavingDraftFromPrompt] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);

  useEffect(() => {
    const isLinkModifier = (e: KeyboardEvent) =>
      e.key === 'Control' || e.key === 'Meta';
    const onKeyDown = (e: KeyboardEvent) => {
      if (isLinkModifier(e)) setLinkModifierHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isLinkModifier(e)) setLinkModifierHeld(false);
    };
    // A window/tab switch (Cmd+Tab, Alt+Tab) swallows the matching keyup —
    // without this, the cursor can get stuck armed until the next keypress.
    const onWindowBlur = () => setLinkModifierHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const editorRef = useRef<HTMLDivElement>(null);
  const sendMenuRef = useOutsideClose<HTMLDivElement>(sendMenuOpen, () =>
    setSendMenuOpen(false)
  );
  // Portalled + viewport-aware, same as every other popover in the app
  // (Select, LinkDialog, SchedulePopover, MessageMetaPopover) — this one used
  // to be `position: absolute` inside the composer's own scrollable column,
  // pinned permanently below the trigger. That meant a Send row anywhere near
  // the bottom of the reading pane pushed the menu past the visible/scrolled
  // area, invisible until the user scrolled the pane down to find it.
  const sendMenuPopoverRef = useRef<HTMLUListElement>(null);
  const sendMenuPosition = usePopoverPosition(
    sendMenuRef,
    sendMenuPopoverRef,
    sendMenuOpen,
    'right'
  );
  const editScheduleBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setPreEditContent(content);
    setPreEditTo(to);
    setPreEditCc(cc);
    setEditSession((n) => n + 1);
    setStatus('editing');
  };

  const saveEditing = () => {
    setContent(editorRef.current?.innerHTML ?? content);
    setStatus('preview');
  };

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    setContent(editorRef.current?.innerHTML ?? content);
    editorRef.current?.focus();
  };

  /**
   * Links inserted via `LinkButton` stay inert to a plain click — the
   * surface is for editing, not browsing, so an ordinary click just places
   * the caret like it would on any other text. Ctrl/Cmd+click is the one
   * escape hatch to actually verify where a link points, opened in a new
   * tab (`noopener,noreferrer`) rather than navigating the composer away.
   */
  const handleEditorLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Re-checked here, not only at insertion: `LinkButton` isn't the only
      // way an anchor can end up in this editable surface — pasting rich
      // text brings whatever `href` came with it, and this is the one line
      // that actually hands an href to the browser to execute.
      const href = normalizeUrl(anchor.getAttribute('href') ?? '');
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      // Same default-suppression a real editor gives a link: without this,
      // a plain click on the anchor would follow it and navigate away from
      // the reply the user is mid-editing.
      e.preventDefault();
    }
  };

  // A valid To entry is mandatory — Cc alone doesn't count, matching real
  // mail clients where Cc is a secondary/observer field, not a substitute
  // for an actual addressee. Checked again here, not just via the button's
  // `disabled` prop, so state manipulation that bypasses the UI (or a stale
  // click queued before the fields changed) still can't fire a send with
  // nobody actually addressed.
  const hasValidRecipient = to.some(isValidRecipient);

  /** The composer's live contents, in the shape every caller consumes.
   * `bcc` is carried through as an empty list: the data model supports it end
   * to end, this composer simply has no Bcc field yet, and inventing one is a
   * UI change rather than the correctness fix this is. */
  const currentPayload = (): ComposerPayload => ({
    recipients: { to, cc, bcc: [] },
    body: { text: stripHtml(content), html: undefined },
    attachments,
  });

  /**
   * Whether the header X has anything to confirm before closing. Reads the
   * actual composer state (`content`/`to`/`cc`/`attachments`), never rendered
   * DOM text — `stripHtml` parses `content` itself, the same canonical HTML
   * string that drives the editor, so whitespace-only markup (`<p><br></p>`,
   * an empty paragraph left behind by a delete-all) reads as blank exactly
   * like it would to a reader, not as "technically non-empty markup."
   *
   * Diffs against `savedBaseline`, not against "is everything empty" — a
   * RESUMED draft with real saved content is not itself unsaved just because
   * it's non-blank; only what changed SINCE the last save (or since mount,
   * for a fresh reply) counts. An already-sent or already-scheduled composer
   * has nothing left to lose either way, so the X just closes it.
   */
  const hasUnsavedContent =
    status !== 'sent' &&
    status !== 'scheduled' &&
    (stripHtml(content) !== stripHtml(savedBaseline.content) ||
      JSON.stringify(to) !== JSON.stringify(savedBaseline.to) ||
      JSON.stringify(cc) !== JSON.stringify(savedBaseline.cc) ||
      attachments.length !== savedBaseline.attachments.length ||
      attachments.some((a, i) => a !== savedBaseline.attachments[i]));

  const closeDiscardPrompt = () => {
    setDiscardPromptOpen(false);
    setDraftSaveError(null);
  };

  /**
   * What "close" actually means once there's nothing left to confirm.
   * Normally that's the caller's `onDiscard` — collapse/unmount the composer,
   * same as the header X always did. But the in-editor Cancel button is also
   * reachable in the one state where `onDiscard` is never provided (a
   * `defaultExpanded` resumed-draft composer, which has nowhere to collapse
   * to — see `onDiscard`'s own doc comment, and note the header X is simply
   * not rendered there, `{onDiscard && ...}` below). Cancel still needs to
   * do SOMETHING in that state, and the only coherent something is what it
   * always did before this file had a discard prompt at all: revert to
   * whatever was showing before this edit session started. Never reachable
   * from the header X — X only renders when `onDiscard` exists, so this
   * fallback branch is Cancel-only, without X and Cancel needing two
   * separate decision functions to get there.
   */
  const closeOrRevert = () => {
    if (onDiscard) {
      onDiscard();
      return;
    }
    setContent(preEditContent);
    setTo(preEditTo);
    setCc(preEditCc);
    setStatus('preview');
  };

  /**
   * THE ONE discard decision path — the header X and the in-editor Cancel
   * button both call this and nothing else. Whether confirmation is required
   * is decided from `hasUnsavedContent` (the actual current composer state),
   * never from which control was clicked or from `initialDraft`/edit-session
   * bookkeeping — that mismatch (checking the ORIGINAL draft instead of the
   * CURRENT one) was exactly what let Cancel silently discard freshly typed
   * content before this existed.
   */
  const handleDiscardClick = () => {
    if (hasUnsavedContent) {
      setDiscardPromptOpen(true);
    } else {
      closeOrRevert();
    }
  };

  const confirmDiscard = () => {
    setDiscardPromptOpen(false);
    setDraftSaveError(null);
    closeOrRevert();
  };

  /**
   * The prompt's own "Save as draft" — same upsert (`onSaveDraft` →
   * `mailActions.saveDraft`) the existing in-editor button already calls,
   * not a second draft mechanism. `mailActions.saveDraft` is currently a
   * synchronous, always-succeeding in-memory upsert with no failure path
   * (verified — there is nothing today that can make this `catch` fire), but
   * the guard stays: a caller-supplied `onSaveDraft` is not this composer's
   * to trust blindly, and the backend version of this call will genuinely be
   * able to fail.
   */
  const confirmSaveAsDraft = () => {
    if (!onSaveDraft) return;
    setDraftSaveError(null);
    setSavingDraftFromPrompt(true);
    try {
      const payload = currentPayload();
      onSaveDraft(payload);
      setSavedBaseline({
        content,
        to,
        cc,
        attachments,
      });
      setDraftSavedAt(new Date().toISOString());
      setSavingDraftFromPrompt(false);
      setDiscardPromptOpen(false);
      closeOrRevert();
    } catch {
      setSavingDraftFromPrompt(false);
      setDraftSaveError("Couldn't save the draft. Try again.");
      // Composer and prompt both stay open — the content is never touched,
      // and nothing here ever claims the draft saved when it didn't.
    }
  };

  const sendNow = () => {
    if (!hasValidRecipient) return;
    setSendMenuOpen(false);
    setScheduleOpen(false);
    setStatus('sent');
    onSend?.(currentPayload());
  };

  const applySchedule = (date: Date) => {
    if (!hasValidRecipient) return;
    setScheduledAt(date);
    setScheduleOpen(false);
    setSendMenuOpen(false);
    setStatus('scheduled');
    onSchedule?.(date, currentPayload());
  };

  const cancelSchedule = () => {
    setScheduledAt(null);
    setStatus('preview');
  };

  const backToEditingFromSchedule = () => {
    setScheduledAt(null);
    startEditing();
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Local until something uploads them — see `LocalAttachment`. Deduped by
    // the file's own identity so re-picking the same file twice is a no-op.
    const next = Array.from(files).map(localAttachmentFromFile);
    setAttachments((prev) => [
      ...prev,
      ...next.filter((n) => !prev.some((p) => p.id === n.id)),
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Only the label used by `ThreadView`'s manual-reply instance — cosmetic
  // (a neutral dot instead of the gold "Obligo" one), not a second component
  // fork.
  const isManual = eyebrow.trim().toLowerCase() === 'reply';

  // While actively editing, this card becomes a flex column that can grow
  // to fill whatever vertical space its parent gives it (see `ThreadView`,
  // which now shares that space with the original-email region) — the
  // editable body below is the one child that actually stretches into it.
  // Preview/sent/scheduled stay their natural, compact size; there's no
  // reason for a short read-only draft to stretch and leave a large empty
  // gap above Cancel/Send.
  const growWhileEditing = status === 'editing';

  return (
    <div
      style={{
        flex: growWhileEditing ? '1 1 auto' : 'none',
        minHeight: growWhileEditing ? 0 : undefined,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        background: 'var(--approve-band)',
        border: '1px solid var(--approve-border)',
        // A local fallback, not the primary scroll mechanism: on a tall
        // enough viewport this card simply fits (or the editor absorbs any
        // extra/short space via its own flex-grow/minHeight). Only on a
        // viewport too short for even the composer's own chrome (To/Cc,
        // toolbar, the editor's floor, Cancel/Save) plus the original-email
        // region above does this engage — scrolling within the composer
        // itself, right where the user is looking, instead of forcing them
        // to find the scroll on the shared region two levels up. Popovers
        // (Insert Link, Schedule send) are portalled to `.obligo-root`, so
        // they're never affected by this.
        overflowY: growWhileEditing ? 'auto' : 'visible',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-hidden
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '12px 16px 0',
        }}
      >
        {isManual ? (
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--text-faint)',
            }}
          />
        ) : (
          <GoldDot size={6} />
        )}
        <span
          className="obligo-eyebrow"
          style={{ color: isManual ? 'var(--text-faint)' : 'var(--gold-ink)' }}
        >
          {eyebrow}
        </span>
        {/* Saving a draft is otherwise invisible — the composer just returns
            to preview — which is the same "did that do anything?" ambiguity
            the button had when it did nothing at all. */}
        {draftSavedAt && (
          <span
            className="obligo-eyebrow"
            style={{ color: 'var(--text-faint)', marginLeft: 4 }}
          >
            · draft saved
          </span>
        )}
        {onDiscard && (
          <button
            type="button"
            aria-label={
              isManual ? 'Discard reply' : 'Collapse Obligo suggested reply'
            }
            className="obligo-icon-btn"
            onClick={handleDiscardClick}
            style={{
              marginLeft: 'auto',
              color: 'var(--text-faint)',
              padding: 3,
              margin: '-3px -3px -3px auto',
            }}
          >
            <XIcon size={13} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>

      <AnimatePresence>
        {discardPromptOpen && (
          <DiscardPromptPortal
            title={isManual ? 'Discard this reply?' : 'Discard this suggested reply?'}
            canSaveDraft={Boolean(onSaveDraft)}
            saving={savingDraftFromPrompt}
            error={draftSaveError}
            onCancel={closeDiscardPrompt}
            onSaveDraft={confirmSaveAsDraft}
            onDiscard={confirmDiscard}
          />
        )}
      </AnimatePresence>

      {/* ---- recipients (edit mode only) ---- */}
      {status === 'editing' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 16px 0',
          }}
        >
          <RecipientField
            label="To"
            values={to}
            onChange={setTo}
            placeholder="Add recipient"
          />
          <RecipientField
            label="Cc"
            values={cc}
            onChange={setCc}
            placeholder="Add Cc"
          />
          {!hasValidRecipient && (
            <span
              role="alert"
              style={{
                font: '400 11px Inter, sans-serif',
                color: 'rgb(var(--coral) / 0.95)',
                paddingLeft: 32,
              }}
            >
              Add at least one recipient.
            </span>
          )}
        </div>
      )}

      {/* ---- editing toolbar (progressive disclosure) ---- */}
      {status === 'editing' && (
        <div style={{ padding: '10px 16px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <ToolbarButton
              icon={<Bold size={14} strokeWidth={2.25} aria-hidden />}
              label="Bold"
              onClick={() => exec('bold')}
            />
            <ToolbarButton
              icon={<Italic size={14} strokeWidth={2} aria-hidden />}
              label="Italic"
              onClick={() => exec('italic')}
            />
            <ToolbarButton
              icon={<Underline size={14} strokeWidth={2} aria-hidden />}
              label="Underline"
              onClick={() => exec('underline')}
            />
            <ToolbarDivider />
            <ToolbarButton
              icon={<AlignLeft size={14} strokeWidth={2} aria-hidden />}
              label="Align left"
              onClick={() => exec('justifyLeft')}
            />
            <ToolbarButton
              icon={<AlignCenter size={14} strokeWidth={2} aria-hidden />}
              label="Align center"
              onClick={() => exec('justifyCenter')}
            />
            <ToolbarButton
              icon={<AlignRight size={14} strokeWidth={2} aria-hidden />}
              label="Align right"
              onClick={() => exec('justifyRight')}
            />
            <ToolbarDivider />
            <ToolbarButton
              icon={<List size={14} strokeWidth={2} aria-hidden />}
              label="Bulleted list"
              onClick={() => exec('insertUnorderedList')}
            />
            <ToolbarButton
              icon={<ListOrdered size={14} strokeWidth={2} aria-hidden />}
              label="Numbered list"
              onClick={() => exec('insertOrderedList')}
            />
            <ToolbarDivider />
            <LinkButton
              editorRef={editorRef}
              onApplied={() =>
                setContent(editorRef.current?.innerHTML ?? content)
              }
            />
            <ToolbarButton
              icon={<Paperclip size={14} strokeWidth={2} aria-hidden />}
              label="Attach file"
              onClick={openFilePicker}
            />
            <span style={{ flex: 1 }} />
            <ToolbarButton
              icon={<MoreHorizontal size={14} strokeWidth={2} aria-hidden />}
              label="More formatting"
              active={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
            />
          </div>

          <AnimatePresence initial={false}>
            {moreOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: EASE }}
                style={{ overflow: 'visible' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    marginTop: 4,
                    paddingTop: 6,
                    borderTop: '1px solid rgb(var(--ink) / 0.07)',
                  }}
                >
                  <ToolbarPopoverMenu
                    icon={
                      <span style={{ font: '500 11px Inter, sans-serif' }}>
                        Aa
                      </span>
                    }
                    label="Font family"
                    items={[
                      { label: 'Inter (default)', value: 'Inter, sans-serif' },
                      { label: 'Georgia', value: 'Georgia, serif' },
                      {
                        label: 'Courier New',
                        value: '"Courier New", monospace',
                      },
                      { label: 'Verdana', value: 'Verdana, sans-serif' },
                    ]}
                    onSelect={(v) => exec('fontName', v)}
                  />
                  <ToolbarPopoverMenu
                    icon={
                      <span style={{ font: '500 11px Inter, sans-serif' }}>
                        Size
                      </span>
                    }
                    label="Font size"
                    items={[
                      { label: 'Small', value: '2' },
                      { label: 'Normal', value: '3' },
                      { label: 'Large', value: '5' },
                      { label: 'Larger', value: '7' },
                    ]}
                    onSelect={(v) => exec('fontSize', v)}
                  />
                  <ColorPopoverButton onSelect={(c) => exec('foreColor', c)} />
                  <ToolbarDivider />
                  <ToolbarButton
                    icon={<Indent size={14} strokeWidth={2} aria-hidden />}
                    label="Indent"
                    onClick={() => exec('indent')}
                  />
                  <ToolbarButton
                    icon={<Outdent size={14} strokeWidth={2} aria-hidden />}
                    label="Outdent"
                    onClick={() => exec('outdent')}
                  />
                  <ToolbarButton
                    icon={<Eraser size={14} strokeWidth={2} aria-hidden />}
                    label="Remove formatting"
                    onClick={() => exec('removeFormat')}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ---- content surface ----
          While editing, this wrapper (and the editable div inside it) join
          the root's flex column so the editor is the one part of the
          composer that actually consumes the extra vertical space the root
          was given — not a `vh`-based guess that ignored how much room a
          sibling (the original-email region above, in `ThreadView`) also
          needed. `minHeight` is now just a comfortable floor for when the
          composer hasn't been granted much space at all (e.g. a very short
          viewport). */}
      <div
        style={{
          padding: '10px 16px 0',
          display: growWhileEditing ? 'flex' : 'block',
          flexDirection: 'column',
          flex: growWhileEditing ? '1 1 auto' : 'none',
          minHeight: growWhileEditing ? 0 : undefined,
        }}
      >
        {status === 'editing' ? (
          <div
            key={editSession}
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: preEditContent }}
            onInput={(e) => setContent(e.currentTarget.innerHTML)}
            onClick={handleEditorLinkClick}
            className={`obligo-reply-content${linkModifierHeld ? ' obligo-link-armed' : ''}`}
            style={{
              // Fills the same width as the To/Cc fields above (both sit
              // under the same `padding: '10px 16px 0'` wrapper) — the old
              // `maxWidth: '62ch'` reading-measure was sized for *previewing*
              // a short AI draft, not for writing one, and left roughly 40%
              // of the composer's width empty during editing.
              width: '100%',
              boxSizing: 'border-box',
              // Grows to fill whatever space the flex column above gives
              // it; the floor is just a comfortable minimum when that space
              // is tight, and `overflowY` lets very long drafts scroll
              // inside the editor itself rather than forcing the composer
              // (and the original email above it) to keep shrinking.
              flex: '1 1 auto',
              minHeight: 96,
              overflowY: 'auto',
              font: '400 13px/1.7 Inter, sans-serif',
              color: 'var(--text)',
              outline: 'none',
              borderRadius: 8,
              padding: '6px 2px',
            }}
          />
        ) : (
          <div
            className="obligo-reply-content"
            dangerouslySetInnerHTML={{ __html: content }}
            style={{
              // The shared mail reading measure (see `--measure-mail`) — the
              // same one the message body and Obligo's insight use, so a draft
              // being previewed sits in the same column as the mail it
              // answers. The editing branch above stays at a full-width 100%
              // for the reason its own note gives.
              maxWidth: 'var(--measure-mail)',
              font: '400 13px/1.7 Inter, sans-serif',
              color: 'var(--text)',
            }}
          />
        )}
      </div>

      {/* ---- attachments ---- */}
      {attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '10px 16px 0',
          }}
        >
          {attachments.map((a) => (
            <span
              key={a.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                maxWidth: 230,
                // Same card language the recipient chips and "Schedule for"
                // summary use elsewhere in this composer (subtle raised
                // surface + hairline border + inset highlight), not a
                // generic browser-file-input pill — so it reads as a child
                // of the composer rather than an external widget.
                background: 'rgb(var(--ink) / 0.035)',
                border: '1px solid rgb(var(--ink) / 0.12)',
                borderRadius: 9,
                boxShadow: 'inset 0 1px 0 var(--inset-hi)',
                padding: '5px 6px 5px 7px',
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: 6,
                  background: 'rgb(var(--ink) / 0.06)',
                  color: 'var(--gold-ink)',
                }}
              >
                <Paperclip size={11} strokeWidth={2} aria-hidden />
              </span>
              <span
                style={{
                  minWidth: 0,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  lineHeight: 1.3,
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    font: '500 11px Inter, sans-serif',
                    color: 'var(--text)',
                  }}
                >
                  {a.name}
                </span>
                <span
                  className="obligo-mono"
                  style={{ fontSize: 9.5, color: 'var(--text-faint)' }}
                >
                  {formatAttachmentSize(a.size)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => removeAttachment(a.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  flex: 'none',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-faint)',
                  cursor: 'pointer',
                }}
              >
                <XIcon size={10} strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ---- reply actions ---- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          padding: '14px 16px',
          flexWrap: 'wrap',
        }}
      >
        {status === 'preview' && (
          <>
            {!hasValidRecipient && (
              <span
                role="alert"
                style={{
                  marginRight: 'auto',
                  font: '400 11.5px Inter, sans-serif',
                  color: 'rgb(var(--coral) / 0.95)',
                }}
              >
                Add at least one recipient before sending.
              </span>
            )}
            <button
              type="button"
              className="obligo-btn obligo-btn--ghost"
              onClick={openFilePicker}
            >
              <Paperclip size={13} strokeWidth={2} aria-hidden />
              Attach
            </button>
            <button
              type="button"
              className="obligo-btn obligo-btn--outline"
              onClick={startEditing}
            >
              <Pencil size={13} strokeWidth={2} aria-hidden />
              Edit
            </button>
            <div
              ref={sendMenuRef}
              style={{ position: 'relative', display: 'flex' }}
            >
              <button
                type="button"
                className="obligo-btn obligo-btn--primary"
                aria-disabled={!hasValidRecipient}
                disabled={!hasValidRecipient}
                title={
                  hasValidRecipient
                    ? undefined
                    : 'Add at least one recipient before sending'
                }
                style={{
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  opacity: hasValidRecipient ? 1 : 0.5,
                  cursor: hasValidRecipient ? 'pointer' : 'not-allowed',
                }}
                onClick={sendNow}
              >
                <Send size={13} strokeWidth={2} aria-hidden />
                {sendLabel}
              </button>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={sendMenuOpen}
                aria-label="Send options"
                aria-disabled={!hasValidRecipient}
                disabled={!hasValidRecipient}
                title={
                  hasValidRecipient
                    ? undefined
                    : 'Add at least one recipient before sending'
                }
                className="obligo-btn obligo-btn--primary"
                style={{
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  borderLeft: '1px solid rgba(255,255,255,0.22)',
                  paddingInline: 8,
                  opacity: hasValidRecipient ? 1 : 0.5,
                  cursor: hasValidRecipient ? 'pointer' : 'not-allowed',
                }}
                onClick={() => setSendMenuOpen((o) => !o)}
              >
                <ChevronDown size={13} strokeWidth={2} aria-hidden />
              </button>
              {createPortal(
                <AnimatePresence>
                  {sendMenuOpen && (
                    <motion.ul
                      ref={sendMenuPopoverRef}
                      role="menu"
                      aria-label="Send options"
                      className="obligo-menu"
                      style={{
                        margin: 0,
                        listStyle: 'none',
                        minWidth: 180,
                        zIndex: 70,
                        ...sendMenuPosition,
                      }}
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={POPOVER_TRANSITION}
                    >
                      <li>
                        <button
                          type="button"
                          role="menuitem"
                          className="obligo-option"
                          style={{ width: '100%' }}
                          onClick={() => {
                            setSendMenuOpen(false);
                            setScheduleOpen(true);
                          }}
                        >
                          <Calendar size={13} strokeWidth={2} aria-hidden />
                          Schedule send
                        </button>
                      </li>
                    </motion.ul>
                  )}
                </AnimatePresence>,
                getPortalRoot()
              )}
              <AnimatePresence>
                {scheduleOpen && (
                  <SchedulePopover
                    anchorRef={sendMenuRef}
                    onCancel={() => setScheduleOpen(false)}
                    onSchedule={applySchedule}
                  />
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        {status === 'editing' && (
          <>
            <button
              type="button"
              className="obligo-btn obligo-btn--ghost"
              onClick={handleDiscardClick}
            >
              <XIcon size={13} strokeWidth={2} aria-hidden />
              Cancel
            </button>
            {/* Persists the reply for later. Lives here, inside the composer,
                because this is the only place the content, recipients and
                attachments actually exist — the button that used to offer this
                sat in the page footer with no access to any of them, and so
                could do nothing but close the view. */}
            {onSaveDraft && (
              <button
                type="button"
                className="obligo-btn obligo-btn--outline"
                onClick={() => {
                  onSaveDraft(currentPayload());
                  setSavedBaseline({ content, to, cc, attachments });
                  setDraftSavedAt(new Date().toISOString());
                  setStatus('preview');
                }}
              >
                Save as draft
              </button>
            )}
            <button
              type="button"
              className="obligo-btn obligo-btn--primary"
              onClick={saveEditing}
            >
              <Check size={13} strokeWidth={2} aria-hidden />
              Save changes
            </button>
          </>
        )}

        {status === 'scheduled' && scheduledAt && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              width: '100%',
              justifyContent: 'flex-end',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                font: '400 12px Inter, sans-serif',
                color: 'var(--gold-ink)',
                marginRight: 'auto',
              }}
            >
              <Clock size={13} strokeWidth={2} aria-hidden />
              Scheduled for {formatScheduled(scheduledAt)}
            </span>
            <button
              type="button"
              className="obligo-btn obligo-btn--ghost"
              onClick={backToEditingFromSchedule}
            >
              Edit draft
            </button>
            <div style={{ position: 'relative' }}>
              <button
                ref={editScheduleBtnRef}
                type="button"
                className="obligo-btn obligo-btn--outline"
                onClick={() => setScheduleOpen((o) => !o)}
              >
                Edit schedule
              </button>
              <AnimatePresence>
                {scheduleOpen && (
                  <SchedulePopover
                    anchorRef={editScheduleBtnRef}
                    initialDate={scheduledAt}
                    onCancel={() => setScheduleOpen(false)}
                    onSchedule={applySchedule}
                  />
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              className="obligo-btn obligo-btn--ghost"
              onClick={cancelSchedule}
            >
              Cancel
            </button>
          </div>
        )}

        {status === 'sent' && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              font: '400 12px Inter, sans-serif',
              color: 'var(--text-muted)',
            }}
          >
            <Check size={14} strokeWidth={2} aria-hidden />
            Sent
          </span>
        )}
      </div>
    </div>
  );
}
