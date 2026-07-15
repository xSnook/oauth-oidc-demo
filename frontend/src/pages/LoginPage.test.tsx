import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { adminUser } from '../test/fixtures';
import type { User } from '../types';
import { LoginPage } from './LoginPage';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
    loading: false,
    setUser: vi.fn(),
  },
}));

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState.value,
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    apiClient: {
      post: apiMocks.post,
    },
  };
});

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<span>dashboard page</span>} />
        <Route path="/admin/users" element={<span>admin users page</span>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    authState.value = {
      user: null,
      loading: false,
      setUser: vi.fn(),
    };
    apiMocks.post.mockReset();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    Reflect.deleteProperty(window, 'google');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, 'google');
  });

  it('redirects authenticated users to the dashboard', () => {
    authState.value = {
      user: adminUser,
      loading: false,
      setUser: vi.fn(),
    };

    renderLogin();

    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('shows local configuration guidance when Google is not configured', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('GOOGLE_CLIENT_ID', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Microsoft sign-in unavailable' })).toBeDisabled();
  });

  it('initializes Google sign-in and navigates to the requested page', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
    let callback: ((response: { credential: string }) => void | Promise<void>) | undefined;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            callback = options.callback;
          }),
          renderButton: vi.fn(),
        },
      },
    };
    apiMocks.post.mockResolvedValueOnce(adminUser);

    renderLogin({ pathname: '/login', state: { from: '/admin/users' } });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(window.google.accounts.id.initialize).toHaveBeenCalledWith({
      client_id: 'google-client',
      callback: expect.any(Function),
    });
    expect(window.google.accounts.id.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), {
      theme: 'outline',
      size: 'large',
      width: 380,
      text: 'signin_with',
    });
    expect(screen.getByLabelText('Google sign-in loaded')).toBeInTheDocument();

    await act(async () => {
      await callback?.({ credential: 'id-token' });
    });

    expect(apiMocks.post).toHaveBeenCalledWith('/api/auth/google', { id_token: 'id-token' });
    expect(authState.value.setUser).toHaveBeenCalledWith(adminUser);
    expect(screen.getByText('admin users page')).toBeInTheDocument();
  });

  it('falls back to dashboard when login state has no return path', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
    let callback: ((response: { credential: string }) => void | Promise<void>) | undefined;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            callback = options.callback;
          }),
          renderButton: vi.fn(),
        },
      },
    };
    apiMocks.post.mockResolvedValueOnce(adminUser);

    renderLogin({ pathname: '/login', state: { from: 42 } });

    await act(async () => {
      vi.advanceTimersByTime(100);
      await callback?.({ credential: 'id-token' });
    });

    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('shows API errors from Google sign-in', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
    let callback: ((response: { credential: string }) => void | Promise<void>) | undefined;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            callback = options.callback;
          }),
          renderButton: vi.fn(),
        },
      },
    };
    apiMocks.post.mockRejectedValueOnce(new ApiError(401, 'BAD_TOKEN', 'Bad token.'));

    renderLogin();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await callback?.({ credential: 'id-token' });
    });

    expect(screen.getByText('Bad token.')).toBeInTheDocument();
  });

  it('shows fallback errors from Google sign-in', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
    let callback: ((response: { credential: string }) => void | Promise<void>) | undefined;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            callback = options.callback;
          }),
          renderButton: vi.fn(),
        },
      },
    };
    apiMocks.post.mockRejectedValueOnce(new Error('network'));

    renderLogin();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await callback?.({ credential: 'id-token' });
    });

    expect(screen.getByText('Google sign-in failed.')).toBeInTheDocument();
  });

  it('reports when Google never loads', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');

    renderLogin();

    await act(async () => {
      vi.advanceTimersByTime(5200);
    });

    expect(
      screen.getByText('Google sign-in did not load. Check your network and OAuth client ID.'),
    ).toBeInTheDocument();
  });

  it('does not initialize Google while auth is still loading', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'google-client');
    authState.value = {
      user: null,
      loading: true,
      setUser: vi.fn(),
    };
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: vi.fn(),
        },
      },
    };

    renderLogin();

    expect(window.google.accounts.id.initialize).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Loading Google sign-in')).toBeInTheDocument();
  });
});
