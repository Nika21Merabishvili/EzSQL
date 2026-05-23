/**
 * AuthWidget — shown in the top-right corner of the app header.
 *
 * Anonymous: "Sign in with Google" link (full-page redirect; allauth handles
 *            the OAuth dance and redirects back to /).
 *
 * Signed in: avatar (photo or initials fallback) + display name + Sign out.
 *            Sign out submits a POST form to /accounts/logout/ with the CSRF
 *            token read from the cookie.  allauth requires POST for logout
 *            (prevents CSRF-driven sign-out via a crafted GET link).
 */

import { useAuth } from '../context/AuthContext';

/** Read the Django csrftoken cookie value, or return empty string. */
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default function AuthWidget() {
  const { loading, authenticated, name, email, avatarUrl } = useAuth();

  // While the initial /api/me/ is in flight, render an invisible placeholder
  // so the header height doesn't jump.
  if (loading) {
    return <div className="auth-widget auth-widget--skeleton" aria-hidden="true" />;
  }

  if (!authenticated) {
    return (
      <a
        href="/accounts/google/login/"
        className="auth-signin-btn"
      >
        Sign in with Google
      </a>
    );
  }

  // Build initials from the display name (or fall back to email first char).
  const displayName = name || email || '?';
  const initials = displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = () => {
    // Programmatic POST so we can attach the CSRF token from the cookie.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/accounts/logout/';

    const csrf = document.createElement('input');
    csrf.type = 'hidden';
    csrf.name = 'csrfmiddlewaretoken';
    csrf.value = getCsrfToken();
    form.appendChild(csrf);

    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div className="auth-widget">
      <div className="auth-avatar" title={email ?? ''}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="auth-avatar-img" referrerPolicy="no-referrer" />
        ) : (
          <span className="auth-avatar-initials">{initials}</span>
        )}
      </div>
      <span className="auth-name">{displayName}</span>
      <button
        type="button"
        className="auth-signout-btn"
        onClick={handleSignOut}
      >
        Sign out
      </button>
    </div>
  );
}
