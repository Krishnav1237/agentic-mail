import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  attentionInsightColor,
  attentionVisual,
  attentionWeight,
  deadlineMetaColor,
  AttentionDot,
  AttentionRail,
  Eyebrow,
  InteractiveRow,
  isTinted,
  PageSection,
  Reveal,
  Stagger,
  WorkspacePage,
} from '../../components/workspace';
import { attentionRank, needsAttention } from '../../lib/attention';
import { useWorkflowStore } from '../../lib/workflowStore';
import {
  mailActions,
  useMailStore,
  type StoredMailRow,
} from '../../lib/mailStore';
import { dueBucketFor, formatDueLabel, truncatePreview } from '../../lib/mailAdapters';
import { isOverdueByDeadline } from '../../lib/deadlineGroups';

/**
 * Dashboard — the briefing (Design Constitution §14). It opens with relief (what
 * IIL already handled overnight), surfaces only what needs a decision, then
 * quiets into awareness and background work. Built entirely on the frozen
 * foundation: the star-lit room shows through every surface, gold is spent once
 * on the single most-valuable decision, and the sections settle in as the page
 * arrives.
 *
 * Every number and every row on this page comes from the same canonical
 * `mailStore` Inbox/Actions/Opportunities/Approvals all read — there is no
 * dashboard-local mail data, and no dashboard-specific ranking taxonomy.
 * Which mails surface here is decided by `attentionRank` from
 * `lib/attention.ts` — urgent + important → urgent → important → neither, the
 * one shared ordering, DERIVED from the two independent axes rather than read
 * off a combined level — and they're drawn with the one shared red/gold/
 * neutral palette, never `unread` standing in for attention.
 */

/** One surfaced mail — a real row from the canonical store, plus the IIL
 * insight explaining why it's here (truncated for display by the rows below),
 * plus which page owns it (where a click should land).
 *
 * The insight is read from the mail's own `ThreadDetail`, not from the
 * Approval/Opportunity/Action record that surfaced it. Those three used to
 * supply three different fields (`detail`, `why`, `reason`), which meant this
 * page could show a line of AI text that the mail itself never showed once
 * opened. One lookup, one text, everywhere. */
type CardMail = {
  row: StoredMailRow;
  insight?: string;
};

/** The one canonical insight lookup every surfaced row here uses. */
function insightFor(row: StoredMailRow): string | undefined {
  return mailActions.getThreadDetail(row.id)?.insight || undefined;
}

/**
 * The deadline microcopy shown on a Dashboard card — "9 days overdue",
 * "due today", "in 2 days" — the same computed label Approvals/Actions/
 * Opportunities already show next to their own rows, from the one shared
 * `deadlineIso` every backing mail carries.
 *
 * Dashboard mixes mails from all three workflow pages into one list with no
 * section headings of its own, so it can't rely on an Overdue heading the way
 * Approvals/Actions/Opportunities do — the card itself already carries the
 * urgent/red wash (overdue escalates a row's own `attention.urgency`, see
 * `mailStore.ts`'s `refreshDerivedState`), and this label is what still spells
 * out "this is overdue" specifically, in the same red token the Overdue
 * heading elsewhere in the app uses. Everything else falls back to the row's
 * ordinary attention-meta color.
 */
function deadlineLabelFor(row: StoredMailRow): { text: string; color: string } | undefined {
  // Dashboard's badge is optional/auxiliary — unlike Actions/Approvals/
  // Opportunities it has no fixed deadline column or "No deadline given"
  // section to stay consistent with, so a mail with no real deadline
  // continues to show no badge at all rather than the canonical no-deadline
  // string. The decision is read from the canonical BUCKET state (never
  // string-sniffed off the formatter's output — that's the one invariant
  // every page shares, badge-or-no-badge is Dashboard's own call).
  const bucket = dueBucketFor(row.deadlineIso);
  if (bucket === 'noDeadline') return undefined;
  return {
    text: formatDueLabel(row.deadlineIso, bucket),
    color: deadlineMetaColor(row.attention, isOverdueByDeadline(row.deadlineIso)),
  };
}

