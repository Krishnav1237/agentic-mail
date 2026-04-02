import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black px-4 py-10 text-white">
          <div className="mx-auto max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 p-8 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-400">
              UI Recovery
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-neutral-100">
              The interface hit an unexpected error.
            </h1>
            <p className="mt-4 text-sm leading-7 text-neutral-400">
              Reload the page to recover the session. If this repeats, inspect
              the browser console and backend logs together.
            </p>
            <button
              className="btn-primary mt-6"
              onClick={() => window.location.reload()}
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
