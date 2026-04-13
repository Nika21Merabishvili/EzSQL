/**
 * Toolbar rendered above the SQL editor.
 * Contains the Run Query button, row-count badge, execution time badge,
 * and a keyboard-shortcut hint.
 *
 * Props:
 *   onRun         {function} - Trigger query execution.
 *   loading       {boolean}  - True while a query is in flight.
 *   rowCount      {number|null}  - Row count from the last successful result.
 *   executionTime {number|null}  - Execution time in ms from the last result.
 */
function Toolbar({ onRun, loading, rowCount, executionTime }) {
  return (
    <div className="toolbar">
      <button
        className={`run-btn${loading ? ' run-btn--loading' : ''}`}
        onClick={onRun}
        disabled={loading}
        title="Run query (Ctrl+Enter)"
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Running…
          </>
        ) : (
          '▶  Run Query'
        )}
      </button>

      <div className="toolbar-stats">
        {rowCount !== null && (
          <span className="stat-badge" title="Rows returned">
            {rowCount} {rowCount === 1 ? 'row' : 'rows'}
          </span>
        )}
        {executionTime !== null && (
          <span className="stat-badge" title="Server-side execution time">
            {executionTime} ms
          </span>
        )}
      </div>

      <span className="toolbar-hint">Ctrl + Enter to run</span>
    </div>
  );
}

export default Toolbar;
