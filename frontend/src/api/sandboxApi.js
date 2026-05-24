import client from './client';

/**
 * POST /api/sandbox/reset/
 *
 * Wipes the current user's sandbox (anonymous or per-account) and re-seeds
 * it with the sample data.  Returns { reset: true } on success.
 */
export async function resetSandbox() {
  const res = await client.post('/api/sandbox/reset/');
  return res.data;
}
