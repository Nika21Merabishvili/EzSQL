import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { getSchema } from '../api/schemaApi';
import * as CF from '../lib/customFolders';

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
 */
const SchemaBrowser = forwardRef(function SchemaBrowser({ onInsertQuery }, ref) {
  // ── API state ─────────────────────────────────────────────────────────────
  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Tree expansion ────────────────────────────────────────────────────────
  // Keys are schema names (e.g. "main") OR folder ids (e.g. "f_1729...")
  const [expandedSchemas, setExpandedSchemas] = useState({});
  // Keys are "<groupKey>.<tableName>"
  const [expandedTables, setExpandedTables] = useState({});

  // ── Custom folder state (mirrors localStorage) ────────────────────────────
  const [folders, setFolders] = useState([]);
  const [assignments, setAssignments] = useState({}); // { tableName: folderId }
  const [activeFolderId, setActiveFolderId] = useState(null); // pinned folder id

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

  // ── First-load guard for auto-assignment ──────────────────────────────────
  // null  → first fetch not yet complete; skip auto-assignment.
  // Set   → table names known after the previous fetch.
  const knownTablesRef = useRef(null);

  // ── Sync helper ───────────────────────────────────────────────────────────

  const syncFolders = (data) => {
    setFolders([...data.folders]);
    setAssignments({ ...data.assignments });
    setActiveFolderId(data.activeFolderId ?? null);
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

      // ── Auto-assign new tables to the pinned folder ───────────────────
      // Only runs on subsequent fetches (prevTableNames !== null).
      if (prevTableNames !== null && cleaned.activeFolderId) {
        const activeFolderExists = cleaned.folders.some(
          (f) => f.id === cleaned.activeFolderId
        );
        if (activeFolderExists) {
          // Tables in the new response that weren't known before and have no assignment.
          for (const name of allNames) {
            if (!prevTableNames.has(name) && !cleaned.assignments[name]) {
              CF.assignTable(name, cleaned.activeFolderId);
            }
          }
        } else {
          // Active folder was deleted outside normal flow — clear the pin.
          CF.setActiveFolder(null);
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

  useEffect(() => {
    // Pre-populate folder state from localStorage so the sidebar
    // renders immediately (before the API responds).
    syncFolders(CF.load());
    fetchSchema();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Pin / unpin folder ────────────────────────────────────────────────────

  const handleTogglePin = (folderId) => {
    const next = activeFolderId === folderId ? null : folderId;
    CF.setActiveFolder(next);
    setActiveFolderId(next);
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
    const currentFolder = assignments[table.name] ?? null;

    return (
      <div key={table.name} className="schema-table-item">
        <div className="schema-table-row-wrap">
          <button
            className="schema-table-row schema-table-row--indented"
            onClick={() => toggleTable(expandKey)}
            title={`${table.type === 'view' ? 'View' : 'Table'} — click to expand`}
          >
            <span className="schema-chevron" aria-hidden="true">
              {tableOpen ? '▾' : '▸'}
            </span>
            <span
              className="schema-table-name"
              title="Click to insert SELECT query"
              onClick={(e) => {
                e.stopPropagation();
                onInsertQuery(`SELECT * FROM ${table.name} LIMIT 100;`);
              }}
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
                      currentFolder === f.id ? ' schema-move-menu-item--active' : ''
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
                    currentFolder === null ? ' schema-move-menu-item--active' : ''
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
        </div>
      </div>

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
            No tables yet — run a <code>CREATE TABLE</code> statement to get
            started.
          </div>
        ) : (
          <>
            {/* ── 1. Custom folders (above main, in creation order) ─────── */}
            {folders.map((folder) => {
              const folderOpen = !!expandedSchemas[folder.id];
              const folderTables = tablesForFolder(folder.id);
              const isRenaming = renamingFolderId === folder.id;
              const isConfirmDelete = confirmDeleteId === folder.id;
              const isPinned = activeFolderId === folder.id;

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
                    <div className={`schema-folder-header-wrap${isPinned ? ' schema-folder-header-wrap--pinned' : ''}`}>
                      <button
                        className="schema-schema-row schema-schema-row--custom"
                        onClick={() => toggleSchema(folder.id)}
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

                      {/* Pin, Rename, Delete — visible on hover (or always when pinned) */}
                      <div className="schema-folder-controls">
                        <button
                          className={`schema-folder-ctrl-btn schema-folder-ctrl-btn--pin${isPinned ? ' schema-folder-ctrl-btn--pin-active' : ''}`}
                          title={isPinned ? 'Stop sending new tables here' : 'Set as target for new tables'}
                          aria-label={isPinned ? `Unpin ${folder.name}` : `Pin ${folder.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin(folder.id);
                          }}
                        >
                          📌
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

              return (
                <div key={schema.name} className="schema-group">
                  <button
                    className="schema-schema-row"
                    onClick={() => toggleSchema(schema.name)}
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
