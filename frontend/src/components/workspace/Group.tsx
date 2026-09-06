/**
 * Shared collapsible section header + body — the one implementation Actions
 * and Opportunities both render through, so a fix made here (or a feature
 * added here) reaches every page that groups rows into tiers/shelves. Before
 * this file existed, each page had grown its own near-identical header,
 * which is exactly how they drifted: Actions lost its collapse affordance
 * when only its CSS was patched to match Opportunities, and Opportunities'
 * rows clipped their hover ring on the left where Actions' didn't, because
 * only Opportunities' rows sat inside an `overflow: hidden` collapse
 * container without the matching bleed compensation. Both bugs are fixed
 * once, here, instead of twice, divergently, per page.
 */
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { InteractiveRow } from './InteractiveRow';
import { DURATION, EASE } from './motion';

/**
 * Manual stand-in for `position: sticky`, needed because every page that
 * groups rows into tiers renders inside `.iil-page`, which carries its own
 * `transform: scale(...)` (WorkspacePage's per-page content zoom). A
 * `transform` on an ancestor gives the browser a new containing block for
 * that subtree, and both `position: sticky` and `position: fixed` inside it
 * resolve their offsets against that moving, scaled box instead of the real
 * `.iil-scroll` viewport — confirmed by direct measurement (a sticky/fixed
 * header drifts by exactly the raw scroll delta, i.e. it never actually
 * pins). That's the unexplained gap, the missing blur, and the
 * per-section-inconsistent offset described in the bug: native sticky simply
 * isn't engaging.
 *
 * The fix pins the header itself with a measured `transform: translateY()`
 * instead, computed from real geometry every frame:
 *  - `startRef` sits immediately before the header, in normal flow — its
 *    `getBoundingClientRect().top` is the header's true unpinned position
 *    (translateY on the header doesn't move this sibling).
 *  - `endRef` sits immediately after the section's content — once it
 *    approaches the scroll container's top, the offset is clamped so the
 *    header rides up and out with its own section instead of overlapping
 *    the next one, which is what makes the next header "push" it away.
 *  - `container.getBoundingClientRect().top` is the live top of the actual
 *    scroll viewport, already below any topbar/shell chrome by construction
 *    — never a hardcoded offset, and correct even if that chrome's height
 *    changes.
 * The applied translateY is divided by the header's own current render
 * scale (measured, not assumed) so it lands on the exact visual pixel
 * regardless of which page's zoom level it's rendering inside.
 *
 * The measured offset is written as the `--pin-offset` custom property
 * (not `element.style.transform` directly) so each consumer composes it
 * into its own `transform` however fits — `.iil-action-row` already blends
 * it with its hover-lift/press-scale transforms in index.css; a plain,
 * non-interactive sticky element (Actions' "Completed" footer) can just
 * declare `transform: translateY(var(--pin-offset, 0px))` once, inline.
 * Setting `transform` from here directly would instead permanently win over
 * any of an element's own `:hover`/`:active` transform rules (inline style
 * always outranks a class, pseudo-class or not) for as long as it stayed
 * pinned.
 *
 * `endRef` is optional: attach it to mark where the *next* section begins,
 * so this header rides up and out with its own content instead of
 * overlapping the next one. Omit it for a final section that should simply
 * stay pinned once reached (e.g. a page's last "Completed" footer) — with
 * no boundary to clamp against, nothing ever pushes it back out.
 */
