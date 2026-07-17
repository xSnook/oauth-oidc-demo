import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUser } from './test/fixtures';
import type { User } from './types';
import { App } from './App';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
    loading: false,
    logout: vi.fn(),
    setUser: vi.fn(),
  },
}));

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('./auth/AuthContext', () => ({
  useAuth: () => authState.value,
}));

vi.mock('./api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/client')>();
  return {
    ...actual,
    apiClient: {
      get: apiMocks.get,
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

function renderApp(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    authState.value = {
      user: adminUser,
      loading: false,
      logout: vi.fn(),
      setUser: vi.fn(),
    };
    apiMocks.get.mockResolvedValue({ stats: { total_users: 1, active_users: 1 }, message: 'ok' });
  });

  it('redirects the root route to the dashboard', async () => {
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Welcome, Admin User' })).toBeInTheDocument();
  });

  it('redirects unknown routes to the dashboard', async () => {
    renderApp('/missing');

    expect(await screen.findByRole('heading', { name: 'Welcome, Admin User' })).toBeInTheDocument();
  });

  it('renders the architecture page for authenticated users', () => {
    renderApp('/architecture');

    expect(screen.getByRole('heading', { name: 'How the demo is put together' })).toBeInTheDocument();
  });
});
