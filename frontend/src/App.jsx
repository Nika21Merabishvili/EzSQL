import { useState, useRef } from 'react';
import Editor from './components/Editor';
import ResultsGrid from './components/ResultsGrid';
import ErrorDisplay from './components/ErrorDisplay';
import Toolbar from './components/Toolbar';
import SchemaBrowser from './components/SchemaBrowser';
import { executeQuery } from './api/queryApi';

const DEFAULT_SQL = 'SELECT * FROM employees LIMIT 10;';

function App() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  // Bumping editorKey remounts CodeMirror with the new `sql` value — the
  // cleanest way to push external content into the uncontrolled editor.
  const [editorKey, setEditorKey] = useState(0);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState(null);
  const [rowCount, setRowCount] = useState(null);

  // Ref to the SchemaBrowser so we can call refresh() after each query.
  const schemaRef = useRef(null);

  // ── Query execution ───────────────────────────────────────────────────────

  const handleRunQuery = async () => {
    if (!sql.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setExecutionTime(null);
    setRowCount(null);

    const data = await executeQuery(sql);

    if (data.error) {
      setError(data.error);
    } else {
      setResult(data);
      setExecutionTime(data.execution_time_ms);
      setRowCount(data.row_count);

      // Refresh schema in parallel — fire-and-forget so the results panel
      // renders immediately without waiting for the schema fetch.
      schemaRef.current?.refresh();
    }

    setLoading(false);
  };

  // ── Schema sidebar callbacks ──────────────────────────────────────────────

  // Called when the user clicks a table name in the sidebar.
  // We update the sql state and bump editorKey to remount CodeMirror so it
  // picks up the new content.
  const handleInsertQuery = (newSql) => {
    setSql(newSql);
    setEditorKey((k) => k + 1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">EzSQL</span>
        <span className="app-subtitle">Browser-Based SQL Interface</span>
      </header>

      <main className="app-main">
        {/* Left sidebar ─────────────────────────────────────────────────── */}
        <SchemaBrowser ref={schemaRef} onInsertQuery={handleInsertQuery} />

        {/* Right workbench: editor + results ────────────────────────────── */}
        <div className="workbench">
          <div className="editor-pane">
            <Toolbar
              onRun={handleRunQuery}
              loading={loading}
              rowCount={rowCount}
              executionTime={executionTime}
            />
            {/* key= forces a remount when inserting a query from the sidebar */}
            <Editor
              key={editorKey}
              value={sql}
              onChange={setSql}
              onExecute={handleRunQuery}
            />
          </div>

          <div className="results-pane">
            {error && (
              <ErrorDisplay message={error} onDismiss={() => setError(null)} />
            )}
            <ResultsGrid result={result} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
