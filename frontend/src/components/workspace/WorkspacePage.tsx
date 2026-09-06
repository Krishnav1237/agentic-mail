/**
 * Shared workspace Page Template (Reference §21-22, §62-63; Engineering
 * Constitution §17-19).
 *
 * Every workspace page renders inside {@link WorkspacePage}. The template owns
 * the structural experience — internal scroll, comfortable reading rail,
 * responsive padding rhythm and the staggered content entrance — so individual
 * pages only describe content. Improve spacing or entrance here once and every
 * page inherits it.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useReveal } from './motion';

/**
 * Page-root orchestration variant. Unlike {@link staggerContainer} it does not
 * fade the container itself — the shared route transition (AppShell) already
 * carries the page-level fade — it only sequences its children's reveals so the
 * page settles top-to-bottom (Reference §30 progressive reveal).
 */
const pageStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

/**
 * Wrap a major content group to make it rise in as part of the page's entrance.
 * Participates in the parent {@link WorkspacePage} stagger via variant
 * propagation, so it takes no `initial`/`animate` of its own. Honors reduced
 * motion.
 */
export function Reveal({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div variants={useReveal()} className={className} style={style}>
      {children}
    </motion.div>
  );
}

/**
 * A nested stagger group (e.g. a list whose rows should reveal in sequence).
 * Its children should be {@link Reveal}s. Triggered by the parent page entrance.
 */
export function Stagger({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div variants={pageStagger} className={className} style={style}>
      {children}
    </motion.div>
  );
}

export function WorkspacePage({
  children,
  /** Reading-rail width override (px). Defaults to the shared `--rail-max` token. */
  maxWidth,
  /**
   * Per-page content zoom, e.g. `1.1` for a ~110% browser-zoom feel. Scales
   * everything inside the rail — text, cards, paddings, controls — together
   * and proportionally, the way Ctrl/Cmd+Plus would, without touching the
   * shell (topbar/sidebar/canvas) or the page's own outer position. Defaults
   * to `1` (no-op) so pages that don't opt in render exactly as before. See
   * `.iil-page` in index.css for how this composes with `--rail-max`.
   */
  scale = 1,
  /**
   * Counter-scale applied to font-size only (via `--type-scale`), on top of
   * `scale`. Lets a page sit at a larger visual `scale` (bigger cards/rows/
   * controls) while its type reads as if it were zoomed less — e.g.
   * `scale={1.25}` + `typeScale={0.88}` renders text at 1.25 * 0.88 ≈ 1.1,
   * a ~110% feel, while everything else stays at 125%. Defaults to `1`
   * (no-op).
   */
  typeScale = 1,
  className = '',
  style,
}: {
  children: ReactNode;
  maxWidth?: number;
  scale?: number;
  typeScale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const railStyle = {
    ...(maxWidth ? { '--rail-max': `${maxWidth}px` } : null),
    ...(scale !== 1 ? { '--content-scale': scale } : null),
    ...(typeScale !== 1 ? { '--type-scale': typeScale } : null),
  } as CSSProperties;

  return (
    <div className="iil-scroll">
      <motion.div
        variants={pageStagger}
        initial="hidden"
        animate="show"
        className={`iil-page ${className}`.trim()}
        style={{ ...railStyle, ...style }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Page header: eyebrow → title → supporting line, with an optional page-level
 * action on the right. Establishes context before interaction; it is not a
 * toolbar (Reference §22). `accent` renders the title in gold for pages where
 * the title is itself the primary intelligence (e.g. Approvals — Constitution
 * §4 allows gold on important page titles).
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  action,
  accent = false,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  accent?: boolean;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, maxWidth: '60ch' }}>
        {eyebrow && (
          <span
            className="iil-eyebrow"
            style={{ display: 'block', marginBottom: 10 }}
          >
            {eyebrow}
          </span>
        )}
        <h1 className={accent ? 'iil-title iil-title--accent' : 'iil-title'}>
          {title}
        </h1>
        {description && (
          <p
            style={{
              margin: '10px 0 0',
              font: '400 13.5px/1.6 Inter, sans-serif',
              color: 'var(--text-secondary)',
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ flex: 'none' }}>{action}</div>}
    </header>
  );
}

/**
 * A logical page section. Renders an optional header row (eyebrow/heading +
 * optional action) then its content. Sections are separated by whitespace, not
 * boxes (Reference §20); pass `divider` for the rare hairline the design uses to
 * split adjacent thoughts.
 *
 * `heading` renders as a real `<h2>` (Eng §147 — semantic HTML before
 * appearance), not the styled `<div>` this used to be: a screen reader had no
 * document outline to navigate a page by before this, since `PageHeader`'s
 * single `<h1>` was the only heading landmark in the entire tree. The section
 * itself carries `aria-labelledby` pointing at that `<h2>`'s id (generated via
 * `useId`, since `heading` is an arbitrary `ReactNode` and can't be turned into
 * a slug), so assistive tech reads the section as a named region, not just an
 * unlabelled `<section>`. Purely additive — every visual property (font,
 * spacing, alignment, color) is unchanged.
 */
export function PageSection({
  children,
  eyebrow,
  heading,
  description,
  action,
  divider = false,
  style,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  heading?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  divider?: boolean;
  style?: CSSProperties;
}) {
  const hasHeader = Boolean(eyebrow || heading || description || action);
  const headingId = useId();
  return (
    <section
      aria-labelledby={heading ? headingId : undefined}
      style={{
        ...(divider
          ? {
              borderTop: '1px solid rgb(var(--ink) / 0.07)',
              paddingTop: 'var(--space-page)',
            }
          : null),
        ...style,
      }}
    >
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 'var(--space-section)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {eyebrow && <span className="iil-eyebrow">{eyebrow}</span>}
            {heading && (
              <h2
                id={headingId}
                style={{
                  margin: 0,
                  font: 'var(--type-section-title)',
                  letterSpacing: '-0px',
                  color: 'var(--text-strong)',
                  marginTop: eyebrow ? 6 : 0,
                }}
              >
                {heading}
              </h2>
            )}
            {description && (
              <p
                style={{
                  margin: `${heading || eyebrow ? 6 : 0}px 0 0`,
                  font: '400 12.5px/1.6 Inter, sans-serif',
                  color: 'var(--text-secondary)',
                }}
              >
                {description}
              </p>
            )}
          </div>
          {action && <div style={{ flex: 'none' }}>{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
