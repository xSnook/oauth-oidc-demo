import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { adminUser } from '../test/fixtures';
import { AuthProvider, useAuth } from './AuthContext';

function Harness() {
  const { loading, logout, setUser, user } = useAuth();
  return (
    <div>
      <span>{loading ? 'loading' : 'ready'}</span>
      <span>{user?.email ?? 'anonymous'}</span>
      <button type="button" onClick={() => setUser(adminUser)}>
        set user
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

function OutsideProvider() {
  useAuth();
  return null;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
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

describe('AuthProvider', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('loads the current user', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(adminUser));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('treats failed session boot as anonymous', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401, statusText: 'Unauthorized' }));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('updates user state and logs out', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('nope', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'set user' }));
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'logout' }));
    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });

  it('clears the user when the API client reports a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(adminUser))
      .mockResolvedValueOnce(new Response('nope', { status: 401, statusText: 'Unauthorized' }));

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();

    await act(async () => {
      await expect(api('/api/dashboard')).rejects.toBeInstanceOf(ApiError);
    });

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
  });

  it('ignores a successful session response after unmount', async () => {
    const session = deferred<Response>();
    fetchMock.mockReturnValueOnce(session.promise);

    const { unmount } = render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    unmount();
    await act(async () => {
      session.resolve(jsonResponse(adminUser));
      await session.promise;
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.any(Object));
  });

  it('ignores a failed session response after unmount', async () => {
    const session = deferred<Response>();
    fetchMock.mockReturnValueOnce(session.promise);

    const { unmount } = render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    unmount();
    await act(async () => {
      session.reject(new Error('network'));
      await session.promise.catch(() => undefined);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.any(Object));
  });

  it('requires useAuth to be rendered inside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<OutsideProvider />)).toThrow('useAuth must be used within AuthProvider');

    consoleError.mockRestore();
  });
});
