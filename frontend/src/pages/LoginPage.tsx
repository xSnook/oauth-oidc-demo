import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, apiClient } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';
import type { User } from '../types';

interface OidcNonceResponse {
  nonce: string;
}

type GoogleButtonTheme = 'outline' | 'filled_blue';

function getGoogleButtonTheme(): GoogleButtonTheme {
  const explicitTheme =
    document.documentElement.dataset.theme ?? window.localStorage.getItem('oauth-oidc-demo-theme');

  if (explicitTheme === 'dark') {
    return 'filled_blue';
  }

  if (explicitTheme === 'light') {
    return 'outline';
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'filled_blue' : 'outline';
}

export function LoginPage() {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [googleButtonTheme, setGoogleButtonTheme] = useState(getGoogleButtonTheme);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = typeof location.state?.from === 'string' ? location.state.from : '/dashboard';

  useEffect(() => {
    const updateGoogleButtonTheme = () => setGoogleButtonTheme(getGoogleButtonTheme());
    const observer = new MutationObserver(updateGoogleButtonTheme);
    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');

    observer.observe(document.documentElement, {
      attributeFilter: ['data-theme'],
      attributes: true,
    });
    mediaQuery?.addEventListener('change', updateGoogleButtonTheme);

    return () => {
      observer.disconnect();
      mediaQuery?.removeEventListener('change', updateGoogleButtonTheme);
    };
  }, []);

  useEffect(() => {
    if (!googleClientId || user || loading || !googleButtonRef.current) {
      return;
    }

    let attempts = 0;
    let cancelled = false;
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
      void (async () => {
        try {
          const { nonce } = await apiClient.post<OidcNonceResponse>('/api/auth/nonce');
          if (cancelled || !window.google?.accounts.id || !googleButtonRef.current) {
            return;
          }

          googleButtonRef.current.replaceChildren();
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            nonce,
            callback: async (credentialResponse) => {
              setError(null);
              try {
                const signedInUser = await apiClient.post<User>('/api/auth/google', {
                  id_token: credentialResponse.credential,
                  nonce,
                });
                setUser(signedInUser);
                navigate(from, { replace: true });
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Google sign-in failed.');
              }
            },
          });
          const buttonWidth = googleButtonRef.current.clientWidth || 344;
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: googleButtonTheme,
            size: 'large',
            width: buttonWidth,
            text: 'continue_with',
            shape: 'pill',
          });
          setGoogleLoaded(true);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof ApiError ? err.message : 'Google sign-in failed.');
          }
        }
      })();
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [from, googleButtonTheme, googleClientId, loading, navigate, setUser, user]);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="login-shell">
      <div className="login-theme">
        <ThemeToggle />
      </div>

      <section className="login-hero" aria-labelledby="login-title">
        <div className="brand-lockup">
          <div className="brand-mark large">OO</div>
          <div>
            <p className="eyebrow">OAuth OIDC Demo</p>
            <h1 id="login-title">Sign in</h1>
          </div>
        </div>

        <div className="auth-diagram" aria-hidden="true">
          <div className="diagram-node browser">Browser</div>
          <div className="diagram-rail" />
          <div className="diagram-node api">FastAPI</div>
          <div className="diagram-rail" />
          <div className="diagram-node session">Session</div>
        </div>

        <p className="login-copy">
          Use your Google account to enter the demo workspace. The backend verifies the OIDC
          token, consumes a one-time nonce, and issues an HTTP-only session cookie.
        </p>
      </section>

      <section className="login-panel" aria-label="Authentication options">
        <div>
          <p className="eyebrow">Secure access</p>
          <h2>Continue with identity</h2>
          <p className="muted">Google sign-in is wired to the local FastAPI auth flow.</p>
        </div>

        <div className="login-actions">
          {googleClientId ? (
            <div className="provider-button google-provider">
              <div
                ref={googleButtonRef}
                className={`google-button${googleLoaded ? ' is-loaded' : ''}`}
                data-loading-label="Loading Google sign-in"
                aria-label={googleLoaded ? 'Google sign-in loaded' : 'Loading Google sign-in'}
              />
            </div>
          ) : (
            <div className="banner warning">
              Add <code>GOOGLE_CLIENT_ID</code> to your local <code>.env</code> to enable
              Google sign-in.
            </div>
          )}

        </div>

        {error ? <div className="banner error">{error}</div> : null}
      </section>
    </main>
  );
}
