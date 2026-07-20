import { useEffect, useState } from 'react';
import { ApiError, apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RoleBadge } from '../components/RoleBadge';
import { DetailList, LinkPanel, MetricCard, PageHero, Panel } from '../components/ui';
import { Role, type Dashboard } from '../types';

function UsersMetricIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M21 20v-2.2a3.5 3.5 0 0 0-2.5-3.4M16.5 3.4a4 4 0 0 1 0 7.2" />
    </svg>
  );
}

function CheckMetricIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SessionMetricIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRatio =
    dashboard && dashboard.stats.total_users > 0
      ? Math.round((dashboard.stats.active_users / dashboard.stats.total_users) * 100)
      : 0;
  const canManageUsers = user?.role === Role.Owner || user?.role === Role.Admin;

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
      <PageHero
        action={user ? <RoleBadge role={user.role} /> : null}
        className="dashboard-hero"
        eyebrow="Dashboard"
        title={`Welcome, ${user?.display_name ?? user?.email ?? ''}`}
      >
        {dashboard?.message ??
          'Session status, account posture, and administrative entry points are collected here.'}
      </PageHero>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="stat-grid">
        <MetricCard
          caption="Registered local accounts"
          icon={<UsersMetricIcon />}
          label="Total users"
          tone="total"
          value={dashboard?.stats.total_users ?? '...'}
        />
        <MetricCard
          caption={dashboard ? `${activeRatio}% of accounts enabled` : 'Waiting for server stats'}
          icon={<CheckMetricIcon />}
          label="Active users"
          tone="active"
          value={dashboard?.stats.active_users ?? '...'}
        />
        <MetricCard
          caption="Authenticated with a backend-issued cookie"
          icon={<SessionMetricIcon />}
          label="Session"
          tone="session"
          value="OIDC"
        />
      </div>

      <div className="dashboard-grid">
        <Panel eyebrow="Current account" id="account-heading" title="Access profile">
          <DetailList
            items={[
              { label: 'Email', value: user?.email ?? 'Unknown' },
              { label: 'Display name', value: user?.display_name ?? '-' },
              { label: 'Role', value: user ? <RoleBadge role={user.role} /> : '-' },
              { label: 'Status', value: user?.is_active ? 'Active' : 'Inactive' },
            ]}
          />
        </Panel>

        <Panel eyebrow="Next actions" id="actions-heading" title="Workspace shortcuts">
          {canManageUsers ? (
            <LinkPanel eyebrow="Administration" title="Manage users" to="/admin/users">
              Review roles, activation status, and connected providers.
            </LinkPanel>
          ) : null}
          <LinkPanel eyebrow="Architecture" secondary title="Review auth flow" to="/architecture">
            Trace how the browser, FastAPI API, Redis nonce, and session cookie fit together.
          </LinkPanel>
        </Panel>
      </div>
    </section>
  );
}
