import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">OO</div>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/dashboard">Dashboard</NavLink>
          {user?.role === 'owner' || user?.role === 'admin' ? (
            <NavLink to="/admin/users">Users</NavLink>
          ) : null}
        </nav>
        <div className="topbar-user">
          <span>{user?.email}</span>
          <button type="button" className="button ghost" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