/** Top N, ranked via the one shared `attentionRank`: urgent + important
 * first, then urgent, then important, then neither. That ordering is computed
 * from the two axes, not stored — "urgent + important" is not a category this
 * page (or any other) knows about, it's just the pair that outranks the rest.
 * Ties keep the source's own curated order (Actions' overdue-first tiers,
 * Approvals' shelf order, ...) rather than re-sorting within a band. */
function rankAndTake(mails: CardMail[], limit = 5): CardMail[] {
  return mails
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        attentionRank(a.m.row.attention) - attentionRank(b.m.row.attention) ||
        a.i - b.i
    )
    .slice(0, limit)
    .map(({ m }) => m);
}

/**
 * One surfaced mail. Runs through the same `InteractiveRow` engine every
 * other page's rows use — hover/focus/press and the fixed 220ms timing are
 * shared — with the same red/gold/neutral treatment, from the same
 * `attentionVisual`/`AttentionRail`/`attentionInsightColor` helpers. Dashboard
 * has no palette of its own; it's the same system at card density.
 */
function MailAttentionRow({
  mail,
  onOpen,
}: {
  mail: CardMail;
  onOpen: () => void;
}) {
  const { row, insight } = mail;
  const attention = row.attention;
  const flagged = needsAttention(attention);
  const deadline = deadlineLabelFor(row);

  const visual = flagged
    ? attentionVisual(attention, 'card')
    : {
        bg: 'rgb(var(--ink) / 0.022)',
        hoverBg: 'rgb(var(--ink) / 0.04)',
        border: 'rgb(var(--ink) / 0.05)',
        hoverBorder: 'rgb(var(--ink) / 0.1)',
        shadow: 'inset 0 1px 0 var(--inset-hi)',
        hoverShadow: 'inset 0 1px 0 var(--inset-hi)',
      };

  return (
    <InteractiveRow
      onClick={onOpen}
      visual={visual}
      style={{
        position: 'relative',
        gap: 14,
        padding: flagged ? '15px 17px' : '13px 17px',
        borderRadius: 11,
        overflow: 'hidden',
      }}
    >
      <AttentionRail attention={attention} />
      {/* Unread (neutral) and attention (coral/gold) are separate dots — see
          `AttentionDot`. The unread dot keeps the same fixed bright tone
          every page uses, never dimmed or recolored because this row also
          happens to be urgent. */}
      <AttentionDot
        attention={attention}
        unread={row.unread}
        size={flagged ? 9 : 6}
        glow={flagged}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 7,
            font: `${attentionWeight(attention)} ${flagged ? 14 : 13}px/1.3 Inter, sans-serif`,
            color: 'var(--text-strong)',
          }}
        >
          <span
            style={{
              flex: 'none',
              maxWidth: '40%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.sender}
          </span>
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 400,
              color: 'var(--text)',
            }}
          >
            {row.subject}
          </span>
          {deadline && (
            <span
              className="iil-mono"
              style={{
                flex: 'none',
                marginLeft: 'auto',
                font: '500 11px "JetBrains Mono", monospace',
                color: deadline.color,
              }}
            >
              {deadline.text}
            </span>
          )}
        </div>
        {insight && (
          <div
            style={{
              font: '400 11.5px/1.45 Inter, sans-serif',
              marginTop: 3,
              color: attentionInsightColor(attention),
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncatePreview(insight, 90)}
          </div>
        )}
      </div>
    </InteractiveRow>
  );
}

/**
 * A quiet, one-line mail — the Actions/Opportunities cards' own weight, kept
 * deliberately lighter than the full `MailAttentionRow` above. Same three
 * semantics, `row` density: a rail and a faint wash whenever either axis is
 * raised, nothing when neither is.
 *
 * Sender and subject always show at full readable contrast. The AI insight
 * appears whenever this row is flagged at all (urgent or important) — it used
 * to be gated on gold alone, which meant a *more* urgent mail showed *less*
 * explanation than a merely important one.
 */
