import { useEffect, useState } from 'react';

/**
 * Tracks the app-wide light/dark preference for the IIL workspace.
 *
 * Theme state lives on `<html class="light">` (written by the shared
 * `ThemeToggle` + the inline boot script in index.html). The workspace consumes
 * it as an explicit token theme rather than the Landing page's invert-filter, so
 * we observe the class list and mirror it into a `data-theme` value.
 *
 * While mounted, the workspace also stamps `.iil-workspace` on `<html>` so the
 * global `html.light` invert-filter opts out (see index.css) — gold stays gold.
 */
export function useWorkspaceTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('light')
      ? 'light'
      : 'dark'
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('iil-workspace');

    const sync = () =>
      setTheme(root.classList.contains('light') ? 'light' : 'dark');
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      root.classList.remove('iil-workspace');
    };
  }, []);

  return theme;
}
