"""
sandbox.py — Per-user sandbox SQLite databases.

Sandbox routing
───────────────
  get_sandbox_path(user) → Path
      anonymous  → sandboxes/anonymous.sqlite
      signed in  → sandboxes/user_<id>.sqlite

  ensure_sandbox(path)
      Creates and seeds the file if it doesn't exist yet.
      Enables WAL mode so concurrent reads/writes don't block each other.
      Idempotent — safe to call on every request.

  reset_sandbox(path)
      Deletes the file and re-seeds it.

SQL execution
─────────────
  execute_query(sql, path) → dict
  get_schema(path) → dict

  Both functions accept an explicit Path so the caller (the view) controls
  routing.  The view must call get_sandbox_path + ensure_sandbox first.
"""

import sqlite3
import time
from pathlib import Path

from django.conf import settings


# ── Paths ──────────────────────────────────────────────────────────────────────

SANDBOX_DIR = Path(settings.BASE_DIR) / 'sandboxes'
SEED_PATH   = SANDBOX_DIR / 'seed.sql'


# ── Routing ────────────────────────────────────────────────────────────────────

def get_sandbox_path(user) -> Path:
    """Return the sandbox file path for *user*.

    anonymous → sandboxes/anonymous.sqlite
    signed in → sandboxes/user_<id>.sqlite
    """
    SANDBOX_DIR.mkdir(exist_ok=True)
    if user and user.is_authenticated:
        return SANDBOX_DIR / f'user_{user.id}.sqlite'
    return SANDBOX_DIR / 'anonymous.sqlite'


def ensure_sandbox(path: Path) -> None:
    """Create and seed *path* if it doesn't exist.  Idempotent.

    Also enables WAL mode so concurrent reads (schema endpoint) and writes
    (execute endpoint) don't block each other.  WAL is a persistent property
    of the SQLite file, so it only needs to be set once.
    """
    if path.exists():
        return
    seed_sql = SEED_PATH.read_text(encoding='utf-8')
    conn = sqlite3.connect(str(path))
    try:
        conn.executescript(seed_sql)
        conn.execute('PRAGMA journal_mode=WAL;')
        conn.commit()
    finally:
        conn.close()


def reset_sandbox(path: Path) -> None:
    """Delete and re-seed *path*.  Creates the file fresh with sample data."""
    if path.exists():
        path.unlink()
    ensure_sandbox(path)


# ── Query execution ────────────────────────────────────────────────────────────

def execute_query(sql: str, path: Path) -> dict:
    """Execute *sql* against the sandbox at *path*.

    Caller must have already called ensure_sandbox(path).

    SELECT shape:
        {"columns": [...], "rows": [[...], ...], "row_count": N, "execution_time_ms": N}

    DDL / DML shape (cursor.description is None):
        {"columns": [], "rows": [], "row_count": N, "execution_time_ms": N}
        (row_count == cursor.rowcount for DML; 0 for DDL)

    Error shape:
        {"error": "Human-readable message"}
    """
    sql = sql.strip()
    if not sql:
        return {'error': 'Query cannot be empty.'}

    try:
        conn = sqlite3.connect(str(path), timeout=10)
        try:
            cursor = conn.cursor()
            start = time.perf_counter()
            cursor.execute(sql)
            elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

            if cursor.description:
                # SELECT / WITH … SELECT — return tabular data.
                rows = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]
                row_data = [list(row) for row in rows]
                conn.commit()
                return {
                    'columns': columns,
                    'rows': row_data,
                    'row_count': len(row_data),
                    'execution_time_ms': elapsed_ms,
                }
            else:
                # DDL / DML — commit and report rowcount.
                conn.commit()
                affected = cursor.rowcount if cursor.rowcount >= 0 else 0
                return {
                    'columns': [],
                    'rows': [],
                    'row_count': affected,
                    'execution_time_ms': elapsed_ms,
                }
        finally:
            conn.close()

    except sqlite3.OperationalError as exc:
        return {'error': f'SQL error: {exc}'}
    except sqlite3.DatabaseError as exc:
        return {'error': f'Database error: {exc}'}
    except Exception as exc:
        return {'error': f'Unexpected error: {exc}'}


# ── Schema inspection ──────────────────────────────────────────────────────────

def get_schema(path: Path) -> dict:
    """Return the structure of the sandbox at *path*.

    Uses a dedicated read-only connection so schema reads never block or
    conflict with the read-write execute_query() connection.

    Shape:
        {
          "schemas": [
            {
              "name": "main",
              "tables": [
                {
                  "name": "employees",
                  "type": "table",
                  "columns": [
                    {"name": "id",   "type": "INTEGER", "pk": true,  "nullable": false},
                    {"name": "name", "type": "TEXT",    "pk": false, "nullable": true}
                  ]
                }
              ]
            }
          ]
        }
    """
    try:
        uri = f'file:{path}?mode=ro'
        conn = sqlite3.connect(uri, uri=True, timeout=10)
        try:
            cursor = conn.cursor()

            # List attached databases — normally just "main".
            cursor.execute('PRAGMA database_list;')
            databases = cursor.fetchall()  # (seq, name, file_path)

            schemas = []
            for _seq, db_name, _db_file in databases:
                # Tables and views (skip internal sqlite_ objects).
                cursor.execute(
                    f'SELECT name, type FROM "{db_name}".sqlite_master '
                    f"WHERE type IN ('table','view') "
                    f"AND name NOT LIKE 'sqlite_%' "
                    f'ORDER BY name;'
                )
                tables_raw = cursor.fetchall()

                tables = []
                for tname, ttype in tables_raw:
                    # PRAGMA table_info columns:
                    #   cid | name | type | notnull | dflt_value | pk
                    cursor.execute(f'PRAGMA "{db_name}".table_info("{tname}");')
                    cols_raw = cursor.fetchall()
                    columns = [
                        {
                            'name': col[1],
                            'type': col[2] or '',
                            'pk': bool(col[5]),
                            'nullable': not bool(col[3]),
                        }
                        for col in cols_raw
                    ]
                    tables.append({'name': tname, 'type': ttype, 'columns': columns})

                schemas.append({'name': db_name, 'tables': tables})

            return {'schemas': schemas}

        finally:
            conn.close()

    except Exception as exc:
        return {'schemas': [], 'error': str(exc)}