export function useTransformSticky<T extends HTMLElement>() {
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<T>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    const start = startRef.current;
    const end = endRef.current;
    const scrollEl = header?.closest('.iil-scroll') as HTMLElement | null;
    if (!header || !start || !scrollEl) return;

    let lastPinned = false;

    const measure = () => {
      const containerTop = scrollEl.getBoundingClientRect().top;
      const startTop = start.getBoundingClientRect().top;
      const headerRect = header.getBoundingClientRect();
      const scale =
        headerRect.width / (header.offsetWidth || headerRect.width || 1);
      const headerHeight = headerRect.height;

      const desired = Math.max(0, containerTop - startTop);
      const maxAllowed = end
        ? Math.max(0, end.getBoundingClientRect().top - headerHeight - startTop)
        : Infinity;
      const offset = Math.min(desired, maxAllowed);

      header.style.setProperty(
        '--pin-offset',
        offset > 0.5 ? `${offset / scale}px` : '0px'
      );
      const nowPinned = offset > 0.5;
      if (nowPinned !== lastPinned) {
        lastPinned = nowPinned;
        setPinned(nowPinned);
      }
    };

    measure();
    // Direct, unthrottled calls rather than rAF-batched ones: rAF is
    // suspended entirely while a tab is backgrounded, which would leave a
    // stale pin position the moment scroll/resize/reflow happens off-screen
    // (e.g. driven by an automated test, or any non-frame-driven trigger).
    // The measurement itself is a handful of `getBoundingClientRect` reads
    // and one style write — cheap enough per header to run on every event
    // without needing to coalesce.
    scrollEl.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // Re-measures continuously through the expand/collapse height animation
    // (and any other content reflow) so the pin stays accurate mid-transition
    // instead of only updating on the next scroll/resize.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(header.parentElement ?? header);

    return () => {
      scrollEl.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      resizeObserver.disconnect();
    };
  }, []);

  return { startRef, endRef, headerRef, pinned };
}

/**
 * Expand/collapse state lives in module scope, not component state — a page
 * unmounts on route change (AppShell swaps pages via AnimatePresence), so a
 * plain `useState` would forget which groups were collapsed the moment you
 * navigated away and back. A module-level Set persists for the life of the
 * session exactly like a tiny external store, which is all "remember while
 * navigating" requires. Keyed by whatever id string each page passes, so one
 * Set safely serves every page — Actions' and Opportunities' ids never
 * collide since each page invents its own.
 */
const collapsedGroups = new Set<string>();
/** Which ids have already had `defaultExpanded` applied — so a group that
 * defaults closed (e.g. Settings' "Advanced") only seeds that starting state
 * once, on its very first render, rather than re-forcing it closed every
 * time the component re-renders. */
const seededGroups = new Set<string>();

export function useGroupExpanded(id: string, defaultExpanded = true) {
  if (!seededGroups.has(id)) {
    seededGroups.add(id);
    if (!defaultExpanded) collapsedGroups.add(id);
  }
  const [, rerender] = useState(0);
  return {
    expanded: !collapsedGroups.has(id),
    toggle: () => {
      if (collapsedGroups.has(id)) collapsedGroups.delete(id);
      else collapsedGroups.add(id);
      rerender((n) => n + 1);
    },
  };
}

/**
 * One collapsible tier. `label` is a pre-styled node — each page keeps its
 * own typographic identity (Actions' uppercase mono `Eyebrow` tier labels vs
 * Opportunities' sentence-case bold `ShelfHeading`s); only the interactive
 * skeleton is shared: chevron, count, hover/press/focus (`.iil-action-row`),
 * and — when `stickyIndex` is given — pinning with a frosted background that
 * switches on only while actually stuck.
 *
 * The header is a single `.iil-action-row` button carrying its own sticky
 * positioning via inline style rather than a second CSS class layered on
 * top: two classes both trying to own `background` fight over source order,
 * so the stuck-state background is expressed the same way every row's rest/
 * hover background already is — through `--row-bg`/`--row-hover-bg` — and
 * `position`/`backdrop-filter` are added inline, properties `.iil-action-row`
 * never declares, so there's nothing to conflict with.
 *
 * The header's *label* text — not its padding — is what has to land at the
 * same 14px inset as every row and card below it. The chevron sits before
 * the label, so `paddingLeft` stays 0 and the chevron's own footprint
 * (width + gap) is sized to exactly 14px, rather than adding a real 14px
 * pad in front of an already-14px chevron+gap, which used to push the label
 * to 34px — visibly to the right of every row it sits above. `paddingRight`
 * stays a real 14px, matching the tinted cards' (Overdue/Today/Opportunities'
 * elevated card) trailing inset.
 */
