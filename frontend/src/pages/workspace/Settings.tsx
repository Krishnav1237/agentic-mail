import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, ChevronRight, Check, GripVertical, Trash2 } from 'lucide-react';
import {
  attentionMetaColor,
  AttentionDot,
  AttentionRail,
  attentionVisual,
  attentionWeight,
  Button,
  Chip,
  ConfirmDialog,
  Group,
  InteractiveRow,
  Panel,
  PageSection,
  Reveal,
  Select,
  ShelfHeading,
  Stagger,
  TelegramIntegrationModal,
  Toggle,
  WorkspacePage,
} from '../../components/workspace';
import {
  ATTENTION_STATES,
  needsAttention,
  type Attention,
} from '../../lib/attention';
import { useAtmosphereVisible } from '../../lib/useAtmosphereVisible';
import { useQuickAccess } from '../../lib/useQuickAccess';
import { mailViewById } from '../../lib/mailViews';
import {
  AUTOMATION_BY_LABEL,
  CLEANUP_BY_LABEL,
  FOLLOWUP_BY_LABEL,
  labelForValue,
  REPLY_DRAFTING_BY_LABEL,
  REPLY_TONE_BY_LABEL,
  settings,
  TOPIC_BY_LABEL,
  valueForLabel,
} from '../../lib/workspaceData';
import {
  PRIORITY_TOPICS,
  type AutomationLevel,
  type CleanupCategory,
  type PriorityTopic,
} from '../../lib/agentPreferences';
import {
  IMPORTANCE_COLOR_OPTIONS,
  URGENCY_COLOR_OPTIONS,
  type AttentionColorOption,
} from '../../lib/attentionColors';
import { settingsActions, useAgentSettings } from '../../lib/settingsStore';

/**
 * Settings — the one page that is configuration, not correspondence (Reference
 * §24-25). Every other workspace page shows the user their mail; this one
 * shows them the rules IIL follows while doing that, so its identity is a
 * settings form rather than a stream of records: embedded label+control rows
 * inside a `Panel`, not cards, not a search bar — there's nothing to browse
 * or filter here, just a fixed, known list of settings.
 *
 * The skeleton is still the shared one throughout: `WorkspacePage`/`Stagger`/
 * `Reveal` for the page shell, the same plain inline `<h1>` title treatment
 * Inbox/Actions/Opportunities/Approvals all use (not the larger gradient
 * `PageHeader`, which none of those pages render either) plus `PageSection`
 * for section rhythm, `ShelfHeading` for every section title (the exact same
 * component/weight/size/alpha Actions/Opportunities/Approvals use for their
 * own subheaders — Settings does not get its own font), the actual `Select`/
 * `Toggle` controls instead of hand-rolled pickers, and the shared
 * `Group` primitive for "Advanced" — the one section on this page that
 * behaves like every other page's collapsible tier (closed by default here,
 * since it's settings most people never touch, rather than the default-open
 * tiers Actions/Opportunities use for their everyday content).
 */

/** A label + control row, embedded like Foundation's own Settings reference
 * (`SettingRow`) — the row is not a button; the interaction lives entirely
 * in whichever control (`Select`/`Toggle`) sits on the right. */
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

/** The single row inside "Integrations" — a navigation-style row (trailing
 * chevron, no label+control split) rather than a `SettingRow`, since it
 * doesn't hold a value itself; it opens the integration manager modal. See
 * Part 1 of the integrations spec for why this stays a compact Settings
 * entry rather than a dedicated page or sidebar item. */
function IntegrationsRow({ onClick }: { onClick: () => void }) {
  return (
    <InteractiveRow
      onClick={onClick}
      visual={{ hoverBg: 'rgb(var(--ink) / 0.03)' }}
      style={{
        justifyContent: 'space-between',
        minHeight: 46,
        padding: '4px 10px 4px 14px',
        borderRadius: 10,
      }}
    >
      <span
        style={{ font: '400 13px/1.3 Inter, sans-serif', color: 'var(--text)' }}
      >
        Integrations
      </span>
      <ChevronRight
        size={15}
        strokeWidth={1.75}
        aria-hidden
        style={{ color: 'var(--text-faint)' }}
      />
    </InteractiveRow>
  );
}

/**
 * Shared move control for every two-column transfer pattern on this page —
 * Priorities' High/Lower transfer and Quick Access's add/remove between
 * Available and the sidebar list. One control, one hit target, one hover
 * language, so a future third instance of this pattern reuses it instead of
 * hand-rolling another arrow button. A real icon in a sized, rounded hit area
 * reads as interactive at a glance while staying quiet at rest — plain arrow
 * characters at 12px didn't clear that bar.
 */
function TransferArrow({
  direction,
  onClick,
  ariaLabel,
}: {
  direction: 'left' | 'right';
  onClick: () => void;
  ariaLabel: string;
}) {
  const Icon = direction === 'right' ? ArrowRight : ArrowLeft;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="iil-icon-btn iil-transfer-arrow"
    >
      <Icon size={16} strokeWidth={2} aria-hidden />
    </button>
  );
}

/**
 * One row inside High priority — draggable (via the grip handle only, so it
 * doesn't fight with the arrow button's own click) for reordering, plus a →
 * to send it back to Lower priority. Deliberately the same shape as
 * `QuickAccessRow` below: only High priority reorders by drag, Lower is a
 * plain list, and the arrow is the sole way to move a category between the
 * two — reordering and membership are two different gestures, never
 * conflated into one.
 */
