import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUser, ownerUser, regularUser } from '../test/fixtures';
import type { User } from '../types';
import { Layout } from './Layout';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
    logout: vi.fn(),
  },
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState.value,
}));

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<span>dashboard page</span>} />
          <Route path="/architecture" element={<span>architecture page</span>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  beforeEach(() => {
    authState.value = {
      user: regularUser,
      logout: vi.fn(),
    };
  });

  it('renders regular navigation and logs out', async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Architecture' })).toHaveAttribute(
      'href',
      '/architecture',
    );
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(authState.value.logout).toHaveBeenCalledTimes(1);
  });

  it('shows admin navigation for admins', () => {
    authState.value = {
      user: adminUser,
      logout: vi.fn(),
    };

    renderLayout();

    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
  });

  it('shows admin navigation for owners', () => {
    authState.value = {
      user: ownerUser,
      logout: vi.fn(),
    };

    renderLayout();

    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
  });
});
