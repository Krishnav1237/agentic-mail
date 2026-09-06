/**
 * Foundation form controls: {@link Button}, {@link Toggle}, {@link Slider} and
 * {@link Select}.
 *
 * These are the primitive interactions the workspace configures itself with
 * (Reference §24-25, Constitution §10). They carry styling, interaction and
 * accessibility — never business logic (Constitution §73). Variation is
 * expressed through props, not near-duplicate components (§81).
 */
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Info } from 'lucide-react';
import { EASE } from './motion';
import { usePopoverPosition, useOutsideClose, getPortalRoot } from './ReplyComposer';

/* --------------------------------- Button -------------------------------- */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export function Button({
  variant = 'outline',
  className = '',
  children,
  ...props
}: {
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`obligo-btn obligo-btn--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

/* --------------------------------- Toggle -------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name for the switch. */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked}
      className="obligo-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="obligo-toggle__knob" />
    </button>
  );
}

/* --------------------------------- Slider -------------------------------- */

export function Slider({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(88px, 132px) 1fr auto',
        alignItems: 'center',
        gap: 'calc(var(--ui-scale) * 16px)',
      }}
    >
      <span style={{ font: '400 calc(var(--ui-scale) * 12.5px)/1.2 Inter, sans-serif', color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <input
        type="range"
        className="obligo-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="obligo-mono"
        style={{
          font: '500 calc(var(--ui-scale) * 12px)/1 "JetBrains Mono", monospace',
          color: 'var(--text-muted)',
          minWidth: 16,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* --------------------------------- Select -------------------------------- */

/**
 * Single-choice dropdown for mutually exclusive options where the current value
 * stays visible (Reference §25). Embedded (borderless) trigger so it reads as
 * part of the surface, not a boxed input (Constitution §9). Implements the ARIA
 * combobox/listbox keyboard model: ↑/↓ move, Enter selects, Esc closes, focus
 * returns to the trigger.
 */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'left',
  disabledOptions,
  optionInfo,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  ariaLabel?: string;
  align?: 'left' | 'right';
  /** Options shown but not yet selectable — rendered dimmed/inert rather than
   * omitted, so a coming-soon capability stays visible without being
   * choosable. Skipped during keyboard navigation and ignored on click. */
  disabledOptions?: readonly string[];
  /** A short explanation shown at the point of choice — a small info icon
   * beside the named option, revealed on hover or when that option is the
   * keyboard-highlighted one. Keyed by the option's own display label, same
   * convention `disabledOptions` uses. Deliberately plain text, not a node:
   * the icon, its popover, and the listbox-safe way of showing it (no
   * interactive element nested inside a `role="option"`) all live here,
   * once, rather than being re-solved by every caller. */
  optionInfo?: Readonly<Record<string, string>>;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.indexOf(value))
  );
  const [infoHover, setInfoHover] = useState(false);
  const popoverRef = useRef<HTMLUListElement>(null);
  const infoIconRef = useRef<HTMLSpanElement>(null);
  const infoPopoverRef = useRef<HTMLDivElement>(null);
  // `useOutsideClose` owns the trigger ref itself (the portalled listbox is
  // no longer a DOM descendant of it, so containment alone can't tell
  // "inside" from "outside" — `popoverRef` is passed as the extra node to
  // treat as inside too, same convention `RecipientDisclosure` uses).
  const triggerRef = useOutsideClose<HTMLButtonElement>(open, () => setOpen(false), popoverRef);
  // Portalled to escape the page's own `--content-scale` zoom — without
  // this the listbox, still a `.obligo-page` descendant,
  // would inherit that `transform: scale()` on top of its own `--ui-scale`
  // sizing and render far larger than the trigger that opened it.
  const position = usePopoverPosition(triggerRef, popoverRef, open, align);
  const [anchorWidth, setAnchorWidth] = useState<number>();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const isDisabled = (i: number) => disabledOptions?.includes(options[i]) ?? false;

  // At most one option carries an explanation today (Reply Tone's
  // "Personalized") — found by label rather than hardcoded to an index, so
  // it keeps working if the option list is reordered.
  const infoIndex = optionInfo
    ? options.findIndex((o) => optionInfo[o] !== undefined)
    : -1;
  const infoTooltipId = `${baseId}-info`;
  // Visible on hovering the icon itself, OR while that option is the
  // keyboard-highlighted one — `activeIndex` is this listbox's own roving
  // "focus" (real DOM focus never leaves the trigger in a combobox), so an
  // arrow-key move onto Personalized already exposes the same explanation a
  // mouse hover would, with no second keyboard path to maintain.
  const infoVisible = open && infoIndex >= 0 && (infoHover || activeIndex === infoIndex);
  const infoPosition = usePopoverPosition(infoIconRef, infoPopoverRef, infoVisible, 'left');

  // Sync the highlighted option to the current value each time we open.
  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, options.indexOf(value)));
    else setInfoHover(false);
  }, [open, value, options]);

  // `.obligo-menu`'s own `min-width: 100%` resolves against the trigger while
  // absolute-inside-it, but against the viewport once portalled — capture
  // the trigger's real width so the listbox still reads as "attached" to it
  // instead of shrink-wrapping to its longest option alone.
  useLayoutEffect(() => {
    if (open) setAnchorWidth(triggerRef.current?.offsetWidth);
  }, [open, triggerRef]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const commit = (index: number) => {
    if (isDisabled(index)) return;
    const next = options[index];
    if (next !== undefined) onChange(next);
    close();
  };

  /** Steps `from` in `dir` (+1/-1), skipping disabled entries, and clamping
   * at the ends rather than wrapping — same feel as a native disabled
   * <option> in a <select>. */
  const nextEnabled = (from: number, dir: 1 | -1) => {
    let i = from + dir;
    while (i >= 0 && i < options.length && isDisabled(i)) i += dir;
    return i >= 0 && i < options.length ? i : from;
  };

  const firstEnabled = () => {
    let i = 0;
    while (i < options.length && isDisabled(i)) i += 1;
    return Math.min(i, options.length - 1);
  };

  const lastEnabled = () => {
    let i = options.length - 1;
    while (i >= 0 && isDisabled(i)) i -= 1;
    return Math.max(i, 0);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => nextEnabled(i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => nextEnabled(i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(firstEnabled());
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(lastEnabled());
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(activeIndex);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <div className="obligo-select">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="obligo-select__trigger"
        data-open={open}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span>{value}</span>
        {/* Lucide `size` is a raw SVG attribute, not calc()-able — literal
            14 * 1.2 pre-computed. */}
        <ChevronDown className="obligo-select__chev" size={17} strokeWidth={2} aria-hidden />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={popoverRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="obligo-menu"
              style={
                {
                  margin: 0,
                  listStyle: 'none',
                  minWidth: anchorWidth,
                  zIndex: 70,
                  ...position,
                } satisfies CSSProperties
              }
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              {options.map((opt, i) => {
                const disabled = isDisabled(i);
                const hasInfo = i === infoIndex;
                return (
                  <li
                    key={opt}
                    id={optionId(i)}
                    role="option"
                    aria-selected={opt === value}
                    aria-disabled={disabled}
                    aria-describedby={hasInfo && infoVisible ? infoTooltipId : undefined}
                    className="obligo-option"
                    data-active={i === activeIndex && !disabled}
                    data-selected={opt === value}
                    data-disabled={disabled}
                    onClick={() => commit(i)}
                    onMouseEnter={() => !disabled && setActiveIndex(i)}
                  >
                    <span style={{ flex: 1 }}>{opt}</span>
                    {hasInfo && (
                      // A plain (non-interactive) icon, not a button — an
                      // option in a listbox must never contain a second
                      // focusable element, since a combobox's real DOM focus
                      // never leaves the trigger. Hover/keyboard exposure
                      // comes from this option's own `activeIndex` state
                      // above, not from focusing this icon.
                      <span
                        ref={infoIconRef}
                        aria-hidden="true"
                        onMouseEnter={() => setInfoHover(true)}
                        onMouseLeave={() => setInfoHover(false)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 16,
                          height: 16,
                          marginLeft: 6,
                          flexShrink: 0,
                          color: 'var(--text-faint)',
                        }}
                      >
                        <Info size={13} aria-hidden="true" />
                      </span>
                    )}
                    {/* Literal 13 * 1.2, same reasoning as the chevron above. */}
                    {opt === value && <Check size={16} strokeWidth={2.5} aria-hidden />}
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>,
        getPortalRoot(),
      )}
      {infoIndex >= 0 &&
        createPortal(
          <AnimatePresence>
            {infoVisible && (
              <motion.div
                ref={infoPopoverRef}
                id={infoTooltipId}
                role="tooltip"
                className="obligo-menu"
                style={
                  {
                    ...infoPosition,
                    // Overrides `.obligo-menu`'s own `min-width: 100%` — against
                    // a `position: fixed` element that resolves to the
                    // VIEWPORT width, which is exactly the "stretches across
                    // essentially the entire available width" bug this
                    // replaces. `width: max-content` + `maxWidth` is what
                    // makes this size to its one line of text instead.
                    minWidth: 0,
                    width: 'max-content',
                    maxWidth: 240,
                    zIndex: 80,
                    padding: '8px 10px',
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: 'var(--text-secondary)',
                  } satisfies CSSProperties
                }
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16, ease: EASE }}
              >
                {optionInfo?.[options[infoIndex]]}
              </motion.div>
            )}
          </AnimatePresence>,
          getPortalRoot(),
        )}
    </div>
  );
}
