import client from './client';

/**
 * Fetch the current user's authentication state from Django.
 *
 * @returns {Promise<object>}
 *   Signed in: { authenticated: true, email, name, avatar_url }
 *   Anonymous: { authenticated: false }
 */
export async function getMe() {
  try {
    const response = await client.get('/api/me/');
    return response.data;
  } catch {
    // Network or server error — treat as anonymous so the UI stays usable.
    return { authenticated: false };
  }
}
