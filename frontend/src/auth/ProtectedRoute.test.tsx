import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminUser } from '../test/fixtures';
import type { User } from '../types';
import { ProtectedRoute } from './ProtectedRoute';

const authState = vi.hoisted(() => ({
  value: {
    user: null as User | null,
    loading: false,
  },
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => authState.value,
}));

function LoginProbe() {
  const location = useLocation();
  return <span>login from {location.state?.from}</span>;
}

function renderRoute() {
  render(
    <MemoryRouter initialEntries={['/private']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/private" element={<span>private</span>} />
        </Route>
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.value = { user: null, loading: false };
  });

  it('shows a loading state while auth is booting', () => {
    authState.value = { user: null, loading: true };

    renderRoute();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects anonymous users to login with return state', () => {
    renderRoute();

    expect(screen.getByText('login from /private')).toBeInTheDocument();
  });

  it('renders protected content for authenticated users', () => {
    authState.value = { user: adminUser, loading: false };

    renderRoute();

    expect(screen.getByText('private')).toBeInTheDocument();
  });
});