function PriorityTopicRow({
  topic,
  last,
  onMove,
}: {
  topic: PriorityTopic;
  last: boolean;
  onMove: () => void;
}) {
  const label = labelForValue(TOPIC_BY_LABEL, topic);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topic });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: DndCSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 42,
        padding: '4px 4px 4px 4px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          flex: 'none',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <GripVertical
          size={13}
          strokeWidth={1.75}
          aria-hidden
          style={{ color: 'var(--text-faint)' }}
        />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: '400 13px/1.3 Inter, sans-serif',
          color: 'var(--text)',
        }}
      >
        {label}
      </span>
      <TransferArrow
        direction="right"
        onClick={onMove}
        ariaLabel={`Move ${label} to lower priority`}
      />
    </div>
  );
}

/** Non-interactive preview rendered in the `DragOverlay` while a High
 * priority row is being dragged — same reasoning as `QuickAccessDragPreview`
 * (it isn't clipped by `Panel`'s own bounds the way an in-flow row would
 * be). */
function PriorityDragPreview({ topic }: { topic: PriorityTopic }) {
  const label = labelForValue(TOPIC_BY_LABEL, topic);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 42,
        padding: '4px 4px 4px 4px',
        borderRadius: 8,
        background: 'var(--overlay)',
        border: '1px solid var(--overlay-border)',
        boxShadow: 'var(--overlay-shadow)',
        cursor: 'grabbing',
      }}
    >
      <GripVertical
        size={13}
        strokeWidth={1.75}
        aria-hidden
        style={{ flex: 'none', color: 'var(--text-faint)' }}
      />
      <span
        style={{ font: '400 13px/1.3 Inter, sans-serif', color: 'var(--text)' }}
      >
        {label}
      </span>
    </div>
  );
}

/** One row inside Lower priority — a plain, non-draggable list; the ← is the
 * only way to move a topic into High priority. Row-reverse + right-aligned
 * label mirrors `AvailableRow`'s own "not pinned" side exactly. */
function LowPriorityRow({
  topic,
  last,
  onMove,
}: {
  topic: PriorityTopic;
  last: boolean;
  onMove: () => void;
}) {
  const label = labelForValue(TOPIC_BY_LABEL, topic);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 10,
        minHeight: 42,
        padding: '4px 4px 4px 4px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'right',
          font: '400 13px/1.3 Inter, sans-serif',
          color: 'var(--text-secondary)',
        }}
      >
        {label}
      </span>
      <TransferArrow
        direction="left"
        onClick={onMove}
        ariaLabel={`Move ${label} to high priority`}
      />
    </div>
  );
}

/**
 * High priority (ordered, drag-to-reorder — top is most important) / Lower
 * priority (unordered remainder) picker — the entire fine-grained-weights
 * system replaced by exactly this, matching Quick Access's own
 * sortable/plain two-column shape (`QuickAccessSection` below) rather than
 * inventing a second drag-and-drop pattern. `high` is the one thing that
 * actually matters to `isHighPriorityTopic`/`applyTopicPriority`; `low` is
 * everything else, derived rather than stored, since a category not in
 * `high` needs no rank or record of its own.
 */
