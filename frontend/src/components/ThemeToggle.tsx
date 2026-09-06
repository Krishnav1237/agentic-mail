import { useEffect, useState } from 'react';

/** Theme preference reads/writes, guarded the same way the boot script in
 * `index.html` already guards its own: `localStorage` access throws outright
 * under Safari private browsing and blocked-cookie settings, which would
 * otherwise make the theme toggle a button that throws instead of toggling. */
function readStoredTheme(): string | null {
  try {
    return localStorage.getItem('theme');
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: 'light' | 'dark') {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* storage unavailable — the theme still applies for this session */
  }
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Check initial state applied by the index.html script
    const isLightMode = document.documentElement.classList.contains('light');
    setIsLight(isLightMode);

    // Optional: listen to system preference changes if no manual override is set
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e: MediaQueryListEvent) => {
      const stored = readStoredTheme();
      if (!stored) {
        setIsLight(e.matches);
        if (e.matches) {
          document.documentElement.classList.add('light');
        } else {
          document.documentElement.classList.remove('light');
        }
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    const newState = !isLight;
    setIsLight(newState);
    document.documentElement.classList.toggle('light', newState);
    writeStoredTheme(newState ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className={`theme-toggle-btn relative flex h-9 w-16 items-center rounded-full p-1 transition-all ${
        isLight
          ? 'bg-black/[0.02] border border-black/10 shadow-[inset_0_1px_0_rgba(0,0,0,0.05),0_0_20px_rgba(0,0,0,0.08)] hover:bg-black/[0.04] hover:border-black/20'
          : 'bg-white/[0.02] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(0,0,0,0.2)] hover:bg-white/[0.04] hover:border-white/20'
      } ${className}`}
      aria-label="Toggle theme"
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-300 ease-in-out ${
          isLight
            ? 'bg-neutral-900 shadow-[0_2px_4px_rgba(0,0,0,0.3)]'
            : 'bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)]'
        } ${isLight ? 'translate-x-7' : 'translate-x-0'}`}
      >
        {isLight ? (
          <svg
            className="h-4 w-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg
            className="h-4 w-4 text-black"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </div>
    </button>
  );
}