function CompactMailRow({
  mail,
  onOpen,
}: {
  mail: CardMail;
  onOpen: () => void;
}) {
  const { row, insight } = mail;
  const attention = row.attention;
  const flagged = needsAttention(attention);
  const deadline = deadlineLabelFor(row);

  return (
    <InteractiveRow
      onClick={onOpen}
      visual={attentionVisual(attention, 'row')}
      style={{
        position: 'relative',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        rowGap: 2,
        columnGap: 8,
        minHeight: 30,
        padding: '4px 6px',
        paddingLeft: isTinted(attention) ? 10 : 6,
        borderRadius: 7,
        overflow: isTinted(attention) ? 'hidden' : undefined,
        borderBottom: '1px solid rgb(var(--ink) / 0.05)',
      }}
    >
      <AttentionRail attention={attention} />
      {/* Unread (neutral) and attention (coral/gold) are separate dots. */}
      <AttentionDot
        attention={attention}
        unread={row.unread}
        size={5}
        glow={false}
      />
      <span
        style={{
          flex: 'none',
          maxWidth: '45%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          font: `${attentionWeight(attention, 400)} 12.5px/1.4 Inter, sans-serif`,
          color: 'var(--text)',
        }}
      >
        {row.sender}
      </span>
      <span
        style={{
          flex: '1 1 120px',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          font: '400 12.5px/1.4 Inter, sans-serif',
          color: 'var(--text-secondary)',
        }}
      >
        {row.subject}
      </span>
      {deadline && (
        <span
          className="iil-mono"
          style={{
            flex: 'none',
            marginLeft: 'auto',
            font: '500 9.5px "JetBrains Mono", monospace',
            color: deadline.color,
          }}
        >
          {deadline.text}
        </span>
      )}
      {flagged && insight && (
        <span
          style={{
            flex: '1 1 160px',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            font: '400 11px/1.4 Inter, sans-serif',
            color: attentionInsightColor(attention),
          }}
        >
          {truncatePreview(insight, 70)}
        </span>
      )}
    </InteractiveRow>
  );
}

/** Calm "nothing here" line — matches the quiet awareness rows around it
 * rather than a full-page empty state, since a dashboard card is small. */
function CardEmpty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: 30,
        display: 'flex',
        alignItems: 'center',
        font: '400 12.5px/1.4 Inter, sans-serif',
        color: 'var(--text-faint)',
      }}
    >
      {children}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <ChevronRight
        size={11}
        strokeWidth={2.2}
        aria-hidden
        style={{ color: 'var(--text-faint)' }}
      />
      <Eyebrow>{children}</Eyebrow>
    </span>
  );
}

