/**
 * The one interactive-row primitive every workspace page builds on —
 * Dashboard's decisions, Inbox's stream/rail, Actions' tiers, Opportunities'
 * cards, and whatever page comes next. It owns the ENGINE: a real `<button>`
 * (native keyboard focus/activation for free), the shared `.iil-action-row`
 * hover/press/selected recipe, and the fixed 220ms timing/easing that recipe
 * uses everywhere.
 *
 * It does not own the LOOK. Every page configures its own visual intensity
 * through `visual` — Dashboard's gold decision keeps a permanent glow and a
 * brighter border, Inbox's stream stays quiet (no lift, no elevation shadow,
 * just a background wash), Actions/Opportunities use the shared defaults.
 * Same engine, different volume — never a forked copy of the hover logic
 * itself, which is what let Dashboard's old hand-rolled row carry a real
 * `border` animated alongside `transform` (the exact combination that clips
 * on hover — see `.iil-action-row` in index.css) instead of the box-shadow
 * ring every other row already used.
 */
import React, { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

export type RowVisual = {
  /** Rest-state surface. Default transparent (a plain list row). */
  bg?: string;
  /** Rest-state border, expressed as an inset ring — never a real `border`. */
  border?: string;
  /** Hover/selected surface. Defaults to `bg` if omitted. */
  hoverBg?: string;
  /** Hover/selected border ring. Defaults to `border` if omitted. */
  hoverBorder?: string;
  /** Rest-state box-shadow — most rows have none; Dashboard's gold row keeps
   * a permanent glow here so it reads as lit even before you touch it. */
  shadow?: string;
  /** Hover-state box-shadow. Defaults to the shared elevation shadow. Pass
   * `'none'` for a page that should stay flat on hover (Inbox). */
  hoverShadow?: string;
  /** Hover translateY distance in px. Default -1. Pass 0 to drop the lift
   * entirely for a quieter page (Inbox); Dashboard can go past -1 for extra
   * emphasis on its one gold row. */
  lift?: number;
};

function rowVars(visual: RowVisual | undefined): CSSProperties {
  return {
    '--row-bg': visual?.bg ?? 'transparent',
    '--row-border': visual?.border ?? 'transparent',
    '--row-hover-bg': visual?.hoverBg ?? visual?.bg ?? 'transparent',
    '--row-hover-border': visual?.hoverBorder ?? visual?.border ?? 'transparent',
    ...(visual?.shadow !== undefined ? { '--row-shadow': visual.shadow } : null),
    ...(visual?.hoverShadow !== undefined ? { '--row-hover-shadow': visual.hoverShadow } : null),
    ...(visual?.lift !== undefined ? { '--row-lift': `${visual.lift}px` } : null),
  } as CSSProperties;
}

export const InteractiveRow = forwardRef<
  HTMLButtonElement,
  {
    visual?: RowVisual;
    /** Renders the persistent "selected" look (same visual as hover) via
     * `data-selected`. This is purely visual — pass whichever ARIA attribute
     * actually fits the selection semantics yourself (`aria-pressed` for a
     * toggle like Actions'/Opportunities' rows, `aria-current` for a single
     * open item in a list like Inbox's rail). Omit entirely for a row with no
     * selection concept. */
    selected?: boolean;
    /**
     * The row has its own interactive controls inside it (Inbox's star,
     * Scheduled's Send now / Cancel), so it renders as a `div` carrying
     * button semantics instead of a real `<button>`.
     *
     * A `<button>` inside a `<button>` is invalid HTML — React logs it as a
     * `validateDOMNesting` error, and the practical consequences are worse
     * than the warning: the parser's recovery is browser-dependent, and
     * assistive technology generally exposes the outer control only, so the
     * inner one (starring a message, cancelling a scheduled send) can be
     * unreachable to a screen-reader or keyboard user even though it renders
     * and responds to a mouse.
     *
     * The row keeps everything a button gave it — focusability, Enter/Space
     * activation, the same `.iil-action-row` recipe — but the nested controls
     * stay genuinely independent: activation keys are ignored unless the row
     * itself is the focused element, so pressing Enter on the star toggles
     * the star rather than also opening the mail underneath it.
     */
    containsInteractive?: boolean;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'>
>(function InteractiveRow(
  { visual, selected, containsInteractive, className = '', style, children, ...props },
  ref,
) {
  const shared = {
    className: `iil-action-row ${className}`.trim(),
    'data-selected': selected,
    style: { ...rowVars(visual), ...style },
  };

  if (containsInteractive) {
    const { onClick, onKeyDown, disabled, ...rest } = props;
    return (
      <div
        {...shared}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={onClick as React.MouseEventHandler<HTMLDivElement> | undefined}
        onKeyDown={(e) => {
          (onKeyDown as React.KeyboardEventHandler<HTMLDivElement> | undefined)?.(e);
          // Only when the row itself has focus — a key pressed on a nested
          // control belongs to that control.
          if (e.target !== e.currentTarget || e.defaultPrevented) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (onClick as ((e: unknown) => void) | undefined)?.(e);
          }
        }}
        {...(rest as React.HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    );
  }

  return (
    <button ref={ref} type="button" {...shared} {...props}>
      {children}
    </button>
  );
});
