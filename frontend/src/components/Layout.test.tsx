import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('shows theme options from the profile trigger', async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(screen.queryByRole('button', { name: 'dark' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open profile options for Regular User' }));

    expect(screen.getByRole('button', { name: 'system' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument();
  });

  it('closes the profile popover from outside pointer and Escape interactions', async () => {
    const user = userEvent.setup();
    renderLayout();

    const profileTrigger = screen.getByRole('button', {
      name: 'Open profile options for Regular User',
    });

    await user.click(profileTrigger);
    expect(screen.getByRole('dialog', { name: 'Profile theme options' })).toBeInTheDocument();

    fireEvent.pointerDown(within(screen.getByRole('dialog')).getByText('Theme'));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('dialog', { name: 'Profile theme options' })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog', { name: 'Profile theme options' })).not.toBeInTheDocument();

    await user.click(profileTrigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Profile theme options' })).not.toBeInTheDocument();
  });

  it('falls back to email or signed-in identity text when display name is missing', () => {
    authState.value = {
      user: { ...regularUser, display_name: '' },
      logout: vi.fn(),
    };

    renderLayout();

    expect(
      screen.getByRole('button', { name: 'Open profile options for user@example.com' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('user@example.com')).toHaveLength(2);
  });

  it('renders a signed-in fallback when no user object is available', () => {
    authState.value = {
      user: null,
      logout: vi.fn(),
    };

    renderLayout();

    expect(
      screen.getByRole('button', { name: 'Open profile options for Signed in' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
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
