/**
 * The files that came with a received message.
 *
 * Attachments previously had no representation at all on the reading side —
 * two demo mails tell the reader about "the attached offer letter" and there
 * was nothing on screen, because the model had nowhere to put one. This is
 * that surface, using the same card language the composer's own attachment
 * chips already use so the two read as one idea.
 *
 * DELIBERATELY NOT A DOWNLOAD LINK. `StoredAttachment.url` is optional and
 * nothing in this app sets it: the shape of a real one (signed, expiring,
 * scoped to a session) is a backend decision that hasn't been made, and a
 * fabricated href would be a link to a file that does not exist. When that
 * contract lands, this is the one component that gains an anchor.
 */
import { Paperclip } from 'lucide-react';
import { formatAttachmentSize, type StoredAttachment } from '../../lib/mailContent';

export function AttachmentList({ attachments }: { attachments?: StoredAttachment[] }) {
  if (!attachments?.length) return null;

  return (
    <ul
      aria-label="Attachments"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        listStyle: 'none',
        margin: '12px 0 0',
        padding: 0,
      }}
    >
      {attachments.map((a) => (
        <li
          key={a.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            maxWidth: 230,
            background: 'rgb(var(--ink) / 0.035)',
            border: '1px solid rgb(var(--ink) / 0.12)',
            borderRadius: 9,
            boxShadow: 'inset 0 1px 0 var(--inset-hi)',
            padding: '5px 9px 5px 7px',
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
            <Paperclip size={11} strokeWidth={2} />
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                font: '400 11.5px/1.3 Inter, sans-serif',
                color: 'var(--text)',
              }}
            >
              {a.name}
            </span>
            <span
              className="obligo-mono"
              style={{ font: '400 9.5px "JetBrains Mono", monospace', color: 'var(--text-faint)' }}
            >
              {formatAttachmentSize(a.size)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