function PrioritiesSection({ high }: { high: PriorityTopic[] }) {
  const low = PRIORITY_TOPICS.filter((t) => !high.includes(t));
  const [activeTopic, setActiveTopic] = useState<PriorityTopic | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    })
  );

  const moveToLow = (topic: PriorityTopic) =>
    settingsActions.update({
      highPriorityTopics: high.filter((t) => t !== topic),
    });
  const moveToHigh = (topic: PriorityTopic) =>
    settingsActions.update({ highPriorityTopics: [...high, topic] });

  const onDragStart = (event: DragStartEvent) =>
    setActiveTopic(event.active.id as PriorityTopic);

  // Reordering only — High priority is the only sortable list, exactly like
  // Quick Access; membership changes go through the arrow buttons instead.
  const onDragEnd = (event: DragEndEvent) => {
    setActiveTopic(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = high.indexOf(active.id as PriorityTopic);
    const toIndex = high.indexOf(over.id as PriorityTopic);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...high];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, active.id as PriorityTopic);
    settingsActions.update({ highPriorityTopics: next });
  };

  return (
    <div className="iil-quick-access-columns">
      <div>
        <span className="iil-eyebrow" style={{ color: 'var(--text-faint)' }}>
          High priority
        </span>
        <p
          style={{
            font: '400 11.5px/1.5 Inter, sans-serif',
            color: 'var(--text-faint)',
            margin: '4px 0 10px',
          }}
        >
          Most important first — drag to reorder, or use the arrow to move a
          category to Lower priority.
        </p>
        <DndContext
          sensors={sensors}
          // Same reasoning as Quick Access's own `DndContext` below:
          // `closestCenter` measured stale rects inside this app's nested
          // `position: fixed` / `container-type` shell and silently snapped
          // drops back; `pointerWithin` tests the live pointer position
          // instead and reorders correctly regardless of scroll position.
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTopic(null)}
          autoScroll={false}
        >
          <SortableContext items={high} strategy={verticalListSortingStrategy}>
            <Panel padding={6} style={{ minHeight: 52 }}>
              {high.length === 0 ? (
                <div
                  style={{
                    padding: '10px 4px',
                    font: '400 12px Inter, sans-serif',
                    color: 'var(--text-faint)',
                  }}
                >
                  Nothing pinned — use the arrow on a category in Lower
                  priority.
                </div>
              ) : (
                high.map((topic, i) => (
                  <PriorityTopicRow
                    key={topic}
                    topic={topic}
                    last={i === high.length - 1}
                    onMove={() => moveToLow(topic)}
                  />
                ))
              )}
            </Panel>
          </SortableContext>
          <DragOverlay>
            {activeTopic ? <PriorityDragPreview topic={activeTopic} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div style={{ textAlign: 'right' }}>
        <span className="iil-eyebrow" style={{ color: 'var(--text-faint)' }}>
          Lower priority
        </span>
        <p
          style={{
            font: '400 11.5px/1.5 Inter, sans-serif',
            color: 'var(--text-faint)',
            margin: '4px 0 10px',
          }}
        >
          Use the arrow to move a category up to High priority.
        </p>
        <Panel padding={6} style={{ minHeight: 52 }}>
          {low.length === 0 ? (
            <div
              style={{
                padding: '10px 4px',
                font: '400 12px Inter, sans-serif',
                color: 'var(--text-faint)',
              }}
            >
              Every category is high priority.
            </div>
          ) : (
            low.map((topic, i) => (
              <LowPriorityRow
                key={topic}
                topic={topic}
                last={i === low.length - 1}
                onMove={() => moveToHigh(topic)}
              />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------- Attention colors ---------------------------- */

/**
 * One axis of the attention-colour picker: a label, then its five options as
 * a radiogroup.
 *
 * A RADIOGROUP, NOT FIVE BUTTONS. Five toggle buttons would each announce
 * their own pressed state and give the keyboard five stops for what is one
 * decision; `role="radiogroup"` with roving `tabIndex` gives it one stop and
 * arrow-key movement between options, which is the model a user already has
 * for "pick exactly one of these".
 *
 * SELECTION IS NEVER CARRIED BY COLOUR ALONE. The selected option gets a
 * ring, a filled surface AND a check mark over its swatch — so it is
 * identifiable without perceiving the swatch's hue at all, which matters
 * rather a lot on a control whose entire subject is colour. `aria-checked`
 * carries the same fact to assistive tech.
 *
 * The swatch renders the option's real token (see `attentionColors.ts`), so
 * what a user previews is what the application will actually paint — the
 * picker cannot drift from the palette it is picking from.
 */
function AttentionColorPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: AttentionColorOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  /** Arrow keys move the selection, wrapping at both ends — the standard
   * radiogroup model, where moving focus and choosing are the same act. */
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.key === value);
    const next = options[(i + delta + options.length) % options.length];
    if (next) onChange(next.key);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        minHeight: 46,
        padding: '4px 4px 4px 14px',
      }}
    >
      <span
        style={{ font: '400 13px/1.3 Inter, sans-serif', color: 'var(--text)' }}
      >
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={`${label} color`}
        onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
      >
        {options.map((option) => {
          const selected = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              // Roving tabIndex: one tab stop for the whole group, landing on
              // whichever option is currently chosen.
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.key)}
              className="iil-swatch-option"
              data-selected={selected}
            >
              <span
                aria-hidden
                className="iil-swatch-option__chip"
                style={{ background: option.swatch }}
              >
                {selected && <Check size={11} strokeWidth={3} aria-hidden />}
              </span>
              <span className="iil-swatch-option__label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The three attention states this preview can show, in the order the control
 * offers them.
 *
 * DERIVED, NOT AUTHORED. The `Attention` values and their user-facing labels
 * both come from `ATTENTION_STATES` — the product's one enumeration of the
 * four combinations — so this control cannot end up calling a state something
 * the rest of the app doesn't, and no `{ urgency: 'urgent', ... }` literal is
 * written here. Only the ORDER is local, and only because no ordering the
 * attention model already defines produces it: `attentionRank` runs
 * loudest-first (both → urgent → important), and this control reads better
 * building up to the combined state than leading with it.
 *
 * `normal` is excluded by `needsAttention`, not by name — a state with neither
 * axis raised has no attention colour to preview, which is the definition of
 * the thing being previewed rather than a fact about which keys exist.
 */
const PREVIEW_STATE_ORDER = ['urgent', 'important', 'urgent-important'];
const PREVIEW_STATES = PREVIEW_STATE_ORDER.map(
  (key) =>
    ATTENTION_STATES.filter((s) => needsAttention(s.attention)).find(
      (s) => s.key === key
    )!
);

/**
 * A single compact mail row, rendered in whichever attention state the user is
 * currently inspecting — so "what does Magenta urgency actually look like" is
 * answerable without leaving Settings.
 *
 * IT IS THE REAL THING, NOT A PICTURE OF IT. Every visual decision here is
 * delegated to the same functions Inbox's own rows call —
 * `attentionVisual(…, 'row')` for the wash and ring, `AttentionRail` for the
 * leading bar, `AttentionDot` for the mark, `attentionWeight` for the sender's
 * emphasis. Those resolve to the `--attention-*` tokens, which resolve to
 * whatever pigment the store currently holds. So this preview cannot show a
 * colour the application wouldn't, cannot drift when the palette is retuned,
 * and needs no subscription of its own: changing a swatch above rewrites the
 * token on `.iil-root` and every one of these values repaints with it.
 *
 * `'row'` density on purpose — Inbox's stream is the canonical treatment (it
 * is what the card density was normalised to), so this previews the weight the
 * user will actually meet most often.
 *
 * Deliberately NOT an `InteractiveRow`: this demonstrates a row, it isn't one.
 * Giving it button semantics would put a keyboard stop on something with
 * nothing to activate. The surface recipe it would have supplied is two
 * properties, applied directly below from the same `RowVisual`.
 */
function AttentionPreviewRow({ attention }: { attention: Attention }) {
  const visual = attentionVisual(attention, 'row');
  return (
    <div
      style={{
        position: 'relative',
        // `overflow: hidden` so the rail clips to the radius, exactly as a
        // tinted row does on every page.
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 8,
        background: visual.bg,
        // The same inset ring `.iil-action-row` draws — never a real border,
        // which would change the box's size between states.
        boxShadow: `inset 0 0 0 1px ${visual.border ?? 'transparent'}`,
        transition: 'background .2s ease, box-shadow .2s ease',
      }}
    >
      <AttentionRail attention={attention} />
      <AttentionDot attention={attention} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              flex: 'none',
              font: `${attentionWeight(attention)} 12.5px Inter, sans-serif`,
              color: 'var(--text)',
            }}
          >
            Demo sender
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              font: '400 12.5px Inter, sans-serif',
              color: 'var(--text-secondary)',
            }}
          >
            Demo subject
          </span>
          <span
            className="iil-mono"
            style={{
              flex: 'none',
              font: '400 10.5px "JetBrains Mono", monospace',
              color: 'var(--text-muted)',
            }}
          >
            1h
          </span>
        </div>
        {/* The attention-metadata line — the one place a coral/gold TEXT
            colour is sanctioned, and the reason it's here: the pigment shows
            up as more than a wash, which is how it appears on real rows. */}
        <div
          style={{
            marginTop: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            font: '400 11px Inter, sans-serif',
            color: attentionMetaColor(attention),
          }}
        >
          This is a preview of how attention colors appear.
        </div>
      </div>
    </div>
  );
}

