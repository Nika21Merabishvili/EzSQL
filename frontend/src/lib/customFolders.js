/**
 * customFolders.js — localStorage helpers for user-defined sidebar folders.
 *
 * Storage key:  "ezsql:customFolders"
 * Shape:
 *   {
 *     folders:         [{ id: "f_<ts>", name: string }, ...],  // insertion order
 *     assignments:     { [tableName]: folderId },               // only assigned tables
 *     currentFolderId: string | null                            // last-clicked folder, or null = main
 *   }
 *
 * Tables absent from `assignments` render under the real "main" schema.
 * Custom folders are never auto-deleted; they persist until the user removes them.
 * When currentFolderId is set, new tables detected on schema refresh go there
 * automatically.
 *
 * Migration: if the old `activeFolderId` key is present (from a previous session)
 * it is copied to `currentFolderId` and removed so existing users don't lose state.
 */

const KEY = 'ezsql:customFolders';
const EMPTY = () => ({ folders: [], assignments: {}, currentFolderId: null });

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
    // One-time migration: activeFolderId → currentFolderId
    if ('activeFolderId' in parsed && !('currentFolderId' in parsed)) {
      parsed.currentFolderId = parsed.activeFolderId;
      delete parsed.activeFolderId;
      localStorage.setItem(KEY, JSON.stringify(parsed));
    }
    if (!('currentFolderId' in parsed)) parsed.currentFolderId = null;
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
 * "main"), and clear the current folder if this folder was the active one.
 */
export function deleteFolder(id) {
  const data = load();
  data.folders = data.folders.filter((f) => f.id !== id);
  for (const [table, fid] of Object.entries(data.assignments)) {
    if (fid === id) delete data.assignments[table];
  }
  if (data.currentFolderId === id) data.currentFolderId = null;
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

// ── Current folder ────────────────────────────────────────────────────────────

/** Set the current folder (new tables auto-assign here). Pass null for main. */
export function setCurrentFolder(id) {
  const data = load();
  data.currentFolderId = id ?? null;
  save(data);
}

/** Return the currently active folder id, or null if main is current. */
export function getCurrentFolder() {
  return load().currentFolderId ?? null;
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
