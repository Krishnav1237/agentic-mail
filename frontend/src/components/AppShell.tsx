import { useEffect, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCheck,
  ChevronDown,
  Home,
  Mail,
  SquareCheck,
  Sparkle,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { useAtmosphereVisible } from '../lib/useAtmosphereVisible';
import { useQuickAccess } from '../lib/useQuickAccess';
import { mailViewById } from '../lib/mailViews';
import { useWorkspaceTheme } from '../lib/useWorkspaceTheme';
import { settingsActions, useAgentSettings } from '../lib/settingsStore';
import { bootstrapStores } from '../lib/storeBootstrap';
import { useSyncState, type SyncState } from '../lib/syncStatus';
import { DURATION, EASE, SPRING_PILL, usePageTransition } from './workspace/motion';
import { Atmosphere } from './workspace/Atmosphere';
import { AccountMenu, Divider, Eyebrow } from './workspace';

const navItems: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'Dashboard', to: '/dashboard', icon: Home },
  { label: 'Inbox', to: '/inbox', icon: Mail },
  { label: 'Approvals', to: '/approvals', icon: ShieldCheck },
  { label: 'Actions', to: '/actions', icon: SquareCheck },
  { label: 'Opportunities', to: '/opportunities', icon: Sparkle },
  { label: 'Completed', to: '/completed', icon: CheckCheck },
  { label: 'Settings', to: '/settings', icon: SlidersHorizontal },
];

/**
 * The Obligo workspace shell: floating topbar + nav-only sidebar + rounded canvas.
 * Formerly the (dead) dashboard shell — rewritten to the Sprint 1 design.
 */
/**
 * The gap between mount and the first `GET /preferences` landing.
 *
 * Before the stores had a backend they were populated at module load, so the
 * workspace's very first paint already carried the user's real values. Now
 * there is a round trip, and rendering through it would show three wrong
 * things at once: the whole surface in the DEFAULT attention colours before
 * repainting in the user's, a demo identity in the topbar avatar (
 * `DEFAULT_PROFILE` seeds from `mailAdapters`' `CURRENT_USER_NAME`), and —
 * worst — controls a user could touch during the gap, whose change
 * `hydrate()` would then silently overwrite, since hydration is
 * replace-not-merge.
 *
 * One gate at the shell removes all three at once, and costs a single round
 * trip because the three GETs run in parallel. Deliberately neutral: it reads
 * no attention token, so it cannot itself flash a colour it's here to prevent.
 */
function ShellSplash({ theme }: { theme: string }) {
  return (
    <div className="obligo-root" data-theme={theme} data-atmosphere="off">
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p
          role="status"
          style={{
            font: '400 13px/1.5 Inter, sans-serif',
            color: 'var(--text-faint)',
          }}
        >
          Loading your workspace…
        </p>
      </div>
    </div>
  );
}

/**
 * Tells the user when what they're looking at isn't backed by the server.
 *
 * Two distinct failures, one line: `failedStores` means an initial load fell
 * back to defaults (and that store is now refusing to write, so it cannot
 * overwrite the real values it never managed to read), while `writeError`
 * means a change applied locally but didn't reach the server.
 */
function SyncNotice({ sync }: { sync: SyncState }) {
  const message =
    sync.writeError ??
    (sync.failedStores.length > 0
      ? `Couldn't load your ${formatList(sync.failedStores)} — showing defaults, and changes here won't be saved.`
      : null);

  if (!message) return null;

  return (
    <div
      role="status"
      style={{
        margin: '0 0 10px',
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid rgb(var(--coral) / 0.28)',
        background: 'rgb(var(--coral) / 0.08)',
        font: '400 12px/1.5 Inter, sans-serif',
        color: 'var(--text-secondary)',
      }}
    >
      {message}
    </div>
  );
}

