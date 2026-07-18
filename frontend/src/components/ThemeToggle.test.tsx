import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeInitializer, ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
    window.localStorage.clear();
  });

  it('applies the stored theme when initialized at the app root', async () => {
    window.localStorage.setItem('oauth-oidc-demo-theme', 'dark');

    render(<ThemeInitializer />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('falls back from invalid storage and persists selected modes', async () => {
    window.localStorage.setItem('oauth-oidc-demo-theme', 'neon');
    const user = userEvent.setup();

    render(<ThemeToggle />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('system'));
    expect(screen.getByRole('button', { name: 'system' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.style.colorScheme).toBe('light dark');

    await user.click(screen.getByRole('button', { name: 'dark' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem('oauth-oidc-demo-theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'light' }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem('oauth-oidc-demo-theme')).toBe('light');
  });
});
