import { useState } from 'react';
import Editor from './components/Editor';
import ResultsGrid from './components/ResultsGrid';
import ErrorDisplay from './components/ErrorDisplay';
import Toolbar from './components/Toolbar';
import { executeQuery } from './api/queryApi';

const DEFAULT_SQL = 'SELECT * FROM employees LIMIT 10;';

function App() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState(null);
  const [rowCount, setRowCount] = useState(null);

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
    }

    setLoading(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">EzSQL</span>
        <span className="app-subtitle">Browser-Based SQL Interface</span>
      </header>

      <main className="app-main">
        <div className="editor-pane">
          <Toolbar
            onRun={handleRunQuery}
            loading={loading}
            rowCount={rowCount}
            executionTime={executionTime}
          />
          <Editor value={sql} onChange={setSql} onExecute={handleRunQuery} />
        </div>

        <div className="results-pane">
          {error && (
            <ErrorDisplay message={error} onDismiss={() => setError(null)} />
          )}
          <ResultsGrid result={result} />
        </div>
      </main>
    </div>
  );
}

export default App;
