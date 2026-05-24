import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { getSchema } from '../api/schemaApi';
import { executeQuery } from '../api/queryApi';
import { resetSandbox } from '../api/sandboxApi';
import * as CF from '../lib/customFolders';
import { useAuth } from '../context/AuthContext';

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
 *
 * Custom folders live entirely in localStorage (key "ezsql:customFolders").
 * They are purely a UI organization layer; they do not affect query syntax.
 *
 * "Current folder" concept: whichever folder (or main) was most recently
 * clicked is the current destination. New tables created while a custom
 * folder is current are auto-assigned to it on the next schema refresh.
 */

// ── SQL helpers ───────────────────────────────────────────────────────────────

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COL_TYPES = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'];

/**
 * Generate a CREATE TABLE statement from table name + column descriptors.
 * Single PK → inline PRIMARY KEY. Multiple PKs → trailing constraint.
 */
function generateCreateTableSQL(tableName, columns) {
  const pkCols = columns.filter((c) => c.pk);
  const colDefs = columns.map((col) => {
    let def = `  ${col.name} ${col.type}`;
    if (pkCols.length === 1 && col.pk) def += ' PRIMARY KEY';
    if (col.notNull) def += ' NOT NULL';
    return def;
  });
  if (pkCols.length > 1) {
    colDefs.push(`  PRIMARY KEY (${pkCols.map((c) => c.name).join(', ')})`);
  }
  return `CREATE TABLE ${tableName} (\n${colDefs.join(',\n')}\n);`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const SchemaBrowser = forwardRef(function SchemaBrowser({ onInsertQuery }, ref) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = useAuth();

  // ── API state ─────────────────────────────────────────────────────────────
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Tree expansion ────────────────────────────────────────────────────────
  // Keys are schema names (e.g. "main") OR folder ids (e.g. "f_1729...")
  const [expandedSchemas, setExpandedSchemas] = useState({});
  // Keys are "<groupKey>.<tableName>"
  const [expandedTables, setExpandedTables] = useState({});

  // ── Custom folder state ───────────────────────────────────────────────────
  // Mirrors the in-memory cache in customFolders.js.
  // For anonymous users the cache is backed by localStorage; for signed-in
  // users it's backed by the backend (GET/PUT /api/folders/).
  const [folders, setFolders] = useState([]);
  const [assignments, setAssignments] = useState({}); // { tableName: folderId }
  const [currentFolderId, setCurrentFolderId] = useState(null); // implicit "you are here"

  // ── Save-error toast ──────────────────────────────────────────────────────
  // Set by the CF error handler when a background PUT fails twice.
  const [saveError, setSaveError] = useState(null);

  // ── Reset sandbox dialog ───────────────────────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  // ── Create-folder UI ──────────────────────────────────────────────────────
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState(null);
  const [newFolderForTable, setNewFolderForTable] = useState(null); // auto-assign after create

  // ── Rename-folder UI ──────────────────────────────────────────────────────
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState(null);

  // ── Delete-folder UI ──────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // ── Move-menu UI ──────────────────────────────────────────────────────────
  const [moveMenuTable, setMoveMenuTable] = useState(null);

  // ── Create-table modal ────────────────────────────────────────────────────
  // null = closed; { folderId: string|null, folderName: string } = open
  const [createTableTarget, setCreateTableTarget] = useState(null);
  const [ctTableName, setCtTableName] = useState('');
  const [ctTableNameError, setCtTableNameError] = useState(null);
  const [ctColumns, setCtColumns] = useState([]);
  const [ctColErrors, setCtColErrors] = useState({});
  const [ctShowSQL, setCtShowSQL] = useState(false);
  const [ctSubmitError, setCtSubmitError] = useState(null);
  const [ctSubmitting, setCtSubmitting] = useState(false);
  const colIdRef = useRef(0);

  // ── First-load guard for auto-assignment ──────────────────────────────────
  // null  → first fetch not yet complete; skip auto-assignment that run.
  // Set   → table names known after the previous fetch.
  const knownTablesRef = useRef(null);

  // ── Sync helper ───────────────────────────────────────────────────────────

  const syncFolders = (data) => {
    setFolders([...data.folders]);
    setAssignments({ ...data.assignments });
    setCurrentFolderId(data.currentFolderId ?? null);
  };

  // ── Current-folder setter (state + localStorage in one call) ──────────────

  const setCurrentFolder = (folderId) => {
    CF.setCurrentFolder(folderId);
    setCurrentFolderId(folderId);
  };

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchSchema = async () => {
    setLoading(true);

    // Snapshot existing table names BEFORE the await.
    // null means this is the very first fetch — skip auto-assignment that run.
    const prevTableNames = knownTablesRef.current;

    const data = await getSchema();
    if (data.schemas) {
      const allNames = new Set(
        data.schemas.flatMap((s) => s.tables.map((t) => t.name))
      );

      // Garbage-collect stale assignments (tables that no longer exist).
      const cleaned = CF.garbageCollect(allNames);

      // ── Auto-assign new tables to the current folder ──────────────────
      // Only runs on subsequent fetches (prevTableNames !== null).
      if (prevTableNames !== null && cleaned.currentFolderId) {
        const currentFolderExists = cleaned.folders.some(
          (f) => f.id === cleaned.currentFolderId
        );
        if (currentFolderExists) {
          // Tables in the new response that weren't known before and have no assignment.
          for (const name of allNames) {
            if (!prevTableNames.has(name) && !cleaned.assignments[name]) {
              CF.assignTable(name, cleaned.currentFolderId);
            }
          }
        } else {
          // Current folder was deleted outside normal flow — reset to main.
          CF.setCurrentFolder(null);
        }
        // Re-read after any writes above.
        Object.assign(cleaned, CF.load());
      }

      // Update the known-tables ref for the next fetch.
      knownTablesRef.current = allNames;

      setSchemas(data.schemas);
      syncFolders(cleaned);

      // Expand every real schema; preserve existing collapse state for custom folders.
      setExpandedSchemas((prev) => {
        const next = {};
        data.schemas.forEach((s) => { next[s.name] = true; });
        cleaned.folders.forEach((f) => {
          next[f.id] = f.id in prev ? prev[f.id] : true; // new folders default open
        });
        return next;
      });
    }
    setLoading(false);
  };

  useImperativeHandle(ref, () => ({ refresh: fetchSchema }), []);

  // ── Auth-aware initialisation ─────────────────────────────────────────────
  // Runs on mount (once auth finishes loading) and whenever the user signs
  // in or out.  CF.init():
  //   • anonymous → reads localStorage
  //   • signed in → fetches backend; migrates localStorage if backend empty
  // After init the schema is fetched so the sidebar reflects the new state.
  useEffect(() => {
    if (auth.loading) return; // wait for /api/me/ to resolve

    // Register the save-error handler so background PUT failures surface.
    CF.setErrorHandler((msg) => setSaveError(msg));

    const startup = async () => {
      // Reset the known-tables guard so auto-assignment doesn't fire on the
      // first schema fetch after every auth change.
      knownTablesRef.current = null;
      await CF.init(auth.authenticated);
      // fetchSchema reads from the CF cache (via garbageCollect + load) and
      // calls syncFolders at the end — no need to call it separately.
      fetchSchema();
    };
    startup();
  }, [auth.loading, auth.authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle helpers ────────────────────────────────────────────────────────

  const toggleSchema = (key) =>
    setExpandedSchemas((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleTable = (key) =>
    setExpandedTables((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Folder name validation ────────────────────────────────────────────────

  /** Returns an error string or null. excludeId skips self during rename. */
  const validateFolderName = (name, excludeId = null) => {
    const t = name.trim();
    if (!t) return 'Name cannot be empty.';
    if (t.toLowerCase() === 'main') return '"main" is a reserved name.';
    if (
      folders.some(
        (f) => f.id !== excludeId && f.name.toLowerCase() === t.toLowerCase()
      )
    )
      return 'A folder with that name already exists.';
    return null;
  };

  // ── Create folder ─────────────────────────────────────────────────────────

  const handleCreateFolder = () => {
    const err = validateFolderName(newFolderName);
    if (err) { setNewFolderError(err); return; }

    const id = CF.createFolder(newFolderName.trim());
    if (newFolderForTable) CF.assignTable(newFolderForTable, id);

    syncFolders(CF.load());
    setExpandedSchemas((prev) => ({ ...prev, [id]: true }));

    setNewFolderMode(false);
    setNewFolderName('');
    setNewFolderError(null);
    setNewFolderForTable(null);
  };

  const cancelNewFolder = () => {
    setNewFolderMode(false);
    setNewFolderName('');
    setNewFolderError(null);
    setNewFolderForTable(null);
  };

  // ── Rename folder ─────────────────────────────────────────────────────────

  const handleRenameFolder = (id) => {
    const err = validateFolderName(renameName, id);
    if (err) { setRenameError(err); return; }

    CF.renameFolder(id, renameName.trim());
    syncFolders(CF.load());

    setRenamingFolderId(null);
    setRenameName('');
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenamingFolderId(null);
    setRenameName('');
    setRenameError(null);
  };

  // ── Delete folder ─────────────────────────────────────────────────────────

  const handleDeleteFolder = (id) => {
    CF.deleteFolder(id);
    syncFolders(CF.load());
    setConfirmDeleteId(null);
  };

  // ── Move table ────────────────────────────────────────────────────────────

  const handleMoveTable = (tableName, folderId) => {
    if (folderId === null) {
      CF.unassignTable(tableName);
    } else {
      CF.assignTable(tableName, folderId);
    }
    syncFolders(CF.load());
    setMoveMenuTable(null);
  };

  // ── Create-table modal helpers ────────────────────────────────────────────

  const openCreateTableModal = (folderId, folderName) => {
    // Set as current folder so auto-assignment fires on the next schema refresh.
    setCurrentFolder(folderId);
    // Reset modal state.
    colIdRef.current = 0;
    const defaultCol = {
      id: `col_${++colIdRef.current}`,
      name: 'id',
      type: 'INTEGER',
      pk: true,
      notNull: true,
    };
    setCtTableName('');
    setCtTableNameError(null);
    setCtColumns([defaultCol]);
    setCtColErrors({});
    setCtShowSQL(false);
    setCtSubmitError(null);
    setCtSubmitting(false);
    setMoveMenuTable(null); // close any open move menu
    setCreateTableTarget({ folderId, folderName });
  };

  const closeCreateTableModal = () => {
    setCreateTableTarget(null);
  };

  const handleAddColumn = () => {
    setCtColumns((prev) => [
      ...prev,
      { id: `col_${++colIdRef.current}`, name: '', type: 'TEXT', pk: false, notNull: false },
    ]);
  };

  const handleRemoveColumn = (colId) => {
    setCtColumns((prev) => prev.filter((c) => c.id !== colId));
    setCtColErrors((prev) => {
      const next = { ...prev };
      delete next[colId];
      return next;
    });
  };

  const handleColumnChange = (colId, field, value) => {
    setCtColumns((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, [field]: value } : c))
    );
    if (field === 'name') {
      // Clear the error for this column when the user starts typing.
      setCtColErrors((prev) => {
        const next = { ...prev };
        delete next[colId];
        return next;
      });
    }
  };

  const validateCreateTable = () => {
    let valid = true;

    // Table name validation
    const tName = ctTableName.trim();
    if (!tName) {
      setCtTableNameError('Table name is required.');
      valid = false;
    } else if (!IDENT_RE.test(tName)) {
      setCtTableNameError(
        'Must start with a letter or _ and contain only letters, digits, _.'
      );
      valid = false;
    } else {
      const existing = new Set(
        schemas.flatMap((s) => s.tables.map((t) => t.name.toLowerCase()))
      );
      if (existing.has(tName.toLowerCase())) {
        setCtTableNameError('A table with that name already exists.');
        valid = false;
      } else {
        setCtTableNameError(null);
      }
    }

    // Column validation
    const colErrors = {};
    const seen = new Set();
    for (const col of ctColumns) {
      const cName = col.name.trim();
      if (!cName) {
        colErrors[col.id] = 'Name is required.';
        valid = false;
      } else if (!IDENT_RE.test(cName)) {
        colErrors[col.id] =
          'Must start with a letter or _ and contain only letters, digits, _.';
        valid = false;
      } else if (seen.has(cName.toLowerCase())) {
        colErrors[col.id] = 'Duplicate column name.';
        valid = false;
      } else {
        seen.add(cName.toLowerCase());
      }
    }
    setCtColErrors(colErrors);

    return valid;
  };

  const handleCreateTable = async () => {
    if (!validateCreateTable()) return;
    setCtSubmitting(true);
    setCtSubmitError(null);

    const sql = generateCreateTableSQL(ctTableName.trim(), ctColumns);
    const result = await executeQuery(sql);

    if (result.error) {
      // Keep modal open, show error at top.
      setCtSubmitError(result.error);
      setCtSubmitting(false);
    } else {
      // Success — close modal; schema refetch + reconciliation places the new table.
      setCreateTableTarget(null);
      setCtSubmitting(false);
      fetchSchema();
    }
  };

  // ── Reset sandbox ─────────────────────────────────────────────────────────

  const handleResetSandbox = async () => {
    setResetPending(true);
    try {
      await resetSandbox();
    } catch {
      // Even on network error, close the dialog and refresh — the server
      // may have succeeded; the sidebar refresh will reflect reality.
    }
    setShowResetConfirm(false);
    setResetPending(false);
    // Reset the known-tables guard so auto-assignment doesn't fire on the
    // first schema fetch after the reset (same logic as auth change).
    knownTablesRef.current = null;
    fetchSchema();
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  // All real tables from all schemas, tagged with their schema name.
  const allRealTables = schemas.flatMap((s) =>
    s.tables.map((t) => ({ ...t, schemaName: s.name }))
  );

  const tablesForFolder = (folderId) =>
    allRealTables.filter((t) => assignments[t.name] === folderId);

  // ── Table row renderer ────────────────────────────────────────────────────

  const renderTableRow = (table, groupKey) => {
    const expandKey = `${groupKey}.${table.name}`;
    const tableOpen = !!expandedTables[expandKey];
    const isMenuOpen = moveMenuTable === table.name;
    const tableFolder = assignments[table.name] ?? null; // null = main

    const handleTableRowClick = () => {
      toggleTable(expandKey);
      setCurrentFolder(tableFolder);
    };

    const handleTableNameClick = (e) => {
      e.stopPropagation();
      onInsertQuery(`SELECT * FROM ${table.name} LIMIT 100;`);
      setCurrentFolder(tableFolder);
    };

    return (
      <div key={table.name} className="schema-table-item">
        <div className="schema-table-row-wrap">
          <button
            className="schema-table-row schema-table-row--indented"
            onClick={handleTableRowClick}
            title={`${table.type === 'view' ? 'View' : 'Table'} — click to expand`}
          >
            <span className="schema-chevron" aria-hidden="true">
              {tableOpen ? '▾' : '▸'}
            </span>
            <span
              className="schema-table-name"
              title="Click to insert SELECT query"
              onClick={handleTableNameClick}
            >
              {table.name}
            </span>
            <span className="schema-col-count">
              {table.columns.length}&nbsp;col{table.columns.length !== 1 ? 's' : ''}
            </span>
          </button>

          {/* ⋯ Move-to-folder button — shown on hover via CSS */}
          <button
            className={`schema-move-btn${isMenuOpen ? ' schema-move-btn--active' : ''}`}
            title="Move to folder"
            aria-label={`Move ${table.name} to a folder`}
            onClick={(e) => {
              e.stopPropagation();
              setMoveMenuTable(isMenuOpen ? null : table.name);
            }}
          >
            ⋯
          </button>

          {/* Move menu */}
          {isMenuOpen && (
            <>
              {/* Transparent full-screen overlay — click anywhere to close */}
              <div
                className="schema-move-overlay"
                onClick={() => setMoveMenuTable(null)}
              />
              <div className="schema-move-menu">
                <div className="schema-move-menu-label">Move to folder</div>

                {folders.map((f) => (
                  <button
                    key={f.id}
                    className={`schema-move-menu-item${
                      tableFolder === f.id ? ' schema-move-menu-item--active' : ''
                    }`}
                    onClick={() => handleMoveTable(table.name, f.id)}
                  >
                    {f.name}
                  </button>
                ))}

                {folders.length > 0 && (
                  <div className="schema-move-menu-divider" />
                )}

                <button
                  className={`schema-move-menu-item${
                    tableFolder === null ? ' schema-move-menu-item--active' : ''
                  }`}
                  onClick={() => handleMoveTable(table.name, null)}
                >
                  main (no folder)
                </button>

                <div className="schema-move-menu-divider" />

                <button
                  className="schema-move-menu-item schema-move-menu-item--new"
                  onClick={() => {
                    setMoveMenuTable(null);
                    setNewFolderForTable(table.name);
                    setNewFolderMode(true);
                  }}
                >
                  + New folder…
                </button>
              </div>
            </>
          )}
        </div>

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
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const totalRealTables = allRealTables.length;
  const isEmpty = !loading && totalRealTables === 0 && folders.length === 0;

  return (
    <>
      <aside className="schema-sidebar">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="schema-header">
          <span className="schema-title">Schema</span>
          <div className="schema-header-actions">
            {!newFolderMode && (
              <button
                className="schema-new-folder-btn"
                onClick={() => setNewFolderMode(true)}
                title="Create a new folder"
              >
                + Folder
              </button>
            )}
            <button
              className="schema-refresh-btn"
              onClick={fetchSchema}
              disabled={loading}
              title="Refresh schema"
              aria-label="Refresh schema"
            >
              ⟳
            </button>
            <button
              className="schema-reset-btn"
              onClick={() => setShowResetConfirm(true)}
              disabled={loading || resetPending}
              title="Reset sandbox to sample data"
              aria-label="Reset sandbox"
            >
              ↺
            </button>
          </div>
        </div>

        {/* ── Save-error toast ────────────────────────────────────────────── */}
        {saveError && (
          <div className="schema-save-error" role="alert">
            <span>{saveError}</span>
            <button
              className="schema-save-error-dismiss"
              onClick={() => setSaveError(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Inline new-folder input ──────────────────────────────────────── */}
        {newFolderMode && (
          <div className="schema-new-folder-row">
            <input
              autoFocus
              className="schema-folder-input"
              value={newFolderName}
              placeholder="Folder name…"
              onChange={(e) => {
                setNewFolderName(e.target.value);
                setNewFolderError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') cancelNewFolder();
              }}
            />
            {newFolderError && (
              <div className="schema-input-error">{newFolderError}</div>
            )}
            {newFolderForTable && (
              <div className="schema-input-hint">
                Will assign <strong>{newFolderForTable}</strong> to new folder.
              </div>
            )}
          </div>
        )}

        {/* ── Tree ────────────────────────────────────────────────────────── */}
        <div className="schema-tree">
          {loading ? (
            <SkeletonRows />
          ) : isEmpty ? (
            <div className="schema-empty">
              No tables yet — use the{' '}
              <code>+ table</code> button on a folder header or run a{' '}
              <code>CREATE TABLE</code> statement.
            </div>
          ) : (
            <>
              {/* ── 1. Custom folders (above main, in creation order) ─────── */}
              {folders.map((folder) => {
                const folderOpen = !!expandedSchemas[folder.id];
                const folderTables = tablesForFolder(folder.id);
                const isRenaming = renamingFolderId === folder.id;
                const isConfirmDelete = confirmDeleteId === folder.id;
                const isCurrent = currentFolderId === folder.id;

                return (
                  <div key={folder.id} className="schema-group">
                    {/* Folder header (or rename input) */}
                    {isRenaming ? (
                      <div className="schema-rename-row">
                        <input
                          autoFocus
                          className="schema-folder-input"
                          value={renameName}
                          onChange={(e) => {
                            setRenameName(e.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder(folder.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                        />
                        {renameError && (
                          <div className="schema-input-error">{renameError}</div>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`schema-folder-header-wrap${
                          isCurrent ? ' schema-folder-header-wrap--current' : ''
                        }`}
                      >
                        <button
                          className="schema-schema-row schema-schema-row--custom"
                          onClick={() => {
                            toggleSchema(folder.id);
                            setCurrentFolder(folder.id);
                          }}
                          aria-expanded={folderOpen}
                          title={`Folder: ${folder.name}`}
                        >
                          <span className="schema-chevron" aria-hidden="true">
                            {folderOpen ? '▾' : '▸'}
                          </span>
                          <span className="schema-schema-name">{folder.name}</span>
                          <span className="schema-custom-badge">(custom)</span>
                          <span className="schema-table-count">
                            {folderTables.length}&nbsp;table{folderTables.length !== 1 ? 's' : ''}
                          </span>
                        </button>

                        {/* + table, Rename, Delete — visible on hover (or always when current) */}
                        <div className="schema-folder-controls">
                          <button
                            className="schema-folder-ctrl-btn schema-folder-ctrl-btn--add-table"
                            title={`Create a new table in ${folder.name}`}
                            aria-label={`Create table in ${folder.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreateTableModal(folder.id, folder.name);
                            }}
                          >
                            +
                          </button>
                          <button
                            className="schema-folder-ctrl-btn"
                            title="Rename folder"
                            aria-label={`Rename ${folder.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingFolderId(folder.id);
                              setRenameName(folder.name);
                            }}
                          >
                            ✏
                          </button>
                          <button
                            className="schema-folder-ctrl-btn schema-folder-ctrl-btn--del"
                            title="Delete folder"
                            aria-label={`Delete ${folder.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(folder.id);
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Inline delete confirmation */}
                    {isConfirmDelete && (
                      <div className="schema-delete-confirm">
                        <p>
                          Delete folder "{folder.name}"?<br />
                          Tables will move back to main.
                        </p>
                        <div className="schema-delete-confirm-btns">
                          <button
                            className="schema-confirm-btn schema-confirm-btn--danger"
                            onClick={() => handleDeleteFolder(folder.id)}
                          >
                            Delete
                          </button>
                          <button
                            className="schema-confirm-btn"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tables assigned to this folder */}
                    {folderOpen &&
                      folderTables.map((table) => renderTableRow(table, folder.id))}
                  </div>
                );
              })}

              {/* ── 2. Real schemas — show only unassigned tables ─────────── */}
              {schemas.map((schema) => {
                const schemaOpen = !!expandedSchemas[schema.name];
                // Filter out any table already claimed by a custom folder.
                const visibleTables = schema.tables.filter(
                  (t) => !assignments[t.name]
                );
                // Main is "current" when no custom folder is selected.
                const isMainCurrent = currentFolderId === null;

                return (
                  <div key={schema.name} className="schema-group">
                    <div
                      className={`schema-folder-header-wrap${
                        isMainCurrent
                          ? ' schema-folder-header-wrap--main-current'
                          : ''
                      }`}
                    >
                      <button
                        className="schema-schema-row"
                        onClick={() => {
                          toggleSchema(schema.name);
                          setCurrentFolder(null);
                        }}
                        aria-expanded={schemaOpen}
                        title={`Schema: ${schema.name}`}
                      >
                        <span className="schema-chevron" aria-hidden="true">
                          {schemaOpen ? '▾' : '▸'}
                        </span>
                        <span className="schema-schema-name">{schema.name}</span>
                        <span className="schema-table-count">
                          {visibleTables.length}&nbsp;table{visibleTables.length !== 1 ? 's' : ''}
                        </span>
                      </button>

                      <div className="schema-folder-controls">
                        <button
                          className="schema-folder-ctrl-btn schema-folder-ctrl-btn--add-table"
                          title={`Create a new table in ${schema.name}`}
                          aria-label={`Create table in ${schema.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openCreateTableModal(null, schema.name);
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {schemaOpen &&
                      visibleTables.map((table) =>
                        renderTableRow(table, schema.name)
                      )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>

      {/* ── Create Table Modal ──────────────────────────────────────────────── */}
      {createTableTarget && (
        <div
          className="ct-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateTableModal();
          }}
        >
          <div className="ct-dialog" role="dialog" aria-modal="true">
            {/* Dialog header */}
            <div className="ct-header">
              <h2 className="ct-title">
                New table in{' '}
                <span className="ct-folder-name">
                  {createTableTarget.folderName}
                </span>
              </h2>
              <button
                className="ct-close-btn"
                onClick={closeCreateTableModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Backend error banner */}
            {ctSubmitError && (
              <div className="ct-error-banner">
                <strong>Error:</strong> {ctSubmitError}
              </div>
            )}

            <div className="ct-body">
              {/* ── Table name ─────────────────────────────────────────── */}
              <div className="ct-field">
                <label className="ct-label" htmlFor="ct-table-name">
                  Table name
                </label>
                <input
                  id="ct-table-name"
                  className={`ct-input${ctTableNameError ? ' ct-input--error' : ''}`}
                  value={ctTableName}
                  placeholder="e.g. customers"
                  autoFocus
                  onChange={(e) => {
                    setCtTableName(e.target.value);
                    setCtTableNameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeCreateTableModal();
                  }}
                />
                {ctTableNameError && (
                  <div className="ct-field-error">{ctTableNameError}</div>
                )}
              </div>

              {/* ── Columns ────────────────────────────────────────────── */}
              <div className="ct-field">
                <label className="ct-label">Columns</label>
                <div className="ct-columns-list">
                  {ctColumns.map((col, idx) => (
                    <div key={col.id} className="ct-column-row">
                      <div className="ct-column-inputs">
                        <input
                          className={`ct-input ct-col-name-input${
                            ctColErrors[col.id] ? ' ct-input--error' : ''
                          }`}
                          value={col.name}
                          placeholder="column name"
                          aria-label={`Column ${idx + 1} name`}
                          onChange={(e) =>
                            handleColumnChange(col.id, 'name', e.target.value)
                          }
                        />
                        <select
                          className="ct-select"
                          value={col.type}
                          aria-label={`Column ${idx + 1} type`}
                          onChange={(e) =>
                            handleColumnChange(col.id, 'type', e.target.value)
                          }
                        >
                          {COL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <label
                          className="ct-checkbox-label"
                          title="Primary Key"
                        >
                          <input
                            type="checkbox"
                            checked={col.pk}
                            onChange={(e) =>
                              handleColumnChange(col.id, 'pk', e.target.checked)
                            }
                          />
                          <span>PK</span>
                        </label>
                        <label
                          className="ct-checkbox-label"
                          title="NOT NULL"
                        >
                          <input
                            type="checkbox"
                            checked={col.notNull}
                            onChange={(e) =>
                              handleColumnChange(col.id, 'notNull', e.target.checked)
                            }
                          />
                          <span>NN</span>
                        </label>
                        <button
                          className="ct-col-remove-btn"
                          title="Remove column"
                          disabled={ctColumns.length === 1}
                          onClick={() => handleRemoveColumn(col.id)}
                          aria-label={`Remove column ${idx + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                      {ctColErrors[col.id] && (
                        <div className="ct-field-error ct-col-error">
                          {ctColErrors[col.id]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button className="ct-add-col-btn" onClick={handleAddColumn}>
                  + Add column
                </button>
              </div>

              {/* ── Show SQL toggle ─────────────────────────────────────── */}
              <div className="ct-field">
                <label className="ct-show-sql-label">
                  <input
                    type="checkbox"
                    checked={ctShowSQL}
                    onChange={(e) => setCtShowSQL(e.target.checked)}
                  />
                  <span>Show SQL</span>
                </label>
                {ctShowSQL && (
                  <pre className="ct-sql-preview">
                    {ctTableName.trim()
                      ? generateCreateTableSQL(
                          ctTableName.trim(),
                          ctColumns.map((c) => ({
                            ...c,
                            name: c.name.trim() || '_',
                          }))
                        )
                      : '-- Enter a table name above'}
                  </pre>
                )}
              </div>
            </div>

            {/* Dialog footer */}
            <div className="ct-footer">
              <button
                className="ct-btn ct-btn--cancel"
                onClick={closeCreateTableModal}
              >
                Cancel
              </button>
              <button
                className="ct-btn ct-btn--create"
                onClick={handleCreateTable}
                disabled={ctSubmitting}
              >
                {ctSubmitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Sandbox Confirmation Dialog ──────────────────────────────── */}
      {showResetConfirm && (
        <div
          className="ct-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetPending)
              setShowResetConfirm(false);
          }}
        >
          <div className="ct-dialog schema-reset-dialog" role="alertdialog" aria-modal="true">
            <div className="ct-header">
              <h2 className="ct-title">Reset sandbox?</h2>
              <button
                className="ct-close-btn"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetPending}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="ct-body">
              <p className="schema-reset-warning">
                This will <strong>delete every table</strong> in your sandbox and
                restore the sample data (<code>departments</code>,{' '}
                <code>employees</code>, <code>orders</code>).
                This cannot be undone.
              </p>
            </div>
            <div className="ct-footer">
              <button
                className="ct-btn ct-btn--cancel"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetPending}
              >
                Cancel
              </button>
              <button
                className="ct-btn schema-reset-confirm-btn"
                onClick={handleResetSandbox}
                disabled={resetPending}
              >
                {resetPending ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

// ── Skeleton ──────────────────────────────────────────────────────────────────

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
