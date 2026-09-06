import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Archive, Inbox as InboxIcon, MailOpen, Trash2 } from 'lucide-react';
import {
  attentionVisual,
  AttentionDot,
  AttentionRail,
  DURATION,
  EASE,
  EmptyState,
  InteractiveRow,
  MailThreadView,
  Reveal,
  Stagger,
  WorkspacePage,
} from '../../components/workspace';
import { NORMAL_ATTENTION } from '../../lib/attention';
import { mailActions, useMailStore, type StoredMailRow } from '../../lib/mailStore';
import { formatFullDateTime, formatRelativeMailTime, truncatePreview } from '../../lib/mailAdapters';

/**
 * Completed — the single unified destination for every thread that has
 * reached the app's terminal state, regardless of which workflow page (or
 * pages) it passed through on the way there.
 *
 * THE CANONICAL SOURCE, AND ONLY IT. `StoredMailRow.completedAt` — set by
 * `mailActions.complete`, the one function every workflow resolution already
 * goes through (Approve/Reject in Approvals, Mark done in Actions, Pass in
 * Opportunities) — is the single fact this page reads. It does not
 * cross-reference `workflowStore`'s three collections: there is no fixed,
 * mandatory pipeline a thread progresses through (Opportunity/Action/
 * Approval/Completed are possible CURRENT states Obligo can classify a thread
 * as, not required stages — see `workflowStateFor`), so a thread may have
 * been an Opportunity, an Action, an Approval, more than one of those, or
 * none, in whatever order its own evidence actually called for, before
 * landing here. This page is not in the business of reconstructing or
 * displaying that path. It shows THAT a thread is done and WHEN, never WHERE
 * it came from — no origin trail, no per-page origin tag. Assigning a single
 * "came from" page to a thread that may have passed through several, in no
 * fixed order, would be inventing an ownership the data doesn't have.
 *
 * Reactive by construction: `useMailStore()` is the same `useSyncExternalStore`
 * subscription every other page reads mail through, so completing (or, if a
 * future control ever allows it, un-completing) a thread anywhere in the app
 * updates this list on the very next render — no polling, no local mirror.
 */

const TRUNCATE: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

function CompletedRow({
  row,
  last,
  onOpen,
}: {
  row: StoredMailRow;
  last: boolean;
  onOpen: () => void;
}) {
  // Always normal — completing a row resets its attention at the store — so
  // this list never carries a rail or wash; the dot/rail are rendered purely
  // for the same visual rhythm every other mail-like row in the app has.
  const attention = row.attention ?? NORMAL_ATTENTION;
  const preview = truncatePreview(row.snippet);
  const completedLabel = formatRelativeMailTime(row.completedAt);
  const completedFull = formatFullDateTime(row.completedAt);

  return (
    <InteractiveRow
      onClick={onOpen}
      visual={attentionVisual(attention, 'row')}
      title={completedFull ? `Completed ${completedFull}` : undefined}
      style={{
        position: 'relative',
        gap: 14,
        height: preview ? 44 : 34,
        paddingInline: 14,
        borderRadius: 8,
        cursor: 'pointer',
        borderBottom: !last ? '1px solid rgb(var(--ink) / 0.05)' : undefined,
      }}
    >
      <AttentionRail attention={attention} />
      <AttentionDot attention={attention} unread={false} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              ...TRUNCATE,
              flex: 1,
              minWidth: 0,
              font: '400 calc(var(--type-scale, 1) * 12px) Inter, sans-serif',
              color: 'var(--text)',
            }}
          >
            {row.sender && (
              <span style={{ color: 'var(--text-secondary)' }}>
                {row.sender} —{' '}
              </span>
            )}
            {row.subject}
          </span>
          {completedLabel && (
            <span
              className="obligo-mono"
              style={{
                flex: 'none',
                font: '400 calc(var(--type-scale, 1) * 9.5px) "JetBrains Mono", monospace',
                color: 'var(--text-faint)',
              }}
            >
              {completedLabel}
            </span>
          )}
        </div>
        {preview && (
          <span
            style={{
              ...TRUNCATE,
              display: 'block',
              marginTop: 2,
              font: '400 calc(var(--type-scale, 1) * 10px)/1.3 Inter, sans-serif',
              color: 'var(--text-muted)',
            }}
          >
            {preview}
          </span>
        )}
      </div>
    </InteractiveRow>
  );
}

