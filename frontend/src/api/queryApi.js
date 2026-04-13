import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

/**
 * Execute a SQL query against the EzSQL sandbox backend.
 *
 * @param {string} sql - The SQL statement to run.
 * @returns {Promise<object>} Result object with either:
 *   Success: { columns, rows, row_count, execution_time_ms }
 *   Error:   { error }
 */
export async function executeQuery(sql) {
  try {
    const response = await client.post('/api/execute/', { query: sql });
    return response.data;
  } catch (err) {
    // Server returned a structured error (4xx / 5xx with JSON body).
    if (err.response && err.response.data) {
      return err.response.data;
    }
    // Network-level failure (backend unreachable, timeout, etc.).
    return { error: 'Network error: could not connect to the backend. Is it running?' };
  }
}
