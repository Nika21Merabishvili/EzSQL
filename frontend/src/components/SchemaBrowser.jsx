import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { getSchema } from '../api/schemaApi';

/**
 * SchemaBrowser — left sidebar showing the sandbox database schema.
 *
 * Props:
 *   onInsertQuery {function(sql: string)} — called when the user clicks a
 *     table name; the parent should push the SQL string into the editor.
 *
 * Ref API (via forwardRef):
 *   ref.current.refresh() — re-fetches the schema from the server.
 *   Call this from the execute handler after every successful query so that
 *   newly created or dropped tables appear immediately.
 */
const SchemaBrowser = forwardRef(function SchemaBrowser({ onInsertQuery }, ref) {
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSchemas, setExpandedSchemas] = useState({}); // { "schemaName": true|false }
  const [expandedTables, setExpandedTables] = useState({});   // { "schema.table": true|false }

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchSchema = async () => {
    setLoading(true);
    const data = await getSchema();
    if (data.schemas) {
      setSchemas(data.schemas);
      // Default: all schemas expanded
      const init = {};
      data.schemas.forEach((s) => { init[s.name] = true; });
      setExpandedSchemas(init);
    }
    setLoading(false);
  };

  // Expose refresh() to the parent component via ref.
  useImperativeHandle(ref, () => ({ refresh: fetchSchema }), []);

  useEffect(() => {
    fetchSchema();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────────────

  const toggleSchema = (name) =>
    setExpandedSchemas((prev) => ({ ...prev, [name]: !prev[name] }));

  const toggleTable = (key) =>
    setExpandedTables((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <aside className="schema-sidebar">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="schema-header">
        <span className="schema-title">Schema</span>
        <button
          className="schema-refresh-btn"
          onClick={fetchSchema}
          disabled={loading}
          title="Refresh schema"
          aria-label="Refresh schema"
        >
          ⟳
        </button>
      </div>

      {/* ── Tree ───────────────────────────────────────────────────────── */}
      <div className="schema-tree">
        {loading ? (
          <SkeletonRows />
        ) : schemas.length === 0 ? (
          <div className="schema-empty">
            No tables yet — run a <code>CREATE TABLE</code> statement to get
            started.
          </div>
        ) : (
          schemas.map((schema) => {
            const schemaOpen = !!expandedSchemas[schema.name];

            return (
              <div key={schema.name} className="schema-group">
                {/* Schema header — always shown, always collapsible */}
                <button
                  className="schema-schema-row"
                  onClick={() => toggleSchema(schema.name)}
                  title={`Schema: ${schema.name}`}
                  aria-expanded={schemaOpen}
                >
                  <span className="schema-chevron" aria-hidden="true">
                    {schemaOpen ? '▾' : '▸'}
                  </span>
                  <span className="schema-schema-name">{schema.name}</span>
                  <span className="schema-table-count">
                    {schema.tables.length}&nbsp;table{schema.tables.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {/* Tables (visible when schema is expanded) */}
                {schemaOpen &&
                  schema.tables.map((table) => {
                    const key = `${schema.name}.${table.name}`;
                    const tableOpen = !!expandedTables[key];

                    return (
                      <div key={key} className="schema-table-item">
                        {/* Row: clicking the button toggles; clicking the NAME also inserts SELECT */}
                        <button
                          className="schema-table-row schema-table-row--indented"
                          onClick={() => toggleTable(key)}
                          title={`${table.type === 'view' ? 'View' : 'Table'} — click to expand`}
                        >
                          <span className="schema-chevron" aria-hidden="true">
                            {tableOpen ? '▾' : '▸'}
                          </span>
                          <span
                            className="schema-table-name"
                            title="Click to insert SELECT query"
                            onClick={() => {
                              onInsertQuery(`SELECT * FROM ${table.name} LIMIT 100;`);
                            }}
                          >
                            {table.name}
                          </span>
                          <span className="schema-col-count">
                            {table.columns.length}&nbsp;col{table.columns.length !== 1 ? 's' : ''}
                          </span>
                        </button>

                        {/* Column list (shown when table is expanded) */}
                        {tableOpen && (
                          <ul className="schema-columns schema-columns--indented">
                            {table.columns.map((col) => (
                              <li key={col.name} className="schema-column">
                                {col.pk ? (
                                  <span className="schema-pk-icon" title="Primary key">
                                    🔑
                                  </span>
                                ) : (
                                  <span className="schema-pk-placeholder" />
                                )}
                                <span className="schema-col-name">{col.name}</span>
                                <span className="schema-col-type">{col.type}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
});

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="schema-skeleton">
      {[72, 55, 80, 60, 68].map((w, i) => (
        <div key={i} className="skeleton-row" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export default SchemaBrowser;
