import { useId } from 'react';
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
 * The IIL workspace shell: floating topbar + nav-only sidebar + rounded canvas.
 * Formerly the (dead) dashboard shell — rewritten to the Sprint 1 design.
 */
export default function AppShell() {
  const theme = useWorkspaceTheme();
  const [atmosphereVisible] = useAtmosphereVisible();
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

  return (
    // The two attention pigments reach the entire application through these
    // two attributes and nothing else: index.css resolves them into the
    // `--attention-*` token family, which every rail, wash, dot, badge, count
    // and label already reads. Changing either repaints every surface on the
    // next frame — no reload, no prop threading, and no component that has to
    // know a preference exists in order to honour it.
    <div
      className="iil-root"
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
          `.iil-depth-veil` rule in index.css for how it composes with the
          atmosphere and the canvas. Gated the same as `<Atmosphere>` since it
          has nothing to show when the atmosphere itself is hidden. */}
      {atmosphereVisible && (
        <div className="iil-depth-veil" aria-hidden="true" />
      )}

      {/* Topbar: brand left, theme + profile right (Constitution §8). */}
      <header className="iil-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/favicon.svg"
            width={22}
            height={22}
            alt="IIL"
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
              letterSpacing: '-0px',
              color: 'rgb(var(--ink) / 0.94)',
            }}
          >
            IIL
          </span>
          {/* Hidden at exactly the same breakpoint as the wordmark it
              separates — on its own it read as a rule with nothing after it. */}
          <span
            className="hidden sm:inline"
            style={{
              width: 1,
              height: 'calc(var(--ui-scale) * 14px)',
              background: 'rgb(var(--ink) / 0.14)',
            }}
          />
          <span
            className="hidden sm:inline"
            style={{
              font: '450 calc(var(--ui-scale) * 14px)/1 Inter, sans-serif',
              letterSpacing: 'calc(var(--ui-scale) * 1.5px)',
              whiteSpace: 'nowrap',
              color: 'rgb(var(--ink) / 0.94)',
            }}
          >
            INBOX INTELLIGENCE LAYER
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ThemeToggle className="scale-[0.78] origin-right" />
          <AccountMenu />
        </div>
      </header>

      {/* Sidebar: navigation only (Constitution §8), floating active pill. */}
      <aside className="iil-sidebar">
        <nav className="iil-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end className="iil-nav-item">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="iil-nav-pill"
                        className="iil-pill"
                        transition={SPRING_PILL}
                      />
                    )}
                    <span
                      className="iil-nav-icon"
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
              className="iil-quick-access-toggle"
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
                  <nav className="iil-nav" style={{ paddingTop: 6 }}>
                    {quickAccessViews.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.id}
                          to={item.path}
                          end
                          className="iil-nav-item"
                        >
                          {({ isActive }) => (
                            <>
                              {isActive && (
                                <motion.span
                                  layoutId="iil-quickaccess-pill"
                                  className="iil-pill"
                                  transition={SPRING_PILL}
                                />
                              )}
                              <span
                                className="iil-nav-icon"
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
      <main className="iil-canvas">
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
