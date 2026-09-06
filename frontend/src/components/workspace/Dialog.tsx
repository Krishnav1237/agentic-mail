/**
 * A generic modal shell — title, close button, arbitrary body content —
 * factored out of `ConfirmDialog`'s own portal/focus-trap/Escape mechanics
 * (`primitives.tsx`) so a dialog that needs real form content (Telegram's
 * integration manager, Help & Feedback) doesn't re-solve the same overlay
 * positioning and keyboard behavior a third time.
 *
 * Portalled to `.iil-root` for the same reason `ConfirmDialogPortal` is: any
 * workspace page renders inside `.iil-page`'s own `transform: scale(...)`
 * content zoom, which gives `position: fixed` a new (transformed, scrolled)
 * containing block — without the portal this would center on the page's
 * transformed box instead of the real viewport.
 */
import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getPortalRoot } from './ReplyComposer';

function DialogPortal({
  title,
  description,
  width,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  // Same three properties `ConfirmDialogPortal` establishes: Escape
  // dismisses, focus enters on open and returns to the trigger on close, Tab
  // cycles inside rather than leaking to the page behind the scrim. Initial
  // focus lands on the close button — the one control guaranteed to exist
  // regardless of which form this wraps.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
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
        aria-describedby={description ? descriptionId : undefined}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: 'var(--overlay)',
          border: '1px solid var(--overlay-border)',
          boxShadow: 'var(--overlay-shadow), inset 0 1px 0 var(--inset-hi)',
          backdropFilter: 'blur(var(--glass-blur-strong))',
          WebkitBackdropFilter: 'blur(var(--glass-blur-strong))',
          borderRadius: 16,
          padding: '20px 22px 24px',
          color: 'var(--text)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              id={titleId}
              style={{
                font: '500 16px/1.3 Inter, sans-serif',
                color: 'var(--text-strong)',
              }}
            >
              {title}
            </div>
            {description && (
              <p
                id={descriptionId}
                style={{
                  margin: '6px 0 0',
                  font: '400 12.5px/1.6 Inter, sans-serif',
                  color: 'var(--text-secondary)',
                }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-faint)',
              cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div style={{ marginTop: 16 }}>{children}</div>
      </motion.div>
    </motion.div>,
    getPortalRoot()
  );
}

/** Public entry point — mirrors `ConfirmDialog`'s own controlled-`open`
 * shape, so callers reach for this the same way. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  width = 440,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <DialogPortal
          title={title}
          description={description}
          width={width}
          onClose={onClose}
        >
          {children}
        </DialogPortal>
      )}
    </AnimatePresence>
  );
}

/** Shared label+control row for dialog forms — same visual contract as
 * Settings' own `SettingRow`, factored here since two dialogs (Telegram,
 * Help & Feedback isn't a row form but a future one might be) both want it
 * without importing a page-local component from `Settings.tsx`. */
export function DialogRow({
  label,
  hint,
  children,
  last = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px 16px',
        minHeight: 42,
        padding: '8px 2px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 160px' }}>
        <div
          style={{ font: '400 13px/1.3 Inter, sans-serif', color: 'var(--text)' }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              marginTop: 2,
              font: '400 11.5px/1.4 Inter, sans-serif',
              color: 'var(--text-faint)',
            }}
          >
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The text-input/textarea look Profile's own fields already use
 * (`Profile.tsx`'s local `textInputStyle`) — shared here so the Help &
 * Feedback forms match without redefining it a second time. */
export const dialogFieldStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  borderRadius: 8,
  border: '1px solid rgb(var(--ink) / 0.12)',
  background: 'rgb(var(--ink) / 0.03)',
  padding: '8px 10px',
  font: '400 12.5px/1.5 Inter, sans-serif',
  color: 'var(--text)',
};
