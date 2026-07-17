import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RoleBadge } from '../components/RoleBadge';
import { Role, type Dashboard } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const data = await apiClient.get<Dashboard>('/api/dashboard');
        if (!cancelled) {
          setDashboard(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Dashboard failed to load.');
        }
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Welcome, {user?.display_name ?? user?.email}</h1>
        </div>
        {user ? <RoleBadge role={user.role} /> : null}
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="stat-grid">
        <article className="stat-card">
          <span>Total users</span>
          <strong>{dashboard?.stats.total_users ?? '...'}</strong>
        </article>
        <article className="stat-card">
          <span>Active users</span>
          <strong>{dashboard?.stats.active_users ?? '...'}</strong>
        </article>
      </div>

      <div className="card-grid">
        {user?.role === Role.Owner || user?.role === Role.Admin ? (
          <Link className="link-card" to="/admin/users">
            <span>Administration</span>
            <strong>Manage users</strong>
          </Link>
        ) : null}
        <article className="placeholder-card">
          <span>More coming soon</span>
          <p>This dashboard is intentionally small for v1.</p>
        </article>
      </div>
    </section>
  );
}
