/**
 * customFolders.js — folder state abstraction layer.
 *
 * ┌─ Anonymous users ──────────────────────────────────────────────────────┐
 * │  Reads/writes localStorage (key "ezsql:customFolders").                │
 * │  Behaviour is identical to phase 1.                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 * ┌─ Signed-in users ──────────────────────────────────────────────────────┐
 * │  Reads/writes the backend (GET/PUT /api/folders/).                     │
 * │  First sign-in on a device with existing localStorage data: migrates   │
 * │  that data to the account if the account has no folders yet.           │
 * │  LocalStorage is always cleared once the user is signed in.            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * In-memory cache (_state)
 * ─────────────────────────
 * All read operations (load, getCurrentFolder) are synchronous and return
 * the in-memory cache — callers never block.
 *
 * All write operations (createFolder, renameFolder, …) update the cache
 * immediately and fire a background save (localStorage or network).  Saves
 * are optimistic: the UI reflects the change before the save completes.
 *
 * On network failure the module calls the registered onError handler with a
 * message, retries once, and leaves the message visible on second failure.
 * Pass onError(null) to clear the error.
 *
 * init(isAuthenticated)
 * ──────────────────────
 * Must be awaited exactly once before any other call — typically in a
 * useEffect that watches auth.loading + auth.authenticated.  Re-call it
 * whenever auth state changes (sign-in / sign-out).
 */

import client from '../api/client';

// ── Storage key ───────────────────────────────────────────────────────────────

const LS_KEY = 'ezsql:customFolders';

// ── Module state ──────────────────────────────────────────────────────────────

const EMPTY = () => ({ folders: [], assignments: {}, currentFolderId: null });

let _state = null;          // in-memory cache; null = not yet initialised
let _authenticated = false; // true when the user is signed in
let _onError = null;        // (message: string | null) => void

// ── Error handler ─────────────────────────────────────────────────────────────

/** Register a callback for background-save errors. null message = clear. */
export function setErrorHandler(fn) {
  _onError = fn;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function readLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.folders)) parsed.folders = [];
    if (typeof parsed.assignments !== 'object' || parsed.assignments === null)
      parsed.assignments = {};
    // One-time migration from phase 1: activeFolderId → currentFolderId
    if ('activeFolderId' in parsed && !('currentFolderId' in parsed)) {
      parsed.currentFolderId = parsed.activeFolderId;
      delete parsed.activeFolderId;
      localStorage.setItem(LS_KEY, JSON.stringify(parsed));
    }
    if (!('currentFolderId' in parsed)) parsed.currentFolderId = null;
    return parsed;
  } catch {
    return EMPTY();
  }
}