/**
 * The preview block: one demo row plus the control that switches which state
 * it is showing.
 *
 * ONE ROW, THREE STATES — not three rows. Three side-by-side samples would be
 * a legend, and a legend invites comparing the samples with each other; a
 * single row that changes invites comparing it with the mail the user already
 * knows. It is also a third of the height on a page where this is a
 * confirmation, not the subject.
 *
 * Which state is showing is ordinary component state, and stays that way. It
 * is a place the user is looking, not a preference they are setting — nothing
 * about the product behaves differently tomorrow because this was left on
 * "Important", so it has no business in the persisted settings object.
 */
function AttentionPreview() {
  const [stateKey, setStateKey] = useState(PREVIEW_STATES[0].key);
  const active =
    PREVIEW_STATES.find((s) => s.key === stateKey) ?? PREVIEW_STATES[0];

  return (
    <div style={{ padding: '12px 14px 14px' }}>
      <ShelfHeading alpha={0.6} size={12}>
        Preview
      </ShelfHeading>
      <div style={{ marginTop: 8 }}>
        <AttentionPreviewRow attention={active.attention} />
      </div>
      <div
        role="radiogroup"
        aria-label="Preview attention state"
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginTop: 10,
        }}
      >
        {PREVIEW_STATES.map((s) => (
          // `Chip` is the product's existing compact multiple-choice control
          // (Inbox's category row) — reused rather than a second segmented
          // control invented for this one block. `role="radio"` because these
          // are three views of one thing, not three independent toggles.
          <Chip
            key={s.key}
            active={s.key === stateKey}
            role="radio"
            aria-checked={s.key === stateKey}
            onClick={() => setStateKey(s.key)}
          >
            {s.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Quick Access ------------------------------ */

/**
 * One row inside Quick Access — draggable (via the grip handle only, so it
 * doesn't fight with the arrow button's own click) for reordering, plus a →
 * to send it back to Available. Only Quick Access reorders; Available is a
 * plain, non-draggable list — the arrow is the sole way to move a view
 * between the two columns, and this handle is the sole way to reorder.
 */
function QuickAccessRow({
  id,
  last,
  onRemove,
}: {
  id: string;
  last: boolean;
  onRemove: () => void;
}) {
  const view = mailViewById(id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  if (!view) return null;
  const Icon = view.icon;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: DndCSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 42,
        padding: '4px 4px 4px 4px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${view.label}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          flex: 'none',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <GripVertical
          size={13}
          strokeWidth={1.75}
          aria-hidden
          style={{ color: 'var(--text-faint)' }}
        />
      </span>
      <Icon
        size={15}
        strokeWidth={1.75}
        aria-hidden
        style={{ flex: 'none', color: 'var(--text-muted)' }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: '400 13px/1.3 Inter, sans-serif',
          color: 'var(--text)',
        }}
      >
        {view.label}
      </span>
      <TransferArrow
        direction="right"
        onClick={onRemove}
        ariaLabel={`Remove ${view.label} from Quick Access`}
      />
    </div>
  );
}

/** Non-interactive preview rendered in the `DragOverlay` — floats above the
 * list while a row is being dragged, since it isn't clipped by `Panel`'s own
 * bounds the way an in-flow row would be. */
function QuickAccessDragPreview({ id }: { id: string }) {
  const view = mailViewById(id);
  if (!view) return null;
  const Icon = view.icon;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 42,
        padding: '4px 4px 4px 4px',
        borderRadius: 8,
        background: 'var(--overlay)',
        border: '1px solid var(--overlay-border)',
        boxShadow: 'var(--overlay-shadow)',
        cursor: 'grabbing',
      }}
    >
      <GripVertical
        size={13}
        strokeWidth={1.75}
        aria-hidden
        style={{ flex: 'none', color: 'var(--text-faint)' }}
      />
      <Icon
        size={15}
        strokeWidth={1.75}
        aria-hidden
        style={{ flex: 'none', color: 'var(--text-muted)' }}
      />
      <span
        style={{ font: '400 13px/1.3 Inter, sans-serif', color: 'var(--text)' }}
      >
        {view.label}
      </span>
    </div>
  );
}

