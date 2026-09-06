/**
 * A living style guide for the shared workspace foundation — deliberately
 * kept, not a Phase 1 scaffold scheduled for deletion once the product pages
 * shipped (they have; this stayed).
 *
 * It renders the Page Template and every core shared component inside the
 * real AppShell, in both themes, with none of a product page's business
 * logic or demo data in the way — the one place a future engineer can see
 * every reusable piece (rows, panels, dropdowns, attention states, the
 * `PageHeader`/`.obligo-title` treatment that predates and differs from the
 * six real pages' own 20px `--type-page-title`) without hunting through
 * Actions/Approvals/etc. for a live example. Reachable at `/foundation`,
 * intentionally absent from the sidebar and from `MAIL_VIEWS` — it is a
 * development surface, not a workflow, and does not belong in Quick Access.
 */
import { type ReactNode, useState } from 'react';
import { ArrowRight, Inbox as InboxIcon } from 'lucide-react';
import {
  attentionMetaColor,
  attentionVisual,
  attentionWeight,
  AttentionDot,
  AttentionRail,
  Button,
  Chip,
  ConfirmDialog,
  Divider,
  EmptyState,
  Eyebrow,
  GoldDot,
  isTinted,
  PageHeader,
  PageSection,
  Panel,
  Reveal,
  Select,
  ShelfHeading,
  Slider,
  Tag,
  Toggle,
  WorkspacePage,
} from '../../components/workspace';
import { ATTENTION_STATES } from '../../lib/attention';

const TONE_OPTIONS = ['Neutral', 'Warm', 'Direct', 'Formal'];
const CLEANUP_OPTIONS = ['Keep', 'Archive', 'Spam', 'Delete'];