export function Group({
  id,
  label,
  count,
  marginTop,
  gap,
  stickyIndex,
  defaultExpanded = true,
  children,
}: {
  id: string;
  label: ReactNode;
  count?: number;
  marginTop: number;
  /** Gap between rows in the expanded body. */
  gap: number;
  /** Pins the header while scrolling, with a frosted background that only
   * shows once actually stuck; later tiers should pass a higher index so
   * they stack above earlier ones as they take the pinned slot. Omit for a
   * header that scrolls normally. */
  stickyIndex?: number;
  /** Starting state the very first time this id is seen (e.g. Settings'
   * "Advanced" section defaults closed). Ignored on every render after the
   * first — see `seededGroups` in `useGroupExpanded`. */
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const { expanded, toggle } = useGroupExpanded(id, defaultExpanded);
  const {
    startRef,
    endRef,
    headerRef,
    pinned: stuck,
  } = useTransformSticky<HTMLButtonElement>();
  const sticky = stickyIndex !== undefined;
  const pinned = sticky && stuck;

  return (
    <div style={{ marginTop }}>
      {sticky && <div ref={startRef} aria-hidden style={{ height: 0 }} />}
      <InteractiveRow
        ref={sticky ? headerRef : undefined}
        aria-expanded={expanded}
        onClick={toggle}
        visual={{
          bg: pinned ? 'var(--topbar)' : 'transparent',
          hoverBg: pinned ? 'var(--topbar)' : 'rgb(var(--ink) / 0.03)',
          hoverBorder: 'rgb(var(--ink) / 0.08)',
        }}
        style={
          {
            gap: 4,
            paddingLeft: 0,
            paddingRight: 14,
            paddingBlock: 8,
            borderRadius: 10,
            ...(sticky
              ? {
                  position: 'relative',
                  zIndex: 10 + (stickyIndex ?? 0),
                  willChange: 'transform',
                  backdropFilter: pinned
                    ? 'blur(var(--glass-blur-shell))'
                    : undefined,
                  WebkitBackdropFilter: pinned
                    ? 'blur(var(--glass-blur-shell))'
                    : undefined,
                }
              : null),
          } as CSSProperties
        }
      >
        <ChevronDown
          size={10}
          strokeWidth={1.8}
          aria-hidden
          style={{
            flex: 'none',
            color: 'var(--text-faint)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.2s var(--ease)',
          }}
        />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {label}
        </div>
        {count !== undefined && (
          <span
            className="iil-mono"
            style={{
              flex: 'none',
              marginLeft: 'auto',
              // Same family/case/right-alignment as before — only legibility
              // changes. `--text-faint` (the dimmest ladder rung) read as
              // near-invisible at 10px; `--text-secondary` plus a 600 weight
              // is the same "clearly secondary, still legible at a glance"
              // treatment `CompletionSummaryHeader`'s own "Completed · N"
              // count already uses, reused here rather than inventing a
              // fourth count style.
              font: '600 calc(var(--type-scale, 1) * 10.5px) "JetBrains Mono", monospace',
              color: 'var(--text-secondary)',
            }}
          >
            {count}
          </span>
        )}
      </InteractiveRow>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.micro, ease: EASE }}
            // Rows use the shared paddingInline:8/marginInline:-8 hover-bleed
            // trick (see .iil-action-row consumers) so their hover ring can
            // extend 8px beyond the text without shifting it. This wrapper
            // needs `overflow: hidden` to animate height, which would clip
            // that 8px bleed at exactly the left/right edges — the same bug
            // that made Opportunities' hover ring vanish on the left where
            // Actions' (not inside any collapse wrapper) didn't. Giving the
            // wrapper the identical bleed (marginInline:-8, paddingInline:8)
            // moves its own clip boundary out to meet the rows' bleed
            // exactly, so nothing gets cut off.
            style={{ overflow: 'hidden', marginInline: -8, paddingInline: 8 }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap,
                paddingTop: 8,
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {sticky && <div ref={endRef} aria-hidden style={{ height: 0 }} />}
    </div>
  );
}