/** "Settings", "Settings and Profile", "Settings, Profile and Telegram". */
function formatList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export default function AppShell() {
  const theme = useWorkspaceTheme();
  const [atmosphereVisible] = useAtmosphereVisible();
  const sync = useSyncState();

  // `bootstrapStores` is idempotent, which is what makes this safe under
  // StrictMode's double-invoked effects and any remount of the shell.
  useEffect(() => {
    void bootstrapStores();
  }, []);

  const { quickAccess } = useQuickAccess();
  const quickAccessViews = quickAccess
    .map(mailViewById)
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  // Attention pigments + the Quick Access collapse state all come from the
  // one preferences store, so both survive a reload and both are part of what
  // a backend `PUT /preferences` already carries.
  const prefs = useAgentSettings();
  const quickAccessOpen = !prefs.quickAccessCollapsed;
  const quickAccessListId = useId();
  const location = useLocation();
  const outlet = useOutlet();
  const pageTransition = usePageTransition();

  // After every hook, never before — an early return above any of the calls
  // above would change the hook order between renders.
  if (sync.phase === 'loading') return <ShellSplash theme={theme} />;

  return (
    // The two attention pigments reach the entire application through these
    // two attributes and nothing else: index.css resolves them into the
    // `--attention-*` token family, which every rail, wash, dot, badge, count
    // and label already reads. Changing either repaints every surface on the
    // next frame — no reload, no prop threading, and no component that has to
    // know a preference exists in order to honour it.
    <div
      className="obligo-root"
      data-theme={theme}
      data-urgency={prefs.urgencyColor}
      data-importance={prefs.importanceColor}
      // The root's OWN background — see `--root-bg` in index.css — reads this
      // rather than being gated by a second `atmosphereVisible &&` branch:
      // `<Atmosphere>` below already owns every gold/warm layer that sits ON
      // TOP of the root; this attribute is what lets the base underneath it
      // also go neutral when there's nothing left to sit on top of, instead
      // of silently keeping light theme's warm `--paper` as the floor colour
      // even with the whole atmosphere switched off.
      data-atmosphere={atmosphereVisible ? 'on' : 'off'}
    >
      {/* Shared atmosphere: the deep room the frosted surfaces float in, lit by
          soft flowing golden light (Reference §29/§39/§42). Owns all ambient
          motion; every page inherits it. Theme-driven purely via CSS tokens.
          Gated by Settings → Advanced → "Show background" — the component and
          its motion are unchanged either way, only whether it renders. */}
      {atmosphereVisible && <Atmosphere />}

      {/* Experiment 1: Atmospheric Perspective — purely a depth cue for the
          beam where it passes behind the main workspace canvas; see the
          `.obligo-depth-veil` rule in index.css for how it composes with the
          atmosphere and the canvas. Gated the same as `<Atmosphere>` since it
          has nothing to show when the atmosphere itself is hidden. */}
      {atmosphereVisible && (
        <div className="obligo-depth-veil" aria-hidden="true" />
      )}

      {/* Topbar: brand left, theme + profile right (Constitution §8). */}
      <header className="obligo-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/favicon.svg"
            width={22}
            height={22}
            alt="Obligo"
            style={{
              width: 'calc(var(--ui-scale) * 22px)',
              height: 'calc(var(--ui-scale) * 22px)',
              borderRadius: 'calc(var(--ui-scale) * 6px)',
              display: 'block',
            }}
          />
          <span
            style={{
              font: '600 calc(var(--ui-scale) * 14px)/1 Inter, sans-serif',
              letterSpacing: 'calc(var(--ui-scale) * 1.5px)',
              whiteSpace: 'nowrap',
              color: 'rgb(var(--ink) / 0.94)',
            }}
          >
            OBLIGO
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ThemeToggle className="scale-[0.78] origin-right" />
          <AccountMenu />
        </div>
      </header>

      {/* Sidebar: navigation only (Constitution §8), floating active pill. */}
      <aside className="obligo-sidebar">
        <nav className="obligo-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end className="obligo-nav-item">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="obligo-nav-pill"
                        className="obligo-pill"
                        transition={SPRING_PILL}
                      />
                    )}
                    <span
                      className="obligo-nav-icon"
                      style={{ color: isActive ? 'var(--text)' : undefined }}
                    >
                      {/* Lucide's `size` sets a raw SVG width/height attribute,
                          not a CSS property — it can't read `--ui-scale` via
                          calc(), so this is the token's factor (18 * 1.2)
                          pre-computed as a literal instead. */}
                      <Icon size={22} strokeWidth={1.5} aria-hidden />
                    </span>
                    <span
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        fontWeight: isActive ? 500 : 400,
                        color: isActive ? 'rgb(var(--ink) / 0.98)' : undefined,
                      }}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Quick Access — user-configurable promotion of mail-management
            views (Starred, Sent, ...) into the main sidebar, managed from
            Settings → Quick Access. Absent from the DOM entirely when empty,
            so it stays unobtrusive rather than reserving dead space. */}
        {quickAccessViews.length > 0 && (
          <>
            <Divider spacing={10} />
            {/* The heading IS the control — a real <button> carrying the
                section's label, its chevron and its ARIA state, rather than
                a separate "More/Less" affordance sitting beside a
                non-interactive heading. One target, and it's the thing the
                eye already goes to.

                `aria-controls` points at the list the button actually owns.
                While collapsed that element is unmounted (the height
                animation needs it gone, not just hidden), which is exactly
                the case `aria-expanded="false"` describes to a screen
                reader, so the pair stays coherent in both states. */}
            <button
              type="button"
              className="obligo-quick-access-toggle"
              aria-expanded={quickAccessOpen}
              aria-controls={quickAccessListId}
              onClick={() =>
                settingsActions.update({
                  quickAccessCollapsed: quickAccessOpen,
                })
              }
            >
              <Eyebrow style={{ display: 'block' }}>Quick Access</Eyebrow>
              <ChevronDown
                size={12}
                strokeWidth={2}
                aria-hidden
                style={{
                  flex: 'none',
                  transform: quickAccessOpen
                    ? 'rotate(0deg)'
                    : 'rotate(-90deg)',
                  transition: 'transform var(--dur-micro) var(--ease)',
                }}
              />
            </button>
            {/* Same collapse motion as every other collapsible section in the
                product (`Group`): height + opacity on the shared micro
                duration and ease, nothing bespoke. On desktop the sidebar is
                `position: fixed` between a top and a bottom inset, so its box
                cannot change size as this animates — only the destinations
                inside it come and go. In the compact top-nav layout the same
                animation smoothly gives the row's height back to the canvas,
                which is the correct behaviour there and needs no second
                navigation model to express. */}
            <AnimatePresence initial={false}>
              {quickAccessOpen && (
                <motion.div
                  key="quick-access"
                  id={quickAccessListId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURATION.micro, ease: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <nav className="obligo-nav" style={{ paddingTop: 6 }}>
                    {quickAccessViews.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.id}
                          to={item.path}
                          end
                          className="obligo-nav-item"
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <motion.span
                                  layoutId="obligo-quickaccess-pill"
                                  className="obligo-pill"
                                  transition={SPRING_PILL}
                                />
                              )}
                              <span
                                className="obligo-nav-icon"
                                style={{
                                  color: isActive ? 'var(--text)' : undefined,
                                }}
                              >
                                <Icon
                                  size={22}
                                  strokeWidth={1.5}
                                  aria-hidden
                                />
                              </span>
                              <span
                                style={{
                                  position: 'relative',
                                  zIndex: 1,
                                  fontWeight: isActive ? 500 : 400,
                                  color: isActive
                                    ? 'rgb(var(--ink) / 0.98)'
                                    : undefined,
                                }}
                              >
                                {item.label}
                              </span>
                            </>
                          )}
                        </NavLink>
                      );
                    })}
                  </nav>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </aside>

      {/* Canvas: the current screen. AppShell owns the understated route
          transition (Reference §53); each page owns its internal scroll/padding.
          `useOutlet` + a pathname key lets AnimatePresence cross-fade routes
          while the shell itself stays permanent. */}
      <main className="obligo-canvas">
        {/* Non-blocking, and non-blocking on purpose. A store whose GET failed
            is running on defaults with writing disabled, so the honest thing
            is to say changes may not save rather than either hiding it or
            taking the workspace away. `writeError` covers the other half: a
            change that was applied locally but never reached the server. */}
        <SyncNotice sync={sync} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            style={{ height: '100%' }}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
