import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Role } from '../types';
import { ThemeToggle } from './ThemeToggle';

function DashboardIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="8" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="15" width="7" height="6" rx="2" />
    </svg>
  );
}

function ArchitectureIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M21 20v-2.2a3.5 3.5 0 0 0-2.5-3.4M16.5 3.4a4 4 0 0 1 0 7.2" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10 17 15 12l-5-5M15 12H3" />
      <path d="M14 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4" />
    </svg>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const displayName = user?.display_name || user?.email || 'Signed in';
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application">
        <div className="brand-block">
          <div className="brand-mark">OO</div>
          <div>
            <span>OAuth OIDC</span>
            <strong>Control Room</strong>
          </div>
        </div>

        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/dashboard">
            <DashboardIcon />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/architecture">
            <ArchitectureIcon />
            <span>Architecture</span>
          </NavLink>
          {user?.role === Role.Owner || user?.role === Role.Admin ? (
            <NavLink to="/admin/users">
              <UsersIcon />
              <span>Users</span>
            </NavLink>
          ) : null}
        </nav>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <div className="brand-block compact header-brand">
            <div className="brand-mark">OO</div>
            <strong>OAuth OIDC</strong>
          </div>
          <div className="profile-panel" ref={profileRef} aria-label="Profile options">
            <div className="profile-row">
              <button
                type="button"
                className="profile-trigger"
                aria-label={`Open profile options for ${displayName}`}
                aria-expanded={profileOpen}
                aria-haspopup="dialog"
                onClick={() => setProfileOpen((open) => !open)}
              >
                <div className="avatar" aria-hidden="true">
                  {initials}
                </div>
                <div className="identity-copy">
                  <strong>{displayName}</strong>
                  <span>{user?.email}</span>
                </div>
                <svg className="chevron-icon" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button type="button" className="button quiet" onClick={() => void logout()}>
                <LogoutIcon />
                <span>Log out</span>
              </button>
            </div>
            {profileOpen ? (
              <div className="profile-popover" role="dialog" aria-label="Profile theme options">
                <p className="profile-popover-label">Theme</p>
                <ThemeToggle />
              </div>
            ) : null}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
