import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Last-resort fallback when a render throws.
 *
 * It has to draw itself, from scratch, in whichever theme the user was
 * already in — and it can't rely on anything above it in the tree, because
 * the thing that crashed is everything above it. Two consequences shape the
 * markup below:
 *
 *   · The workspace's design tokens (`--ink`, `--paper`, `--text-*`,
 *     `--surface`, …) are scoped to `.obligo-root[data-theme]`, which is
 *     rendered by `AppShell` — the component that just failed. So this
 *     fallback opens its own `.obligo-root` and stamps `data-theme` itself,
 *     reading the same `html.light` class the boot script in `index.html`
 *     and `useWorkspaceTheme` both key off. Without that, every token below
 *     would resolve to nothing.
 *   · It reads that class directly rather than through state: there is no
 *     "before" to have subscribed in, and a crash screen has no reason to
 *     live-update.
 *
 * This previously rendered hardcoded dark Tailwind utilities (`bg-black`,
 * `text-neutral-100`, `border-neutral-800`) plus a `btn-primary` class that
 * no longer exists anywhere in the stylesheet — so in light mode it was a
 * black slab in the middle of a paper-white app, with an unstyled button.
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Frontend render failure', error, info);

    // Opt this fallback out of the page-wide light-mode invert filter.
    //
    // In light mode `html.light:not(.obligo-workspace)` inverts the ENTIRE
    // document — that's how the Landing page gets its light theme. The
    // workspace opts out by having `useWorkspaceTheme` stamp `.obligo-workspace`
    // on <html> while it's mounted, because the workspace ships real light
    // tokens instead. But that hook lives in `AppShell`, which is precisely
    // what has just failed: on a crash during the first render it never
    // mounted, and on a later crash its cleanup has already removed the
    // class. Either way the fallback below would render its light tokens
    // through the inverter and come out dark — verified in the browser, which
    // is the only way this shows up at all.
    //
    // Runs here rather than during render (which must stay side-effect free);
    // `componentDidCatch` fires in the same commit, before paint, so there's
    // no flash of the inverted state.
    document.documentElement.classList.add('obligo-workspace');
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const theme =
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('light')
        ? 'light'
        : 'dark';

    return (
      <div
        className="obligo-root"
        data-theme={theme}
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--paper)',
        }}
      >
        <div
          role="alert"
          style={{
            width: 460,
            maxWidth: '100%',
            padding: '26px 28px',
            borderRadius: 16,
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--surface-border)',
            boxShadow: 'var(--elev-shadow), inset 0 1px 0 var(--inset-hi)',
          }}
        >
          <span className="obligo-eyebrow">Something went wrong</span>
          <h1
            style={{
              margin: '12px 0 0',
              font: '300 20px/1.3 Inter, sans-serif',
              letterSpacing: '-0px',
              color: 'var(--text-strong)',
            }}
          >
            The interface hit an unexpected error.
          </h1>
          <p
            style={{
              margin: '10px auto 0',
              maxWidth: '44ch',
              font: '400 12.5px/1.6 Inter, sans-serif',
              color: 'var(--text-secondary)',
            }}
          >
            Reloading should recover your session. Nothing in your mailbox has
            been changed.
          </p>
          <div style={{ marginTop: 22 }}>
            <button
              type="button"
              className="obligo-btn obligo-btn--outline"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