/** A label + control row, embedded like the Settings tables (Reference §24). */
function SettingRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 46,
        padding: '4px 4px 4px 14px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <span
        style={{ font: '400 13px/1.3 Inter, sans-serif', color: 'var(--text)' }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

export default function Foundation() {
  const [tone, setTone] = useState('Neutral');
  const [cleanup, setCleanup] = useState('Keep');
  const [beta, setBeta] = useState(false);
  const [weight, setWeight] = useState(5);
  const [category, setCategory] = useState('Primary');
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <WorkspacePage>
      <Reveal>
        <PageHeader
          eyebrow="Phase 1 · Shared foundation"
          title="Workspace foundation"
          description="A living reference for the shared systems every Sprint 1 page inherits — page template, motion, surfaces and controls. Toggle the theme in the topbar to check dark/light parity."
          action={
            <Button variant="primary">
              Primary action
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Button>
          }
        />
      </Reveal>

      {/* Surfaces */}
      <Reveal>
        <PageSection
          eyebrow="Surfaces"
          description="The glass Panel is the primary content surface; depth comes from the shared elevation system."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            <Panel padding={20}>
              <ShelfHeading>Static panel</ShelfHeading>
              <p
                style={{
                  margin: '8px 0 0',
                  font: '400 12.5px/1.6 Inter, sans-serif',
                  color: 'var(--text-secondary)',
                }}
              >
                Grounded surface for information that isn't interactive.
              </p>
            </Panel>
            <Panel padding={20} interactive>
              <ShelfHeading>Interactive panel</ShelfHeading>
              <p
                style={{
                  margin: '8px 0 0',
                  font: '400 12.5px/1.6 Inter, sans-serif',
                  color: 'var(--text-secondary)',
                }}
              >
                Hover me — the shared lift acknowledges the cursor without
                theatrics.
              </p>
            </Panel>
          </div>
        </PageSection>
      </Reveal>

      {/* Controls — embedded table pattern */}
      <Reveal>
        <PageSection
          eyebrow="Controls"
          description="Dropdowns, toggles and sliders read as part of the surface, not boxed inputs."
        >
          <Panel padding={6}>
            <SettingRow label="Reply tone">
              <Select
                value={tone}
                options={TONE_OPTIONS}
                onChange={setTone}
                ariaLabel="Reply tone"
                align="right"
              />
            </SettingRow>
            <SettingRow label="Promotions">
              <Select
                value={cleanup}
                options={CLEANUP_OPTIONS}
                onChange={setCleanup}
                ariaLabel="Promotions handling"
                align="right"
              />
            </SettingRow>
            <SettingRow label="Beta features">
              <Toggle checked={beta} onChange={setBeta} label="Beta features" />
            </SettingRow>
            <SettingRow label="Career weight" last>
              <div style={{ width: 260 }}>
                <Slider label="Career" value={weight} onChange={setWeight} />
              </div>
            </SettingRow>
          </Panel>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 16,
            }}
          >
            <Button variant="primary">Filled</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              Open confirmation
            </Button>
          </div>
        </PageSection>
      </Reveal>

      {/* Signals & labels */}
      <Reveal>
        <PageSection
          eyebrow="Attention"
          description="Two independent axes, one meaning each, everywhere: red = act soon (urgency), gold = this matters (importance). The surface carries urgency; the single dot carries importance, falling back to coral when a row is urgent but not important — so a coral row with a gold dot is both. Normal is not 'unimportant', and every state reads at full contrast."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* All four combinations, in rank order. These are not four levels
                — they're the four ways two independent booleans can land, and
                each row's treatment is derived from the pair, not looked up
                from its label. Note the first row: a coral surface with a gold
                dot is how "urgent AND important" reads — no extra badge, no
                third dot. */}
            {ATTENTION_STATES.map((state) => (
              <div
                key={state.key}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 14px',
                  paddingLeft: isTinted(state.attention) ? 17 : 14,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background:
                    attentionVisual(state.attention, 'card').bg ??
                    'transparent',
                  boxShadow: `inset 0 0 0 1px ${attentionVisual(state.attention, 'card').border ?? 'rgb(var(--ink) / 0.06)'}`,
                }}
              >
                <AttentionRail attention={state.attention} />
                {/* Every mark at once, so the separation is visible in the
                    guide itself: the neutral unread dot never takes an
                    attention color, and the coral and gold dots coexist. */}
                <AttentionDot attention={state.attention} unread />
                <span
                  style={{
                    font: `${attentionWeight(state.attention)} 13px/1 Inter, sans-serif`,
                    color: 'var(--text-strong)',
                    minWidth: 130,
                  }}
                >
                  {state.label}
                </span>
                <span
                  style={{
                    font: '400 12px/1.4 Inter, sans-serif',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Real email content — same contrast in every state.
                </span>
                <span
                  className="obligo-mono"
                  style={{
                    marginLeft: 'auto',
                    font: '500 10px "JetBrains Mono", monospace',
                    color: attentionMetaColor(state.attention),
                  }}
                >
                  attention metadata
                </span>
              </div>
            ))}
          </div>
        </PageSection>
      </Reveal>

      <Reveal>
        <PageSection
          eyebrow="Other signals"
          description="Read state, inbox category and mono labels — separate dimensions from attention, never substitutes for it."
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AttentionDot unread />
              <span
                style={{
                  font: '400 13px/1 Inter, sans-serif',
                  color: 'var(--text)',
                }}
              >
                Unread (always neutral)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GoldDot size={8} glow />
              <span
                style={{
                  font: '500 13px/1 Inter, sans-serif',
                  color: 'var(--gold-ink)',
                }}
              >
                Obligo brand mark
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {['Primary', 'Updates', 'Promotions'].map((c) => (
                <Chip
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </Chip>
              ))}
            </div>
            <Tag>mono tag</Tag>
            <Eyebrow>Mono eyebrow</Eyebrow>
          </div>
        </PageSection>
      </Reveal>

      <Reveal>
        <Divider />
      </Reveal>

      {/* Accent header + empty state */}
      <Reveal>
        <PageSection eyebrow="Page title, accent variant">
          {/* Kept as a reference sample of the primitive, but no longer as a
              recommendation: as of V1.0 no shipped page renders it. Approvals
              was the only one, and its heading moved to the standard
              page-title colour every other workspace page uses — wayfinding
              shouldn't be the one place gold means something other than
              "important". The variant stays available rather than being
              deleted out from under `PageHeader`'s documented `accent` prop;
              the caption is what changed, so this page can't read as
              endorsing a treatment the product has stepped away from. */}
          <PageHeader
            accent
            title="Approvals"
            description="Reserved, and currently unused — every shipped page title uses the standard treatment above. Kept here as a reference for the accent variant itself."
          />
        </PageSection>
      </Reveal>

      <Reveal>
        <PageSection eyebrow="Empty state">
          <Panel padding={0}>
            <EmptyState
              icon={<InboxIcon size={26} strokeWidth={1.5} />}
              title="Nothing needs you right now"
              description="When Obligo surfaces something that requires a decision, it will appear here. Everything handled automatically stays out of your way."
              action={<Button variant="outline">Review handled items</Button>}
            />
          </Panel>
        </PageSection>
      </Reveal>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset to defaults?"
        message="This returns every tuning preference to its original state. You can retune anything afterward."
        confirmLabel="Reset"
        onConfirm={() => setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
      />
    </WorkspacePage>
  );
}
