import { useState, useEffect } from 'react';

const PAGE_SIZE = 100;

/**
 * Tabular display of query results with sticky headers and pagination.
 *
 * Props:
 *   result {object|null} - Response from the API:
 *     { columns: string[], rows: any[][], row_count: number }
 *     Pass null to show the empty/idle state.
 */
function ResultsGrid({ result }) {
  const [page, setPage] = useState(0);

  // Reset to first page whenever the result set changes.
  useEffect(() => {
    setPage(0);
  }, [result]);

  if (!result) {
    return (
      <div className="results-empty">
        <p>Run a query above to see results here.</p>
      </div>
    );
  }

  if (result.row_count === 0) {
    return (
      <div className="results-empty">
        <p>Query returned no results.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(result.rows.length / PAGE_SIZE);
  const pageRows = result.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="results-grid">
      <div className="results-table-wrapper">
        <table className="results-table">
          <thead>
            <tr>
              {result.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, rowIdx) => (
              <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'row-even' : 'row-odd'}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx}>
                    {cell === null ? <em className="null-value">NULL</em> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="results-footer">
        <span className="row-count">
          Showing {result.row_count} {result.row_count === 1 ? 'row' : 'rows'}
        </span>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              ← Prev
            </button>
            <span className="pagination-info">
              Page {page + 1} / {totalPages}
            </span>
            <button
              className="pagination-btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResultsGrid;
