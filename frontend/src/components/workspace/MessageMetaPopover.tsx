/**
 * The "to me ▾" disclosure and its metadata popover — the compact
 * opened-mail header only ever shows sender/timestamp at a glance; this is
 * where the rest of a message's real header fields (recipients, full date,
 * Message-ID, security, ...) live. One shared component so `MailThreadView`
 * can mount it both for the header's current message and for each earlier
 * message in a thread, each with its own metadata (see `MessageMeta`) —
 * never the newest message's data borrowed for an older one.
 *
 * Positioning/outside-click/portal plumbing reuses the exact same
 * `usePopoverPosition`/`useOutsideClose`/`getPortalRoot` trio
 * `ReplyComposer`'s own anchored popovers (`LinkDialog`, `SchedulePopover`)
 * already use — same "portal to `.iil-root`, not `document.body`, so
 * `position: fixed` stays viewport-relative under the page's own transform"
 * reasoning applies here too.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Lock } from 'lucide-react';
import { EASE } from './motion';
import { usePopoverPosition, useOutsideClose, getPortalRoot } from './ReplyComposer';
import { CURRENT_USER_EMAIL, splitRecipients } from '../../lib/mailAdapters';

export type MessageMeta = {
  fromName: string;
  fromEmail?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  replyTo?: string;
  deliveredTo?: string;
  messageId?: string;
  mailingList?: string;
  signedBy?: string;
  mailedBy?: string;
  security?: string;
};

function isMe(entry: string): boolean {
  const match = entry.match(/<([^>]+)>/);
  const email = (match ? match[1] : entry).trim().toLowerCase();
  return email === CURRENT_USER_EMAIL;
}

/** "Dana, Priya and 2 more" / "me" — the collapsed line the disclosure
 * control shows before it's opened. Never truncates silently past this
 * summary — the full list is always one click away in the popover. */
function recipientSummary(meta: MessageMeta): string {
  const to = splitRecipients(meta.to);
  if (to.length === 0) return 'me';
  const labels = to.map((r) => {
    if (isMe(r)) return 'me';
    const match = r.match(/^([^<]+)</);
    const label = (match ? match[1] : r).trim();
    return label.split(/\s+/)[0] || label;
  });
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
}

/** Recipient rows show real addresses, "me" substituted only for the
 * viewer's own — same convention Gmail's own details panel uses. */
function recipientListValue(items: string[]): string {
  return items.map((r) => (isMe(r) ? 'me' : r)).join(', ');
}

function MetaRow({
  label,
  children,
  bold,
  icon,
}: {
  label: string;
  children: string;
  bold?: boolean;
  icon?: 'lock';
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span
        style={{
          flex: '0 0 68px',
          textAlign: 'right',
          font: '400 11px Inter, sans-serif',
          color: 'var(--text-faint)',
        }}
      >
        {label}:
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          font: `${bold ? 600 : 400} 11.5px/1.5 Inter, sans-serif`,
          color: bold ? 'var(--text-strong)' : 'var(--text-secondary)',
          overflowWrap: 'anywhere',
        }}
      >
        {icon === 'lock' && (
          <Lock size={10} strokeWidth={2} aria-hidden style={{ flex: 'none', color: 'var(--text-faint)' }} />
        )}
        {children}
      </span>
    </div>
  );
}

function MetaPopoverContent({ meta }: { meta: MessageMeta }) {
  const fromValue = meta.fromEmail ? `${meta.fromName} <${meta.fromEmail}>` : meta.fromName;
  const toItems = splitRecipients(meta.to);
  const ccItems = splitRecipients(meta.cc);
  const bccItems = splitRecipients(meta.bcc);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <MetaRow label="from" bold>
        {fromValue}
      </MetaRow>
      <MetaRow label="to">{toItems.length ? recipientListValue(toItems) : 'me'}</MetaRow>
      {ccItems.length > 0 && <MetaRow label="cc">{recipientListValue(ccItems)}</MetaRow>}
      {bccItems.length > 0 && <MetaRow label="bcc">{recipientListValue(bccItems)}</MetaRow>}
      {/* No Date row here — the full date now lives in the compact header
          itself (in place of the old abbreviated time), so repeating it
          inside the popover would just be the same value shown twice. */}
      <MetaRow label="subject">{meta.subject}</MetaRow>
      {meta.mailedBy && <MetaRow label="mailed-by">{meta.mailedBy}</MetaRow>}
      {meta.signedBy && <MetaRow label="signed-by">{meta.signedBy}</MetaRow>}
      {meta.security && (
        <MetaRow label="security" icon="lock">
          {meta.security}
        </MetaRow>
      )}
      {meta.replyTo && <MetaRow label="reply-to">{meta.replyTo}</MetaRow>}
      {meta.deliveredTo && <MetaRow label="delivered-to">{meta.deliveredTo}</MetaRow>}
      {meta.mailingList && <MetaRow label="mailing list">{meta.mailingList}</MetaRow>}
      {meta.messageId && <MetaRow label="message-id">{meta.messageId}</MetaRow>}
    </div>
  );
}

/**
 * Trigger + anchored popover. Renders as a compact "to {summary} ▾" line —
 * clicking it (the whole trigger, not just the chevron) toggles the
 * popover; clicking outside or pressing Escape closes it.
 */
export function RecipientDisclosure({ meta }: { meta: MessageMeta }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useOutsideClose<HTMLButtonElement>(open, () => setOpen(false), popoverRef);
  const position = usePopoverPosition(triggerRef, popoverRef, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Message details — to ${recipientSummary(meta)}`}
        onClick={(e) => {
          // Stops this from also toggling an ancestor "collapse this
          // message" row (`MailThreadView`'s history rows are themselves
          // clickable) — opening the details popover should never also
          // collapse the message it's describing.
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="iil-meta-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          alignSelf: 'flex-start',
          margin: '-3px 0 -3px -6px',
          padding: '3px 6px',
          border: 'none',
          borderRadius: 6,
          background: 'transparent',
          cursor: 'pointer',
          font: '400 11px Inter, sans-serif',
          color: 'var(--text-faint)',
        }}
      >
        <span>to {recipientSummary(meta)}</span>
        <ChevronDown
          size={11}
          strokeWidth={2}
          aria-hidden
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .16s ease' }}
        />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popoverRef}
              role="dialog"
              aria-label="Message details"
              className="iil-menu"
              style={{
                width: 360,
                minWidth: 360,
                maxWidth: 'calc(100vw - 16px)',
                padding: '14px 16px',
                zIndex: 70,
                ...position,
              }}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: EASE }}
            >
              <MetaPopoverContent meta={meta} />
            </motion.div>
          )}
        </AnimatePresence>,
        getPortalRoot(),
      )}
    </>
  );
}
