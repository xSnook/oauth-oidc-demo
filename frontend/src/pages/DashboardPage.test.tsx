import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { adminUser, dashboard, regularUser } from '../test/fixtures';
import type { User } from '../types';
import { DashboardPage } from './DashboardPage';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
  },
}));

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState.value,
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    apiClient: {
      get: apiMocks.get,
    },
  };
});

function renderPage() {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    authState.value = { user: adminUser };
    apiMocks.get.mockReset();
  });

  it('renders dashboard stats and admin link', async () => {
    apiMocks.get.mockResolvedValueOnce(dashboard);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Welcome, Admin User' })).toBeInTheDocument();
    expect(screen.getAllByText('...')).toHaveLength(2);
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AdministrationManage users/ })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it('renders email fallback and hides admin link for non-admin users', async () => {
    authState.value = { user: { ...regularUser, display_name: null } };
    apiMocks.get.mockResolvedValueOnce(dashboard);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Welcome, user@example.com' })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/dashboard'));
    expect(screen.queryByRole('link', { name: /Manage users/ })).not.toBeInTheDocument();
  });

  it('shows API errors', async () => {
    apiMocks.get.mockRejectedValueOnce(new ApiError(500, 'BROKEN', 'Dashboard is broken.'));

    renderPage();

    expect(await screen.findByText('Dashboard is broken.')).toBeInTheDocument();
  });

  it('shows a fallback error for unknown failures', async () => {
    apiMocks.get.mockRejectedValueOnce(new Error('network'));

    renderPage();

    expect(await screen.findByText('Dashboard failed to load.')).toBeInTheDocument();
  });

  it('renders without a user and without an admin badge', async () => {
    authState.value = { user: null };
    apiMocks.get.mockResolvedValueOnce(dashboard);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Welcome,' })).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/dashboard'));
  });

  it('ignores successful dashboard responses after unmount', async () => {
    const request = deferred<typeof dashboard>();
    apiMocks.get.mockReturnValueOnce(request.promise);

    const { unmount } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    unmount();
    await act(async () => {
      request.resolve(dashboard);
      await request.promise;
    });

    expect(apiMocks.get).toHaveBeenCalledWith('/api/dashboard');
  });

  it('ignores failed dashboard responses after unmount', async () => {
    const request = deferred<typeof dashboard>();
    apiMocks.get.mockReturnValueOnce(request.promise);

    const { unmount } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    unmount();
    await act(async () => {
      request.reject(new Error('network'));
      await request.promise.catch(() => undefined);
    });

    expect(apiMocks.get).toHaveBeenCalledWith('/api/dashboard');
  });
});
