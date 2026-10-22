export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'livepulse-theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

// A saved choice wins; otherwise follow the operating system preference.
export function resolveTheme(stored: unknown, prefersDark: boolean): Theme {
  if (isTheme(stored)) {
    return stored;
  }

  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

// Runs before first paint so the page never flashes the wrong theme.
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var t=s==='dark'||s==='light'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;
