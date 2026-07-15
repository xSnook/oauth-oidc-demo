import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

interface User {
  id: number;
  email: string;
  display_name: string | null;
  role: 'admin' | 'user';
  is_active: boolean;
  auth_providers: Array<'google' | 'microsoft'>;
  created_at: string;
  last_login_at: string | null;
}

interface ApiErrorBody {
  detail?: {
    code?: string;
    message?: string;
  };
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      message = body.detail?.message ?? message;
    } catch {
      // Keep the status-based fallback.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function App() {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentUser = useCallback(async () => {
    try {
      const currentUser = await request<User>('/api/auth/me');
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  useEffect(() => {
    if (!googleClientId || user || loading || !googleButtonRef.current) {
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!window.google?.accounts.id || !googleButtonRef.current) {
        if (attempts > 50) {
          window.clearInterval(timer);
          setError('Google sign-in did not load. Check your network and OAuth client ID.');
        }
        return;
      }

      window.clearInterval(timer);
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (credentialResponse) => {
          setError(null);
          try {
            const signedInUser = await request<User>('/api/auth/google', {
              method: 'POST',
              body: JSON.stringify({ id_token: credentialResponse.credential }),
            });
            setUser(signedInUser);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed.');
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
        text: 'signin_with',
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [loading, user]);

  async function logout() {
    setError(null);
    await request<void>('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Google auth sprint</p>
        <h1>OAuth OIDC Demo</h1>

        {loading ? <p>Checking your session...</p> : null}

        {!loading && user ? (
          <div className="stack">
            <div className="notice success">
              Signed in as <strong>{user.display_name ?? user.email}</strong>
            </div>
            <dl className="user-grid">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{user.role}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{user.auth_providers.join(', ')}</dd>
              </div>
            </dl>
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        ) : null}

        {!loading && !user ? (
          <div className="stack">
            <p>Sign in with your Google account to test the local auth flow.</p>
            {googleClientId ? (
              <div ref={googleButtonRef} className="google-button" />
            ) : (
              <div className="notice warning">
                Add <code>GOOGLE_CLIENT_ID</code> to your local <code>.env</code> to enable
                Google sign-in.
              </div>
            )}
            <button type="button" disabled title="Microsoft sign-in is not configured yet">
              Microsoft sign-in unavailable
            </button>
          </div>
        ) : null}

        {error ? <div className="notice error">{error}</div> : null}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
