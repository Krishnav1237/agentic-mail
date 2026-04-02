import React, { Component, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AppProvider } from './lib/appContext';

const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('APP_ERROR_BOUNDARY', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
          <div className="glass-card rounded-[28px] p-8 max-w-lg">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              Application error
            </div>
            <h1 className="mt-4 text-3xl font-light tracking-tight text-white">
              Something broke.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              Refresh the page and try again. If this keeps happening, check the browser console for the logged error details.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <AppProvider>
          <App />
        </AppProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>
);
