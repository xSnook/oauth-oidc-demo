import { useEffect, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'oauth-oidc-demo-theme';
const themeModes: ThemeMode[] = ['system', 'light', 'dark'];

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getInitialTheme(): ThemeMode {
  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  return isThemeMode(storedTheme) ? storedTheme : 'system';
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode === 'system' ? 'light dark' : mode;
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === 'light') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
      </svg>
    );
  }

  if (mode === 'dark') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 14.4A7.5 7.5 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {themeModes.map((mode) => (
        <button
          key={mode}
          type="button"
          className="theme-option"
          aria-pressed={theme === mode}
          onClick={() => setTheme(mode)}
          title={`Use ${mode} theme`}
        >
          <ThemeIcon mode={mode} />
          <span>{mode}</span>
        </button>
      ))}
    </div>
  );
}

export function ThemeInitializer() {
  const [theme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return null;
}
