/**
 * Shared expand-on-click search field — used by Actions and Opportunities.
 * Previously each page hand-rolled its own near-identical copy (same expand/
 * autofocus/Escape/outside-click contract, different only in placeholder and
 * aria-label); consolidated here so the two can't quietly drift apart again.
 *
 * Contract: clicking the icon expands an inline field and autofocuses it.
 * Escape closes it, clears the query, and returns focus to the toggle button
 * so keyboard users don't fall through to the document. An outside click
 * closes and clears too, but doesn't steal focus from wherever the user
 * actually clicked — the same asymmetry `Select` uses for its own dismissal.
 */
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { EASE } from './motion';

export function ExpandingSearch({
  query,
  onQueryChange,
  placeholder,
  ariaLabel,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder: string;
  /** Accessible name for the toggle button/input, e.g. "Search actions". */
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    onQueryChange('');
    if (returnFocus) toggleBtnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
    // `close` is redefined each render; only `open` should re-subscribe this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center' }}>
      <AnimatePresence initial={false}>
        {open && (
          <motion.input
            ref={inputRef}
            key="expanding-search-input"
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            placeholder={placeholder}
            aria-label={ariaLabel}
            initial={{ width: 0, opacity: 0, marginRight: 0 }}
            animate={{ width: 200, opacity: 1, marginRight: 6 }}
            exit={{ width: 0, opacity: 0, marginRight: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{
              height: 'calc(var(--ui-scale) * 28px)',
              borderRadius: 'calc(var(--ui-scale) * 8px)',
              border: '1px solid rgb(var(--ink) / 0.1)',
              background: 'rgb(var(--ink) / 0.03)',
              padding: '0 calc(var(--ui-scale) * 10px)',
              font: '400 calc(var(--ui-scale) * var(--type-scale, 1) * 12px) Inter, sans-serif',
              color: 'var(--text)',
            }}
          />
        )}
      </AnimatePresence>
      <button
        ref={toggleBtnRef}
        type="button"
        className="iil-icon-btn iil-chip-btn"
        aria-label={open ? `Close search` : ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
        style={
          {
            width: 'calc(var(--ui-scale) * 28px)',
            height: 'calc(var(--ui-scale) * 28px)',
            borderRadius: 'calc(var(--ui-scale) * 8px)',
            flex: 'none',
            '--chip-color': open ? 'var(--text-strong)' : 'var(--text-muted)',
            '--chip-bg': open ? 'rgb(var(--ink) / 0.06)' : 'rgb(var(--ink) / 0.03)',
            '--chip-border': `rgb(var(--ink) / ${open ? 0.12 : 0.07})`,
          } as CSSProperties
        }
      >
        {/* Lucide `size` is a raw SVG attribute, not calc()-able — literal
            12 * 1.2 pre-computed, same as the nav icon in AppShell. */}
        {open ? <X size={14} strokeWidth={1.6} aria-hidden /> : <Search size={14} strokeWidth={1.6} aria-hidden />}
      </button>
    </div>
  );
}