function writeLocalStorage(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

/** Wipe the localStorage entry (called when the user signs in). */
export function clearLocalStorage() {
  localStorage.removeItem(LS_KEY);
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchFromAPI() {
  const res = await client.get('/api/folders/');
  const d = res.data;
  return {
    folders: Array.isArray(d.folders) ? d.folders : [],
    assignments:
      d.assignments && typeof d.assignments === 'object' ? d.assignments : {},
    currentFolderId: d.currentFolderId ?? null,
  };
}

async function pushToAPI(state) {
  await client.put('/api/folders/', {
    folders: state.folders,
    assignments: state.assignments,
    currentFolderId: state.currentFolderId,
  });
}

// ── Background persist with one retry ────────────────────────────────────────

async function persistAsync(state) {
  if (_authenticated) {
    try {
      await pushToAPI(state);
      _onError?.(null); // clear any previous error on success
    } catch {
      _onError?.("Couldn't save folders, retrying…");
      try {
        await pushToAPI(state);
        _onError?.(null); // clear on successful retry
      } catch {
        // Second failure — the error message stays visible.
      }
    }
  } else {
    writeLocalStorage(state);
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise (or re-initialise) the module.
 *
 * Call this:
 *   • On mount, once auth.loading becomes false.
 *   • Whenever auth.authenticated changes (sign-in / sign-out).
 *
 * Sign-in flow:
 *   1. Fetch the user's folder state from the backend.
 *   2. If the backend has NO data yet and localStorage HAS data →
 *      migrate localStorage → backend (one-time, silent).
 *   3. Clear localStorage (always, for signed-in users).
 *
 * Sign-out flow:
 *   • localStorage was already cleared on sign-in, so the anonymous
 *     view starts empty — no folders, clean slate.
 *
 * @param {boolean} isAuthenticated
 * @returns {Promise<object>} the initial folder state
 */
export async function init(isAuthenticated) {
  _authenticated = isAuthenticated;

  if (!isAuthenticated) {
    _state = readLocalStorage();
    return _state;
  }

  // ── Signed in: fetch from backend ─────────────────────────────────────────
  let backendState;
  try {
    backendState = await fetchFromAPI();
  } catch {
    // Backend unreachable — start with empty (don't use potentially stale LS data)
    backendState = EMPTY();
  }

  const backendEmpty =
    backendState.folders.length === 0 &&
    Object.keys(backendState.assignments).length === 0 &&
    backendState.currentFolderId === null;

  if (backendEmpty) {
    // Check localStorage for a one-time migration
    const localState = readLocalStorage();
    const localHasData =
      localState.folders.length > 0 ||
      Object.keys(localState.assignments).length > 0;

    if (localHasData) {
      try {
        await pushToAPI(localState);
        backendState = localState; // backend now has the migrated data
      } catch {
        // Migration failed silently; backend stays empty
      }
    }
  }

  // Always clear localStorage for signed-in users
  clearLocalStorage();

  _state = backendState;
  return _state;
}

// ── Synchronous read ──────────────────────────────────────────────────────────

/**
 * Return the current folder state from the in-memory cache.
 * Synchronous — never hits the network.
 */
export function load() {
  return _state ?? EMPTY();
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

/** Create a new folder and return its generated id. */
export function createFolder(name) {
  const id = `f_${Date.now()}`;
  const state = load();
  _state = { ...state, folders: [...state.folders, { id, name }] };
  persistAsync(_state);
  return id;
}

/** Rename an existing folder in place. No-op if id not found. */
export function renameFolder(id, name) {
  const state = load();
  _state = {
    ...state,
    folders: state.folders.map((f) => (f.id === id ? { ...f, name } : f)),
  };
  persistAsync(_state);
}

/**
 * Delete a folder, unassign all its tables, and clear currentFolderId
 * if this folder was the active one.
 */
export function deleteFolder(id) {
  const state = load();
  const newAssignments = { ...state.assignments };
  for (const [table, fid] of Object.entries(newAssignments)) {
    if (fid === id) delete newAssignments[table];
  }
  _state = {
    folders: state.folders.filter((f) => f.id !== id),
    assignments: newAssignments,
    currentFolderId: state.currentFolderId === id ? null : state.currentFolderId,
  };
  persistAsync(_state);
}

// ── Assignment helpers ────────────────────────────────────────────────────────

/** Assign a table to a folder. Overwrites any previous assignment. */
export function assignTable(tableName, folderId) {
  const state = load();
  _state = {
    ...state,
    assignments: { ...state.assignments, [tableName]: folderId },
  };
  persistAsync(_state);
}

/** Remove a table's assignment so it renders under "main". */
export function unassignTable(tableName) {
  const state = load();
  const newAssignments = { ...state.assignments };
  delete newAssignments[tableName];
  _state = { ...state, assignments: newAssignments };
  persistAsync(_state);
}

// ── Current folder ────────────────────────────────────────────────────────────

/** Set the current folder (new tables auto-assign here). Pass null for main. */
export function setCurrentFolder(id) {
  _state = { ...load(), currentFolderId: id ?? null };
  persistAsync(_state);
}

/** Return the currently active folder id, or null if main is current. */
export function getCurrentFolder() {
  return load().currentFolderId ?? null;
}

// ── Garbage collection ────────────────────────────────────────────────────────

/**
 * Remove assignments whose table no longer exists in the live schema.
 * Updates the cache synchronously; fires a background save if anything changed.
 *
 * @param {Set<string>} existingTableNames
 * @returns {object} the cleaned state (from cache)
 */
export function garbageCollect(existingTableNames) {
  const state = load();
  const newAssignments = { ...state.assignments };
  let changed = false;
  for (const table of Object.keys(newAssignments)) {
    if (!existingTableNames.has(table)) {
      delete newAssignments[table];
      changed = true;
    }
  }
  if (!changed) return state;
  _state = { ...state, assignments: newAssignments };
  persistAsync(_state);
  return _state;
}