export default function Completed() {
  const store = useMailStore();
  const reduced = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  // Most recently completed first — a history page reads newest-on-top, the
  // same convention Sent/Scheduled already use. `completedAt` is an ISO
  // string, so a plain string comparison sorts chronologically.
  const rows = useMemo(
    () =>
      store.rows
        .filter((r): r is StoredMailRow & { completedAt: string } =>
          Boolean(r.completedAt)
        )
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    [store.rows]
  );

  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={openId ? 'mail' : 'list'}
        style={{ height: '100%' }}
        initial={swap.initial}
        animate={swap.animate}
        exit={swap.exit}
        transition={{ duration: DURATION.page, ease: EASE }}
      >
        {openId ? (
          <MailThreadView
            rows={rows}
            openId={openId}
            railLabel="Completed"
            railCount={rows.length}
            getThreadDetail={(row) => mailActions.getThreadDetail(row.id)}
            onSelect={setOpenId}
            onClose={() => setOpenId(null)}
            footer={({ selected }) => {
              const full = formatFullDateTime(selected.completedAt);
              // "Completed" describes this thread's WORKFLOW state, not
              // that it stopped being a real, manageable email — the same
              // distinction Sent/Archived/Starred already hold everywhere
              // else in the app (see `mailStore.ts`'s `StoredMailRow`).
              // These are the same generic actions Inbox's own default
              // footer offers, calling the exact same `mailActions` — the
              // only difference is which fact decides which variant to show.
              // Inbox's default footer reads a caller-supplied `viewId`
              // (correct there, since each Inbox route already filters rows
              // down to one status), but a single Completed list can hold
              // rows of EVERY status side by side, so the row's own
              // `status` is the only fact this page can key off honestly.
              //
              // None of these mutate `completedAt` — trashing, archiving,
              // starring or toggling read state are pure mail-management
              // actions, and the one thing that's allowed to reactivate a
              // completed workflow (an outgoing reply, see
              // `mailActions.sendReply`) already runs through the built-in
              // Reply control above this footer, not through here.
              const parked =
                selected.status === 'archived' ||
                selected.status === 'trash' ||
                selected.status === 'spam';
              const snoozed = selected.status === 'snoozed';
              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    width: '100%',
                  }}
                >
                  <span
                    className="obligo-eyebrow"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    {selected.completedNote ?? 'Completed'}
                    {full ? ` · ${full}` : ''}
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginLeft: 'auto',
                      flexWrap: 'wrap',
                    }}
                  >
                    {parked || snoozed ? (
                      <button
                        type="button"
                        className="obligo-btn obligo-btn--outline"
                        onClick={() => mailActions.restoreToInbox(selected.id)}
                      >
                        <InboxIcon size={13} strokeWidth={2} aria-hidden />
                        Move to Inbox
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="obligo-btn obligo-btn--danger"
                          onClick={() => mailActions.trash(selected.id)}
                        >
                          <Trash2 size={13} strokeWidth={2} aria-hidden />
                          Delete
                        </button>
                        <button
                          type="button"
                          className="obligo-btn obligo-btn--outline"
                          onClick={() => mailActions.archive(selected.id)}
                        >
                          <Archive size={13} strokeWidth={2} aria-hidden />
                          Archive
                        </button>
                        <button
                          type="button"
                          className="obligo-btn obligo-btn--outline"
                          onClick={() =>
                            selected.unread
                              ? mailActions.markRead(selected.id)
                              : mailActions.markUnread(selected.id)
                          }
                        >
                          <MailOpen size={13} strokeWidth={2} aria-hidden />
                          {selected.unread ? 'Mark read' : 'Mark unread'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            }}
          />
        ) : (
          <WorkspacePage scale={1.25} typeScale={0.88}>
            <Stagger style={{ display: 'flex', flexDirection: 'column' }}>
              <Reveal>
                <h1
                  style={{
                    margin: 0,
                    font: 'var(--type-page-title)',
                    letterSpacing: '-0px',
                    color: 'var(--text-strong)',
                  }}
                >
                  Completed
                </h1>
              </Reveal>
              <Reveal>
                <p
                  style={{
                    font: '400 calc(var(--type-scale, 1) * 12.5px)/1.6 Inter, sans-serif',
                    color: 'var(--text-secondary)',
                    margin: '8px 0 0',
                    maxWidth: '60ch',
                  }}
                >
                  Everything whose workflow has finished, in one place.
                </p>
              </Reveal>

              {rows.length === 0 ? (
                <Reveal style={{ marginTop: 32 }}>
                  <EmptyState
                    title="Nothing completed yet."
                    description="Items you finish across Opportunities, Actions and Approvals will show up here."
                  />
                </Reveal>
              ) : (
                <Reveal style={{ marginTop: 16 }}>
                  <div>
                    {rows.map((row, i) => (
                      <CompletedRow
                        key={row.id}
                        row={row}
                        last={i === rows.length - 1}
                        onOpen={() => setOpenId(row.id)}
                      />
                    ))}
                  </div>
                </Reveal>
              )}
            </Stagger>
          </WorkspacePage>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
