/**
 * customFolders.js — localStorage helpers for user-defined sidebar folders.
 *
 * Storage key:  "ezsql:customFolders"
 * Shape:
 *   {
 *     folders:        [{ id: "f_<ts>", name: string }, ...],  // insertion order
 *     assignments:    { [tableName]: folderId },               // only assigned tables
 *     activeFolderId: string | null                            // pinned folder id, or null
 *   }
 *
 * Tables absent from `assignments` render under the real "main" schema.
 * Custom folders are never auto-deleted; they persist until the user removes them.
 * While a folder is pinned (activeFolderId), new tables go there automatically.
 */

const KEY = 'ezsql:customFolders';
const EMPTY = () => ({ folders: [], assignments: {}, activeFolderId: null });

// ── Read / write ─────────────────────────────────────────────────────────────

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw);
    // Defensive: ensure required keys exist
    if (!Array.isArray(parsed.folders)) parsed.folders = [];
    if (typeof parsed.assignments !== 'object' || parsed.assignments === null)
      parsed.assignments = {};
    if (!('activeFolderId' in parsed)) parsed.activeFolderId = null;
    return parsed;
  } catch {
    return EMPTY();
  }
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

/** Create a new folder and return its generated id. */
export function createFolder(name) {
  const data = load();
  const id = `f_${Date.now()}`;
  data.folders.push({ id, name });
  save(data);
  return id;
}

/** Rename an existing folder in place. No-op if id not found. */
export function renameFolder(id, name) {
  const data = load();
  const folder = data.folders.find((f) => f.id === id);
  if (folder) {
    folder.name = name;
    save(data);
  }
}

/**
 * Delete a folder, remove all its table assignments (tables fall back to
 * "main"), and clear the pin if this folder was the active one.
 */
export function deleteFolder(id) {
  const data = load();
  data.folders = data.folders.filter((f) => f.id !== id);
  for (const [table, fid] of Object.entries(data.assignments)) {
    if (fid === id) delete data.assignments[table];
  }
  if (data.activeFolderId === id) data.activeFolderId = null;
  save(data);
}

// ── Assignment helpers ────────────────────────────────────────────────────────

/** Assign a table to a folder. Overwrites any previous assignment. */
export function assignTable(tableName, folderId) {
  const data = load();
  data.assignments[tableName] = folderId;
  save(data);
}

/** Remove a table's assignment so it renders under "main". */
export function unassignTable(tableName) {
  const data = load();
  delete data.assignments[tableName];
  save(data);
}

// ── Active (pinned) folder ────────────────────────────────────────────────────

/** Pin a folder as the auto-assignment target. Pass null to unpin. */
export function setActiveFolder(id) {
  const data = load();
  data.activeFolderId = id ?? null;
  save(data);
}

/** Return the currently pinned folder id, or null if none. */
export function getActiveFolder() {
  return load().activeFolderId ?? null;
}

// ── Garbage collection ────────────────────────────────────────────────────────

/**
 * Remove assignments whose table no longer exists in the live schema.
 * Called after every /api/schema/ response.
 *
 * @param {Set<string>} existingTableNames — set of table names from the API
 * @returns {object} the cleaned data object (already saved to localStorage)
 */
export function garbageCollect(existingTableNames) {
  const data = load();
  let changed = false;
  for (const table of Object.keys(data.assignments)) {
    if (!existingTableNames.has(table)) {
      delete data.assignments[table];
      changed = true;
    }
  }
  if (changed) save(data);
  return data;
}
