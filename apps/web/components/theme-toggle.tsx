'use client';

import { isTheme, nextTheme, THEME_STORAGE_KEY } from '../lib/theme';

// The icon is chosen by CSS from <html data-theme>, so server and client
// markup always match and no theme state is needed during hydration.
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const current = isTheme(root.dataset.theme) ? root.dataset.theme : 'dark';
    const theme = nextTheme(current);

    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable in private mode; the switch still applies.
    }
  };

  return (
    <button
      aria-label="Switch between light and dark mode"
      className="theme-toggle"
      onClick={toggle}
      title="Switch between light and dark mode"
      type="button"
    >
      <svg
        aria-hidden="true"
        className="theme-toggle-sun"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <svg
        aria-hidden="true"
        className="theme-toggle-moon"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}
