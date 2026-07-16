import { useEffect, useState } from 'react';
import { ApiError, apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ProviderBadge } from '../components/ProviderBadge';
import { RoleBadge } from '../components/RoleBadge';
import { Role, type User, type UserList } from '../types';

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

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>User management</h1>
          <p className="muted">{loading ? 'Loading users...' : `${total} users`}</p>
        </div>
      </div>

      {error ? (
        <div className="banner error dismissible">
          <span>{error}</span>
          <button type="button" className="button ghost" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

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
            </tr>
          </thead>
          <tbody>
            {users.map((item) => {
              const isSelf = item.id === currentUser?.id;
              const isProtectedOwner = item.role === Role.Owner && !currentUserIsOwner;
              const disabled = isSelf || isProtectedOwner || savingId === item.id;
              const controlTitle = isSelf
                ? 'You cannot change your own role or deactivate yourself'
                : isProtectedOwner
                  ? 'Only owners can change owner accounts'
                : undefined;

              return (
                <tr key={item.id}>
                  <td>
                    <div className="primary-cell">
                      <span>{item.email}</span>
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
                      disabled={disabled}
                      title={controlTitle}
                      onChange={(event) => void updateRole(item, event.target.value as Role)}
                    >
                      <option value={Role.User}>user</option>
                      <option value={Role.Admin}>admin</option>
                      {currentUserIsOwner || item.role === Role.Owner ? (
                        <option value={Role.Owner}>owner</option>
                      ) : null}
                    </select>
                    <span className="table-badge-fallback">
                      <RoleBadge role={item.role} />
                    </span>
                  </td>
                  <td>
                    <label className="switch-control" title={controlTitle}>
                      <input
                        type="checkbox"
                        checked={item.is_active}
                        disabled={disabled}
                        onChange={(event) => void updateStatus(item, event.target.checked)}
                      />
                      <span>{item.is_active ? 'Active' : 'Inactive'}</span>
                    </label>
                  </td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
