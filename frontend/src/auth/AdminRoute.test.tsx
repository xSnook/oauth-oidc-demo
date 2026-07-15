import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUser, regularUser } from '../test/fixtures';
import type { User } from '../types';
import { AdminRoute } from './AdminRoute';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
    loading: false,
  },
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => authState.value,
}));

function renderRoute() {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<span>admin content</span>} />
        </Route>
        <Route path="/login" element={<span>login</span>} />
        <Route path="/dashboard" element={<span>dashboard</span>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute', () => {
  beforeEach(() => {
    authState.value = { user: null, loading: false };
  });

  it('shows a loading state while auth is booting', () => {
    authState.value = { user: null, loading: true };

    renderRoute();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects anonymous users to login', () => {
    renderRoute();

    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('redirects non-admin users to dashboard', () => {
    authState.value = { user: regularUser, loading: false };

    renderRoute();

    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('renders admin content for admins', () => {
    authState.value = { user: adminUser, loading: false };

    renderRoute();

    expect(screen.getByText('admin content')).toBeInTheDocument();
  });
});
