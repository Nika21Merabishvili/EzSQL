import client from './client';

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
    if (err.response && err.response.data) {
      return err.response.data;
    }
    return { error: 'Network error: could not connect to the backend. Is it running?' };
  }
}
