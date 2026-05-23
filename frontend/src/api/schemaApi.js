import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

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