export default function Dashboard() {
  const store = useMailStore();
  const workflow = useWorkflowStore();
  const navigate = useNavigate();

  // Three dashboard areas, one-to-one against the three workflow pages
  // (Inbox stays the aggregate pool the headline/summary draw from, rather
  // than owning a fourth card) — each card is labeled with the page it
  // opens onto, so the source of every surfaced mail is unambiguous at a
  // glance rather than implied by a mood word.
  // Resolved items are excluded from all three cards — a completed approval no
  // longer "needs your decision", a passed opportunity isn't live, and neither
  // should compete for one of these cards' limited slots. They still count
  // toward the "handled" note below, which is the other half of the split.
  //
  // Completion is read off the STORE ROW, never off the workflow record. The
  // records used to be frozen module constants: resolving something at runtime wrote
  // `completedAt` onto the store row via `mailActions.complete`, and the seed
  // record it came from never hears about it. Filtering on the seed's own
  // `completedAt` therefore only ever caught items authored as already-done,
  // and left anything the user resolved *during the session* sitting in its
  // card as though still pending — while the headline counts below, which do
  // read the store, had already moved it to "handled". Same mail, two answers,
  // on one screen. `pendingMails` is where that's settled once for all three.
  const pendingMails = useCallback(
    <T,>(records: T[], resolve: (record: T) => CardMail | null): CardMail[] =>
      records
        .map(resolve)
        .filter((m): m is CardMail => m !== null && !m.row.completedAt),
    []
  );

  const approvalMails = useMemo<CardMail[]>(
    () =>
      rankAndTake(
        pendingMails(workflow.approvals, (a) => {
          const row = store.rows.find((r) => r.id === a.id);
          return row ? { row, insight: insightFor(row) } : null;
        }),
        5
      ),
    [workflow.approvals, store.rows, pendingMails]
  );

  const opportunityMails = useMemo<CardMail[]>(
    () =>
      rankAndTake(
        pendingMails(workflow.opportunities, (o) => {
          const row = store.rows.find((r) => r.id === o.id);
          return row ? { row, insight: insightFor(row) } : null;
        }),
        3
      ),
    [workflow.opportunities, store.rows, pendingMails]
  );

  const actionMails = useMemo<CardMail[]>(
    () =>
      // One flat, pending list — Actions' own five due-date tiers are derived
      // (from `dueDate`) inside `Actions.tsx`, not read off separate arrays
      // here, so Dashboard doesn't need to duplicate that bucketing just to
      // get "every still-open item".
      rankAndTake(
        pendingMails(workflow.actions, (item) => {
          if (!item.mailId) return null;
          const row = store.rows.find((r) => r.id === item.mailId);
          return row ? { row, insight: insightFor(row) } : null;
        }),
        3
      ),
    [workflow.actions, store.rows, pendingMails]
  );

  // Headline + background note read the whole mailbox, not just the three
  // cards above — the same superset Inbox itself is built on. `completedAt`
  // is the one completion signal every page's own "Completed" footer also
  // reads (see `mailStore.ts`'s `complete()`), so these counts and, say,
  // Actions' own completed count are filtered views of the same state, never
  // separate counters.
  //
  // `totalProcessed` IS `needAttention + handled.length` — a genuine
  // two-way partition, not a superset with a silent third bucket. "Processed
  // overnight" means the mail IIL actually DID something with: flagged it
  // for a decision, or resolved it outright. The much larger pile of mail
  // sitting in the store that IIL never flagged and nobody has completed —
  // ordinary inbox traffic nothing here has an opinion about — was never
  // "processed" in the sense this headline is making a claim about, so it
  // isn't counted in it.
  //
  // This used to headline `store.rows.length` (or, before that,
  // `store.rows.length - handled.length`) — the size of the WHOLE mailbox,
  // unrelated to either subset the rest of the sentence names. Both were
  // real counts, just of the wrong thing: a reader sees "X processed — Y
  // need attention" directly followed by "Z handled automatically" and
  // checks Y + Z against X, because that's the only reading the three
  // numbers sitting next to each other on one screen invite. Headlining
  // `store.rows.length` (every row that exists, most of it never evaluated
  // by IIL at all) could never satisfy that check no matter how it was
  // worded. Defining `totalProcessed` as the sum instead — rather than
  // independently filtering a third dataset — is what makes the identity
  // hold BY CONSTRUCTION, not by coincidence of today's demo data: it can't
  // drift out of sync with `needAttention`/`handled` because it's built
  // from them, not alongside them.
  const handled = store.rows.filter((r) => r.completedAt);
  // "N need your attention" — the count of rows with either attention axis
  // raised, from the same field every page's own header counts read.
  // Disjoint from `handled` by construction: completing a mail clears both
  // attention axes (`mailActions.complete`), so a resolved row can never
  // also carry `needsAttention`.
  const needAttention = store.rows.filter((r) =>
    needsAttention(r.attention)
  ).length;
  const totalProcessed = needAttention + handled.length;
  const highlightedHandled =
    handled.find((r) => r.completedNote?.includes('deadline')) ?? handled[0];

  const openApproval = (id: string) =>
    navigate('/approvals', { state: { openMailId: id } });
  const openOpportunity = (id: string) =>
    navigate('/opportunities', { state: { openMailId: id } });
  const openAction = (id: string) =>
    navigate('/actions', { state: { openMailId: id } });

  return (
    <WorkspacePage scale={1.1} className="iil-dashboard-shell">
      <Stagger style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Relief — the arrival. A luminous sentence over a soft gold glow. */}
        <Reveal>
          <div style={{ position: 'relative' }}>
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: -60,
                top: -46,
                width: 360,
                height: 180,
                pointerEvents: 'none',
                background:
                  'radial-gradient(circle, rgb(var(--gold-2) / 0.1), transparent 70%)',
                filter: 'blur(8px)',
              }}
            />
            <p
              style={{
                position: 'relative',
                margin: 0,
                maxWidth: '30ch',
                font: '300 clamp(23px, 2.9vw, 31px)/1.4 Inter, sans-serif',
                letterSpacing: '-0px',
                color: 'var(--text-strong)',
              }}
            >
              I went through {totalProcessed} email
              {totalProcessed === 1 ? '' : 's'} overnight —{' '}
              <span
                style={{
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  background: 'var(--gold-title-grad)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {needAttention > 0
                  ? `${needAttention} need${needAttention === 1 ? 's' : ''} your attention`
                  : 'nothing needs your attention'}
              </span>
              .
            </p>
          </div>
        </Reveal>

        {/* Approvals / Opportunities / Actions — the Approvals card claims
            the dominant left region; Opportunities and Actions stack in a
            narrower right column so weight is distributed across the
            workspace rather than concentrated in one vertical column. */}
        <Reveal>
          <div className="iil-dashboard-columns">
            <PageSection eyebrow={<SectionEyebrow>Approvals</SectionEyebrow>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {approvalMails.length > 0 ? (
                  approvalMails.map((m) => (
                    <MailAttentionRow
                      key={m.row.id}
                      mail={m}
                      onOpen={() => openApproval(m.row.id)}
                    />
                  ))
                ) : (
                  <CardEmpty>Nothing needs your decision right now.</CardEmpty>
                )}
              </div>
            </PageSection>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <section>
                <SectionEyebrow>Actions</SectionEyebrow>
                <div
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {actionMails.length > 0 ? (
                    actionMails.map((m) => (
                      <CompactMailRow
                        key={m.row.id}
                        mail={m}
                        onOpen={() => openAction(m.row.id)}
                      />
                    ))
                  ) : (
                    <CardEmpty>Nothing due — you're all caught up.</CardEmpty>
                  )}
                </div>
              </section>
              <section>
                <SectionEyebrow>Opportunities</SectionEyebrow>
                <div
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {opportunityMails.length > 0 ? (
                    opportunityMails.map((m) => (
                      <CompactMailRow
                        key={m.row.id}
                        mail={m}
                        onOpen={() => openOpportunity(m.row.id)}
                      />
                    ))
                  ) : (
                    <CardEmpty>No new opportunities right now.</CardEmpty>
                  )}
                </div>
              </section>
            </div>
          </div>
        </Reveal>
      </Stagger>

      {/* Automated-activity note — its own bottom region, structurally
          separate from the three-zone dashboard above (not just a trailing
          content row). Deliberately outside the flex: 1 content group so it
          sits below whatever spare room that group leaves, anchored toward
          the bottom of the visible panel rather than following on directly. */}
      <Reveal>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingTop: 18,
            borderTop: '1px solid rgb(var(--ink) / 0.06)',
          }}
        >
          {/* A subset callout of the headline's own total, not an addition to
              it — dropped "more" deliberately: the headline already counts
              these rows (they're part of `totalProcessed`), so saying "more"
              implied a remainder on top of a number that already included
              them. The zero case gets its own wording rather than printing
              "0 handled" — a count of nothing isn't a fact worth stating as
              one. */}
          <Eyebrow>
            {handled.length === 0
              ? 'nothing else needed handling'
              : `${handled.length} handled automatically`}
          </Eyebrow>
          {highlightedHandled?.completedNote && (
            <>
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: '50%',
                  flex: 'none',
                  background: 'rgb(var(--ink) / 0.25)',
                }}
              />
              <span
                className="iil-eyebrow"
                style={{ color: 'var(--gold-ink)' }}
              >
                including {highlightedHandled.completedNote}
              </span>
            </>
          )}
          <button
            type="button"
            className="iil-icon-btn iil-chip-btn"
            onClick={() => navigate('/inbox')}
            style={
              {
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                font: '400 11px/1 Inter, sans-serif',
                '--chip-color': 'var(--text-muted)',
              } as CSSProperties
            }
          >
            View all
            <ChevronDown size={13} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </Reveal>
    </WorkspacePage>
  );
}