/** One row inside Available — a plain, non-draggable list; the ← is the only
 * way to move a view into Quick Access. Row-reverse + right-aligned label
 * mirrors `PriorityRow`'s own "lower priority" side exactly. */
function AvailableRow({
  id,
  last,
  onAdd,
}: {
  id: string;
  last: boolean;
  onAdd: () => void;
}) {
  const view = mailViewById(id);
  if (!view) return null;
  const Icon = view.icon;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 10,
        minHeight: 42,
        padding: '4px 4px 4px 4px',
        borderBottom: last ? 'none' : '1px solid rgb(var(--ink) / 0.06)',
      }}
    >
      <Icon
        size={15}
        strokeWidth={1.75}
        aria-hidden
        style={{ flex: 'none', color: 'var(--text-muted)' }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'right',
          font: '400 13px/1.3 Inter, sans-serif',
          color: 'var(--text-secondary)',
        }}
      >
        {view.label}
      </span>
      <TransferArrow
        direction="left"
        onClick={onAdd}
        ariaLabel={`Add ${view.label} to Quick Access`}
      />
    </div>
  );
}

function QuickAccessSection() {
  const { quickAccess, available, moveItem } = useQuickAccess();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    })
  );
  const onDragStart = (event: DragStartEvent) =>
    setActiveId(String(event.active.id));

  // Reordering only — Quick Access is the only sortable list, so this is a
  // plain single-container drag; membership changes go through the arrow
  // buttons instead, never through dragging into/out of this list.
  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const overIndex = quickAccess.indexOf(String(over.id));
    if (overIndex === -1) return;
    moveItem(String(active.id), 'quickAccess', overIndex);
  };

  return (
    <div className="iil-quick-access-columns">
      <div>
        <span className="iil-eyebrow" style={{ color: 'var(--text-faint)' }}>
          Visible in navigation
        </span>
        <p
          style={{
            font: '400 11.5px/1.5 Inter, sans-serif',
            color: 'var(--text-faint)',
            margin: '4px 0 10px',
          }}
        >
          Appears in the main sidebar, in this order — drag to reorder, or use
          the arrow to remove.
        </p>
        <DndContext
          sensors={sensors}
          // `closestCenter` compares droppable rects against the dragged
          // item's own measured rect, which goes stale once the page has
          // been scrolled before the drag starts — inside this app's nested
          // `position: fixed` / `container-type` shell (`.iil-canvas` /
          // `.iil-scroll`), that measurement error was large enough that
          // `over` never left the row the drag started on, so a drop always
          // silently snapped back. `pointerWithin` instead tests the live
          // pointer position against each droppable's rect every move —
          // verified (via a scripted Playwright drag, at several scroll
          // depths) to reorder correctly regardless of scroll position.
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
          // Same nested-fixed-container layout confuses dnd-kit's auto-scroll
          // edge-detection, which was yanking the page to the top the instant
          // a drag started. This list is short and never needs auto-scrolling,
          // so disabling it outright removes the misbehavior.
          autoScroll={false}
        >
          <SortableContext
            items={quickAccess}
            strategy={verticalListSortingStrategy}
          >
            <Panel padding={6} style={{ minHeight: 52 }}>
              {quickAccess.length === 0 ? (
                <div
                  style={{
                    padding: '10px 4px',
                    font: '400 12px Inter, sans-serif',
                    color: 'var(--text-faint)',
                  }}
                >
                  Nothing pinned — use the arrow on a view in Available.
                </div>
              ) : (
                quickAccess.map((id, i) => (
                  <QuickAccessRow
                    key={id}
                    id={id}
                    last={i === quickAccess.length - 1}
                    onRemove={() => moveItem(id, 'available', available.length)}
                  />
                ))
              )}
            </Panel>
          </SortableContext>
          <DragOverlay>
            {activeId ? <QuickAccessDragPreview id={activeId} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div style={{ textAlign: 'right' }}>
        <span className="iil-eyebrow" style={{ color: 'var(--text-faint)' }}>
          Available
        </span>
        <p
          style={{
            font: '400 11.5px/1.5 Inter, sans-serif',
            color: 'var(--text-faint)',
            margin: '4px 0 10px',
          }}
        >
          Not shown in the sidebar — use the arrow to add it to Quick Access.
        </p>
        <Panel padding={6} style={{ minHeight: 52 }}>
          {available.length === 0 ? (
            <div
              style={{
                padding: '10px 4px',
                font: '400 12px Inter, sans-serif',
                color: 'var(--text-faint)',
              }}
            >
              Every view is pinned to Quick Access.
            </div>
          ) : (
            available.map((id, i) => (
              <AvailableRow
                key={id}
                id={id}
                last={i === available.length - 1}
                onAdd={() => moveItem(id, 'quickAccess', quickAccess.length)}
              />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

const PERSONALIZED_TONE_HINT =
  'Personalized learns from your previous replies and uses your writing style to prepare drafts that sound more like you.';

export default function Settings() {
  /**
   * Every mail-affecting control on this page reads and writes the shared
   * preferences store — not local `useState`, which is what it used to do and
   * why none of them did anything. The store is what the mail store reacts
   * to, and what a backend `PUT /preferences` will carry; this page is now
   * purely the editor for it.
   *
   * Values are TYPED in the store and rendered as LABELS here, mapped through
   * `*_BY_LABEL` in `workspaceData`. `Select` speaks strings, the wire speaks
   * enums, and neither leaks into the other.
   */
  const prefs = useAgentSettings();
  const [atmosphereVisible, setAtmosphereVisible] = useAtmosphereVisible();
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  /** The current label for each "How I Help" / "Inbox Cleanup" row, resolved
   * from the store rather than carried as row state. */
  const howIHelpValue = (key: string): string => {
    if (key === 'reply')
      return labelForValue(REPLY_DRAFTING_BY_LABEL, prefs.replyDrafting);
    if (key === 'tone')
      return labelForValue(REPLY_TONE_BY_LABEL, prefs.replyTone);
    if (key === 'followup')
      return labelForValue(FOLLOWUP_BY_LABEL, prefs.automation.followup);
    return labelForValue(
      AUTOMATION_BY_LABEL,
      prefs.automation[key as keyof typeof prefs.automation] as AutomationLevel
    );
  };
  const setHowIHelpValue = (key: string, label: string) => {
    if (key === 'reply') {
      settingsActions.update({
        replyDrafting: valueForLabel(REPLY_DRAFTING_BY_LABEL, label, 'review'),
      });
    } else if (key === 'tone') {
      settingsActions.update({
        replyTone: valueForLabel(REPLY_TONE_BY_LABEL, label, 'neutral'),
      });
    } else if (key === 'followup') {
      settingsActions.update({
        automation: { followup: valueForLabel(FOLLOWUP_BY_LABEL, label, 'off') },
      });
    } else {
      settingsActions.update({
        automation: {
          [key]: valueForLabel(AUTOMATION_BY_LABEL, label, 'suggest'),
        },
      });
    }
  };

  const cleanupValue = (key: string) =>
    labelForValue(CLEANUP_BY_LABEL, prefs.cleanup[key as CleanupCategory]);
  const setCleanupValue = (key: string, label: string) =>
    settingsActions.update({
      cleanup: { [key]: valueForLabel(CLEANUP_BY_LABEL, label, 'keep') },
    });

  /**
   * High priority IS `prefs.highPriorityTopics` — the store's own order is
   * the ranking, not a display derived from it. Lower priority is simply
   * everything else, in the one canonical topic order (`PRIORITY_TOPICS`),
   * since a low-priority category carries no rank of its own to preserve.
   */
  const high = prefs.highPriorityTopics;
  const low = useMemo(
    () => PRIORITY_TOPICS.filter((t) => !high.includes(t)),
    [high]
  );
  const highLabels = useMemo(
    () => high.map((t) => labelForValue(TOPIC_BY_LABEL, t)),
    [high]
  );
  const lowLabels = useMemo(
    () => low.map((t) => labelForValue(TOPIC_BY_LABEL, t)),
    [low]
  );

  /**
   * "Current Behavior" — a compact read of the same state the sections below
   * already own (`howIHelp`, `cleanup`, the `high`/`lower` priority split).
   * No second copy of these values: every field here is derived, not typed
   * in, so it can never drift from what a user actually has configured.
   * Quick Access is deliberately absent — it's navigation, not behavior.
   */
  const behaviorSummary = useMemo(() => {
    const replyDraftingSummary =
      prefs.replyDrafting === 'auto'
        ? 'Auto-send'
        : prefs.replyDrafting === 'off'
          ? 'Off'
          : 'Draft first';

    // Archiving is the one remaining never/suggest/automatic setting —
    // "Suggestions"/"Automation" rows existed to group several such settings
    // together, which stopped being true once Labeling was removed and
    // Follow-ups collapsed to a plain on/off switch. One setting gets one
    // row, named for itself, straight off `AUTOMATION_BY_LABEL` rather than
    // a hand-written string per case.
    const archivingSummary = labelForValue(
      AUTOMATION_BY_LABEL,
      prefs.automation.archive
    );

    // One line naming every category's action, categories sharing an action
    // clubbed under it rather than repeating the action once per category.
    const cleanupGroups = new Map<string, string[]>();
    settings.inboxCleanup.forEach((r) => {
      const label = cleanupValue(r.key);
      const forValue = cleanupGroups.get(label) ?? [];
      forValue.push(r.label);
      cleanupGroups.set(label, forValue);
    });
    const cleanupSummary = settings.inboxCleanup.length
      ? Array.from(cleanupGroups.entries())
          .map(([value, labels]) => `${labels.join(', ')}: ${value}`)
          .join(' · ')
      : '—';

    // High priority's own order IS the ranking now — no separate "weights
    // differ" branch needed the way the old numeric system required; a
    // `>` between every pair already says exactly as much as the number
    // used to, without exposing one.
    const priorities = (
      <>
        <span>
          {highLabels.length
            ? highLabels.map((label, i) => (
                <span key={label}>
                  {label}
                  {i < highLabels.length - 1 && (
                    <span
                      style={{ color: 'var(--text-faint)', margin: '0 6px' }}
                    >
                      &gt;
                    </span>
                  )}
                </span>
              ))
            : '—'}
        </span>
        <span style={{ color: 'var(--text-faint)', margin: '0 8px' }}>›</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {lowLabels.join(' · ') || '—'}
        </span>
      </>
    );

    return [
      {
        label: 'Reply tone',
        value: labelForValue(REPLY_TONE_BY_LABEL, prefs.replyTone),
      },
      { label: 'Archiving', value: archivingSummary },
      { label: 'Reply Drafting', value: replyDraftingSummary },
      {
        label: 'Follow-ups',
        value: prefs.automation.followup === 'on' ? 'Enabled' : 'Disabled',
      },
      { label: 'Cleanup', value: cleanupSummary },
      { label: 'Priorities', value: priorities },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, highLabels, lowLabels]);

  const resetAll = () => {
    // Every field on this page — including `highPriorityTopics` now that
    // it's a plain part of `AgentPreferences` rather than page-local
    // `manualBucket` state — lives in the shared store, so
    // `settingsActions.reset()` alone restores all of it deterministically.
    settingsActions.reset();
    setResetOpen(false);
  };

  return (
    <WorkspacePage scale={1.1}>
      <Stagger style={{ display: 'flex', flexDirection: 'column' }}>
        <Reveal>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                margin: 0,
                font: 'var(--type-page-title)',
                letterSpacing: '-0px',
                color: 'var(--text-strong)',
              }}
            >
              Settings
            </h1>
          </div>
          <div style={{ marginTop: 22 }}>
            <ShelfHeading size={12}>Current Behavior</ShelfHeading>
            <p
              style={{
                margin: '5px 0 14px',
                font: '400 11.5px/1.5 Inter, sans-serif',
                color: 'var(--text-faint)',
              }}
            >
              How IIL is currently configured
            </p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {behaviorSummary.map((row, i) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 28,
                    padding: '7px 0',
                    borderBottom:
                      i === behaviorSummary.length - 1
                        ? 'none'
                        : '1px solid rgb(var(--ink) / 0.06)',
                  }}
                >
                  <span
                    className="iil-eyebrow"
                    style={{
                      flex: 'none',
                      width: 112,
                      whiteSpace: 'nowrap',
                      color: 'var(--text-faint)',
                    }}
                  >
                    {row.label}
                  </span>
                  <span
                    style={{
                      font: '500 13px/1.4 Inter, sans-serif',
                      color: 'var(--text-strong)',
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal>
          <PageSection
            heading={<ShelfHeading>How I Help</ShelfHeading>}
            style={{ marginTop: 28 }}
          >
            <Panel padding={6}>
              {settings.howIHelp.map((row, i) => (
                <SettingRow
                  key={row.key}
                  label={row.label}
                  last={i === settings.howIHelp.length - 1}
                >
                  <Select
                    value={howIHelpValue(row.key)}
                    options={row.options}
                    disabledOptions={row.disabledOptions}
                    onChange={(v) => setHowIHelpValue(row.key, v)}
                    ariaLabel={row.label}
                    align="right"
                    optionInfo={
                      row.key === 'tone'
                        ? { Personalized: PERSONALIZED_TONE_HINT }
                        : undefined
                    }
                  />
                </SettingRow>
              ))}
            </Panel>
          </PageSection>
        </Reveal>

        <Reveal>
          <PageSection
            heading={<ShelfHeading>Quick Access</ShelfHeading>}
            description="Choose which mail views appear in your main navigation."
            style={{ marginTop: 28 }}
          >
            <QuickAccessSection />
          </PageSection>
        </Reveal>

        <Reveal>
          <PageSection
            heading={<ShelfHeading>Inbox Cleanup</ShelfHeading>}
            style={{ marginTop: 28 }}
          >
            <Panel padding={6}>
              {settings.inboxCleanup.map((row, i) => (
                <SettingRow
                  key={row.key}
                  label={row.label}
                  last={i === settings.inboxCleanup.length - 1}
                >
                  <Select
                    value={cleanupValue(row.key)}
                    options={row.options}
                    onChange={(v) => setCleanupValue(row.key, v)}
                    ariaLabel={row.label}
                    align="right"
                  />
                </SettingRow>
              ))}
            </Panel>
          </PageSection>
        </Reveal>

        <Reveal>
          <PageSection
            heading={<ShelfHeading>Priorities</ShelfHeading>}
            description={
              high.length === 0
                ? 'Nothing is pinned to High priority yet — drag a category up, or use the arrow beside it.'
                : undefined
            }
            style={{ marginTop: 28 }}
          >
            <PrioritiesSection high={high} />
          </PageSection>
        </Reveal>

        <Reveal>
          <PageSection
            heading={<ShelfHeading>Integrations</ShelfHeading>}
            style={{ marginTop: 28 }}
          >
            <Panel padding={6}>
              <IntegrationsRow onClick={() => setIntegrationsOpen(true)} />
            </Panel>
          </PageSection>
        </Reveal>

        {/* Advanced — the one collapsible tier on this page, closed by
            default: settings most people never need to open, unlike
            Actions/Opportunities' default-open everyday tiers. */}
        <Reveal>
          <div
            style={{
              marginTop: 34,
              paddingTop: 20,
              borderTop: '1px solid rgb(var(--ink) / 0.07)',
            }}
          >
            <Group
              id="settings-advanced"
              label={<ShelfHeading>Advanced</ShelfHeading>}
              gap={22}
              marginTop={0}
              defaultExpanded={false}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 24,
                }}
              >
                <div>
                  <ShelfHeading alpha={0.6} size={13}>
                    Beta Features
                  </ShelfHeading>
                  <p
                    style={{
                      font: '400 11.5px/1.5 Inter, sans-serif',
                      color: 'var(--text-faint)',
                      margin: '4px 0 0',
                      maxWidth: 420,
                    }}
                  >
                    Receive upcoming IIL features before public release.
                  </p>
                </div>
                <Toggle
                  checked={prefs.beta}
                  onChange={(beta) => settingsActions.update({ beta })}
                  label="Beta features"
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 24,
                }}
              >
                <div>
                  <ShelfHeading alpha={0.6} size={13}>
                    Show Background
                  </ShelfHeading>
                  <p
                    style={{
                      font: '400 11.5px/1.5 Inter, sans-serif',
                      color: 'var(--text-faint)',
                      margin: '4px 0 0',
                      maxWidth: 420,
                    }}
                  >
                    The ambient gold light, its glow and the grain drifting
                    through the room. Off removes all of it; nothing else on the
                    page changes.
                  </p>
                </div>
                <Toggle
                  checked={atmosphereVisible}
                  onChange={setAtmosphereVisible}
                  label="Show background"
                />
              </div>

              {/* Attention colors — same shape as every other block in this
                  section (a `ShelfHeading`, one quiet line of description,
                  then the controls in a `Panel`), so it reads as another
                  Advanced setting rather than as a colour tool bolted onto
                  the page. Two rows in one Panel because urgency and
                  importance are one decision made twice, not two settings. */}
              <div>
                <ShelfHeading alpha={0.6} size={13}>
                  Attention Colors
                </ShelfHeading>
                <p
                  style={{
                    font: '400 11.5px/1.5 Inter, sans-serif',
                    color: 'var(--text-faint)',
                    margin: '5px 0 12px',
                    maxWidth: 420,
                  }}
                >
                  Customize how urgency and importance are highlighted across
                  IIL.
                </p>
                <Panel padding={6}>
                  <div
                    style={{
                      borderBottom: '1px solid rgb(var(--ink) / 0.06)',
                    }}
                  >
                    <AttentionColorPicker
                      label="Urgency"
                      options={URGENCY_COLOR_OPTIONS}
                      value={prefs.urgencyColor}
                      onChange={(urgencyColor) =>
                        settingsActions.update({ urgencyColor })
                      }
                    />
                  </div>
                  <div
                    style={{
                      borderBottom: '1px solid rgb(var(--ink) / 0.06)',
                    }}
                  >
                    <AttentionColorPicker
                      label="Importance"
                      options={IMPORTANCE_COLOR_OPTIONS}
                      value={prefs.importanceColor}
                      onChange={(importanceColor) =>
                        settingsActions.update({ importanceColor })
                      }
                    />
                  </div>
                  {/* Inside the same Panel as the two pickers, below the same
                      hairline that separates them — the preview is what those
                      controls do, not a separate setting. */}
                  <AttentionPreview />
                </Panel>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <ShelfHeading alpha={0.6} size={13}>
                  Reset Settings
                </ShelfHeading>
                <Button variant="outline" onClick={() => setResetOpen(true)}>
                  Reset to defaults
                </Button>
              </div>

              {/* Delete Account — last, quiet, generous whitespace above it.
                  Same danger treatment (icon + coral) as a mail thread's own
                  Delete button (MailThreadView), so the one truly destructive
                  action on this page reads as such at a glance. */}
              <div style={{ marginTop: 4 }}>
                <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={13} strokeWidth={2} aria-hidden />
                  Delete Account
                </Button>
              </div>
            </Group>
          </div>
        </Reveal>
      </Stagger>

      <ConfirmDialog
        open={resetOpen}
        title="Reset settings to defaults?"
        message="This restores How I Help, Priorities, Inbox Cleanup, Beta Features and Attention Colors to their original settings. Your account and inbox are not affected."
        confirmLabel="Reset to defaults"
        onConfirm={resetAll}
        onCancel={() => setResetOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account?"
        message="This permanently removes your IIL workspace, settings, and disconnects your mailbox. This can't be undone."
        confirmLabel="Delete account"
        onConfirm={() => setDeleteOpen(false)}
        onCancel={() => setDeleteOpen(false)}
      />
      <TelegramIntegrationModal
        open={integrationsOpen}
        onClose={() => setIntegrationsOpen(false)}
      />
    </WorkspacePage>
  );
}
