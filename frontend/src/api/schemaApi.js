import client from './client';

/**
 * Fetch the sandbox database schema.
 *
 * @returns {Promise<object>}
 *   Success: { schemas: [{ name, tables: [{ name, type, columns: [...] }] }] }
 *   Error:   { error: "..." }
 */
export async function getSchema() {
  try {
    const response = await client.get('/api/schema/');
    return response.data;
  } catch (err) {
    if (err.response && err.response.data) {
      return err.response.data;
    }
    return { error: 'Network error: could not fetch schema.' };
  }
}
