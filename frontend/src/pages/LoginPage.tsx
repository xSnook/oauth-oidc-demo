import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../types';

export function LoginPage() {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state?.from === 'string' ? location.state.from : '/dashboard';

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
      setGoogleLoaded(true);
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (credentialResponse) => {
          setError(null);
          try {
            const signedInUser = await apiClient.post<User>('/api/auth/google', {
              id_token: credentialResponse.credential,
            });
            setUser(signedInUser);
            navigate(from, { replace: true });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Google sign-in failed.');
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 440,
        text: 'signin_with',
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [from, loading, navigate, setUser, user]);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-mark large">OO</div>
        <p className="eyebrow">OAuth OIDC Demo</p>
        <h1 id="login-title">Sign in</h1>
        <p className="muted">Use your Google account to continue.</p>

        <div className="login-actions">
          {googleClientId ? (
            <div
              ref={googleButtonRef}
              className="google-button"
              aria-label={googleLoaded ? 'Google sign-in loaded' : 'Loading Google sign-in'}
            />
          ) : (
            <div className="banner warning">
              Add <code>GOOGLE_CLIENT_ID</code> to your local <code>.env</code> to enable
              Google sign-in.
            </div>
          )}

          <button
            type="button"
            className="button secondary full-width"
            disabled
            title="Microsoft sign-in is not configured yet"
          >
            Microsoft sign-in unavailable
          </button>
        </div>

        {error ? <div className="banner error">{error}</div> : null}
      </section>
    </main>
  );
}
