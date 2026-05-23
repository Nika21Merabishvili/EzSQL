/**
 * Shared Axios instance used by all API modules.
 *
 * Key settings
 * ────────────
 * baseURL: empty string → all requests use a relative path (e.g. "/api/me/").
 *   The Vite dev-server proxy then forwards them to Django on :8000.
 *   In production set VITE_API_BASE to the backend origin if it differs from
 *   the frontend origin; otherwise leave it unset and rely on your reverse
 *   proxy (nginx etc.) to route /api and /accounts to Django.
 *
 * withCredentials: true → the browser sends the Django session cookie on
 *   every request, which is how DRF's SessionAuthentication identifies the
 *   signed-in user.
 *
 * CSRF interceptor → reads the csrftoken cookie that Django sets on the first
 *   GET /api/me/ response and attaches it as the X-CSRFToken header on every
 *   mutating request.  DRF's SessionAuthentication requires this for POST /
 *   PUT / PATCH / DELETE when the user is signed in.
 */

import axios from 'axios';

const client = axios.create({
  // Empty string → relative URLs → Vite proxy handles routing.
  // Set VITE_API_BASE (e.g. "https://api.example.com") only in production
  // when the frontend and backend live on different origins.
  baseURL: import.meta.env.VITE_API_BASE || '',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
  withCredentials: true,   // send Django session cookie with every request
});

// ── CSRF interceptor ──────────────────────────────────────────────────────────
// Django's CsrfViewMiddleware sets the csrftoken cookie (readable by JS — it
// is NOT HttpOnly).  We read it here and attach it as X-CSRFToken so that DRF
// can verify it against the session for signed-in users.
client.interceptors.request.use((config) => {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  if (match) {
    config.headers['X-CSRFToken'] = decodeURIComponent(match[1]);
  }
  return config;
});

export default client;
