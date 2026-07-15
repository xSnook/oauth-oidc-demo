import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { adminUser, regularUser, userList } from '../test/fixtures';
import type { User } from '../types';
import { AdminUsersPage } from './AdminUsersPage';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
  },
}));

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
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
      patch: apiMocks.patch,
    },
  };
});

function rowFor(email: string) {
  return screen.getByText(email).closest('tr')!;
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

describe('AdminUsersPage', () => {
  beforeEach(() => {
    authState.value = { user: adminUser };
    apiMocks.get.mockReset();
    apiMocks.patch.mockReset();
  });

  it('loads users and disables current-user controls', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);

    render(<AdminUsersPage />);

    expect(screen.getByText('Loading users...')).toBeInTheDocument();
    expect(await screen.findByText('3 users')).toBeInTheDocument();

    const selfRow = rowFor('admin@example.com');
    expect(within(selfRow).getByText('(you)')).toBeInTheDocument();
    expect(within(selfRow).getByRole('combobox')).toBeDisabled();
    expect(within(selfRow).getByRole('checkbox')).toBeDisabled();

    const microsoftRow = rowFor('microsoft@example.com');
    expect(within(microsoftRow).getByText('-')).toBeInTheDocument();
    expect(within(microsoftRow).getByText('microsoft')).toHaveClass('provider-microsoft');
    expect(within(microsoftRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('ignores successful user loads after unmount', async () => {
    const request = deferred<typeof userList>();
    apiMocks.get.mockReturnValueOnce(request.promise);

    const { unmount } = render(<AdminUsersPage />);

    unmount();
    await act(async () => {
      request.resolve(userList);
      await request.promise;
    });

    expect(apiMocks.get).toHaveBeenCalledWith('/api/users');
  });

  it('ignores failed user loads after unmount', async () => {
    const request = deferred<typeof userList>();
    apiMocks.get.mockReturnValueOnce(request.promise);

    const { unmount } = render(<AdminUsersPage />);

    unmount();
    await act(async () => {
      request.reject(new Error('network'));
      await request.promise.catch(() => undefined);
    });

    expect(apiMocks.get).toHaveBeenCalledWith('/api/users');
  });

  it('updates role and status after the server confirms', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);
    apiMocks.patch
      .mockResolvedValueOnce({ ...regularUser, role: 'admin' })
      .mockResolvedValueOnce({ ...regularUser, role: 'admin', is_active: false });
    const user = userEvent.setup();

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    const regularRow = rowFor('user@example.com');
    await user.selectOptions(within(regularRow).getByRole('combobox'), 'admin');

    await waitFor(() =>
      expect(apiMocks.patch).toHaveBeenCalledWith('/api/users/2/role', { role: 'admin' }),
    );
    expect(within(regularRow).getByRole('combobox')).toHaveValue('admin');

    await user.click(within(regularRow).getByRole('checkbox'));

    await waitFor(() =>
      expect(apiMocks.patch).toHaveBeenCalledWith('/api/users/2/status', { is_active: false }),
    );
    expect(within(regularRow).getByText('Inactive')).toBeInTheDocument();
  });

  it('does not call update endpoints when values do not change', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    const regularRow = rowFor('user@example.com');
    fireEvent.change(within(regularRow).getByRole('combobox'), { target: { value: 'user' } });
    fireEvent.change(within(regularRow).getByRole('checkbox'), { target: { checked: true } });

    expect(apiMocks.patch).not.toHaveBeenCalled();
  });

  it('does not call status update when a checkbox event keeps the same value', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    const checkbox = within(rowFor('user@example.com')).getByRole('checkbox') as HTMLInputElement;
    checkbox.checked = false;
    fireEvent.click(checkbox);

    expect(apiMocks.patch).not.toHaveBeenCalled();
  });

  it('shows and dismisses load errors', async () => {
    apiMocks.get.mockRejectedValueOnce(new ApiError(500, 'BROKEN', 'Users are broken.'));
    const user = userEvent.setup();

    render(<AdminUsersPage />);

    expect(await screen.findByText('Users are broken.')).toBeInTheDocument();
    expect(screen.getByText('0 users')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText('Users are broken.')).not.toBeInTheDocument();
  });

  it('shows fallback load errors for unknown failures', async () => {
    apiMocks.get.mockRejectedValueOnce(new Error('network'));

    render(<AdminUsersPage />);

    expect(await screen.findByText('Users failed to load.')).toBeInTheDocument();
  });

  it('keeps the row unchanged when role updates fail', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);
    apiMocks.patch.mockRejectedValueOnce(new ApiError(400, 'BAD_ROLE', 'Role update denied.'));
    const user = userEvent.setup();

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    const regularRow = rowFor('user@example.com');
    await user.selectOptions(within(regularRow).getByRole('combobox'), 'admin');

    expect(await screen.findByText('Role update denied.')).toBeInTheDocument();
    expect(within(regularRow).getByRole('combobox')).toHaveValue('user');
  });

  it('shows fallback errors when role updates fail unexpectedly', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);
    apiMocks.patch.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    await user.selectOptions(within(rowFor('user@example.com')).getByRole('combobox'), 'admin');

    expect(await screen.findByText('Role update failed.')).toBeInTheDocument();
  });

  it('shows fallback errors when status updates fail', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);
    apiMocks.patch.mockRejectedValueOnce(new Error('network'));
    const user = userEvent.setup();

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    const regularRow = rowFor('user@example.com');
    await user.click(within(regularRow).getByRole('checkbox'));

    expect(await screen.findByText('Status update failed.')).toBeInTheDocument();
    expect(within(regularRow).getByText('Active')).toBeInTheDocument();
  });

  it('shows API errors when status updates fail', async () => {
    apiMocks.get.mockResolvedValueOnce(userList);
    apiMocks.patch.mockRejectedValueOnce(new ApiError(400, 'BAD_STATUS', 'Status update denied.'));
    const user = userEvent.setup();

    render(<AdminUsersPage />);

    await screen.findByText('user@example.com');
    await user.click(within(rowFor('user@example.com')).getByRole('checkbox'));

    expect(await screen.findByText('Status update denied.')).toBeInTheDocument();
  });
});
