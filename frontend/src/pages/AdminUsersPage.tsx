import { useEffect, useState } from 'react';
import { ApiError, apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ProviderBadge } from '../components/ProviderBadge';
import { RoleBadge } from '../components/RoleBadge';
import { PageHero, SummaryCard } from '../components/ui';
import { Role, type User, type UserList } from '../types';

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Never';
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        const data = await apiClient.get<UserList>('/api/users');
        if (!cancelled) {
          setUsers(data.items);
          setTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Users failed to load.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  function replaceUser(updatedUser: User) {
    setUsers((items) => items.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
  }

  async function updateRole(target: User, role: Role) {
    if (target.role === role) {
      return;
    }
    setError(null);
    setSavingId(target.id);
    try {
      const updatedUser = await apiClient.patch<User>(`/api/users/${target.id}/role`, { role });
      replaceUser(updatedUser);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Role update failed.');
    } finally {
      setSavingId(null);
    }
  }

  async function updateStatus(target: User, isActive: boolean) {
    if (target.is_active === isActive) {
      return;
    }
    setError(null);
    setSavingId(target.id);
    try {
      const updatedUser = await apiClient.patch<User>(`/api/users/${target.id}/status`, {
        is_active: isActive,
      });
      replaceUser(updatedUser);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Status update failed.');
    } finally {
      setSavingId(null);
    }
  }

  const currentUserIsOwner = currentUser?.role === Role.Owner;
  const activeUsers = users.filter((item) => item.is_active).length;
  const adminUsers = users.filter(
    (item) => item.role === Role.Admin || item.role === Role.Owner,
  ).length;

  return (
    <section className="page-stack">
      <PageHero
        action={
          <div className="admin-count">
            <span>{loading ? 'Loading users...' : `${total} users`}</span>
          </div>
        }
        className="admin-heading"
        eyebrow="Admin"
        title="User management"
      >
        Manage account access without changing the underlying OAuth/OIDC login flow.
      </PageHero>

      {error ? (
        <div className="banner error dismissible">
          <span>{error}</span>
          <button type="button" className="button quiet" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="summary-strip" aria-label="User summary">
        <SummaryCard label="Total" value={loading ? '...' : total} />
        <SummaryCard label="Active" value={loading ? '...' : activeUsers} />
        <SummaryCard label="Elevated" value={loading ? '...' : adminUsers} />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Providers</th>
              <th>Role</th>
              <th>Active</th>
              <th>Created</th>
              <th>Last login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => {
              const isSelf = item.id === currentUser?.id;
              const isOwnerRow = item.role === Role.Owner;
              const isAdminRow = item.role === Role.Admin;
              const isProtectedOwner = isOwnerRow && !currentUserIsOwner;
              const isProtectedAdmin = isAdminRow && !currentUserIsOwner;
              const elevatedRowLocked = isProtectedOwner || isProtectedAdmin;
              const roleDisabled =
                isSelf || !currentUserIsOwner || elevatedRowLocked || savingId === item.id;
              const statusDisabled = isSelf || elevatedRowLocked || savingId === item.id;
              const roleTitle = isSelf
                ? 'You cannot change your own role or deactivate yourself'
                : isProtectedOwner
                  ? 'Only owners can change owner accounts'
                  : isProtectedAdmin
                    ? 'Only owners can change admin accounts'
                    : !currentUserIsOwner
                      ? 'Only owners can change account roles'
                      : undefined;
              const statusTitle = isSelf
                ? 'You cannot change your own role or deactivate yourself'
                : isProtectedOwner
                  ? 'Only owners can change owner accounts'
                  : isProtectedAdmin
                    ? 'Only owners can change admin accounts'
                    : undefined;

              return (
                <tr
                  className={roleDisabled || statusDisabled ? 'row-has-locked-controls' : undefined}
                  key={item.id}
                >
                  <td>
                    <div className="primary-cell">
                      <span className="email-text">{item.email}</span>
                      {isSelf ? <span className="muted">(you)</span> : null}
                    </div>
                  </td>
                  <td>{item.display_name ?? '-'}</td>
                  <td>
                    <div className="badge-row">
                      {item.auth_providers.map((provider) => (
                        <ProviderBadge key={provider} provider={provider} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <select
                      value={item.role}
                      disabled={roleDisabled}
                      title={roleTitle}
                      onChange={(event) => void updateRole(item, event.target.value as Role)}
                    >
                      <option value={Role.User}>user</option>
                      {currentUserIsOwner || item.role === Role.Admin ? (
                        <option value={Role.Admin}>admin</option>
                      ) : null}
                      {currentUserIsOwner || item.role === Role.Owner ? (
                        <option value={Role.Owner}>owner</option>
                      ) : null}
                    </select>
                    <span className="table-badge-fallback">
                      <RoleBadge role={item.role} />
                    </span>
                  </td>
                  <td>
                    <label
                      className={`switch-control${statusDisabled ? ' is-disabled' : ''}`}
                      title={statusTitle}
                      aria-disabled={statusDisabled}
                    >
                      <input
                        type="checkbox"
                        checked={item.is_active}
                        disabled={statusDisabled}
                        onChange={(event) => void updateStatus(item, event.target.checked)}
                      />
                      <span className="switch-track" aria-hidden="true" />
                      <span>{item.is_active ? 'Active' : 'Inactive'}</span>
                    </label>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>{formatDate(item.last_login_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
