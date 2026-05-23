"""
sandbox.py — SQL execution against the isolated sandbox SQLite database.

Supported statements:
  - SELECT, WITH … SELECT (read queries) — return columns + rows.
  - DDL: CREATE TABLE/VIEW/INDEX, DROP TABLE/VIEW/INDEX, ALTER TABLE.
  - DML: INSERT, UPDATE, DELETE, REPLACE — return affected row count.
  All errors are caught and returned as structured dicts — no 500 crashes.

get_schema() is a separate helper used by the /api/schema/ endpoint; it
opens its own read-only connection so it never races with execute_query().
"""

import os
import sqlite3
import time

from django.conf import settings


def _get_db_path() -> str:
    return getattr(settings, 'SANDBOX_DB_PATH', 'sandbox.db')


# ---------------------------------------------------------------------------
# execute_query
# ---------------------------------------------------------------------------

def execute_query(sql: str) -> dict:
    """
    Execute *sql* against the sandbox database and return a result dict.

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

    db_path = _get_db_path()

    if not os.path.exists(db_path):
        return {
            'error': (
                'Sandbox database has not been initialised. '
                'Run: python manage.py seed_sandbox'
            )
        }

    try:
        conn = sqlite3.connect(db_path, timeout=10)

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


# ---------------------------------------------------------------------------
# get_schema
# ---------------------------------------------------------------------------

def get_schema() -> dict:
    """
    Return the structure of the sandbox database as a JSON-serialisable dict.

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

    Uses a dedicated read-only connection so schema reads never block or
    conflict with the read-write execute_query() connection.
    """
    db_path = _get_db_path()

    if not os.path.exists(db_path):
        return {'schemas': []}

    try:
        uri = f'file:{db_path}?mode=ro'
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
                    f'WHERE type IN (\'table\',\'view\') '
                    f'AND name NOT LIKE \'sqlite_%\' '
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
