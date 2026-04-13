"""
sandbox.py — SQL execution against the isolated sandbox SQLite database.

Security model:
  - Only SELECT statements are permitted (first-token check + pattern blocklist).
  - The connection is opened in read-only URI mode so SQLite itself enforces
    the restriction at the file-system level.
  - All errors are caught and returned as structured dicts — no 500 crashes.
"""

import os
import re
import sqlite3
import time

from django.conf import settings

# Patterns that must never appear anywhere in the query.
_FORBIDDEN = re.compile(
    r'\b(insert|update|delete|drop|create|alter|truncate|replace|attach|detach|pragma)\b',
    re.IGNORECASE,
)


def _get_db_path() -> str:
    return getattr(settings, 'SANDBOX_DB_PATH', 'sandbox.db')


def execute_query(sql: str) -> dict:
    """
    Execute *sql* against the sandbox database and return a result dict.

    Success shape:
        {"columns": [...], "rows": [[...], ...], "row_count": N, "execution_time_ms": N}

    Error shape:
        {"error": "Human-readable message"}
    """
    sql = sql.strip()

    if not sql:
        return {'error': 'Query cannot be empty.'}

    # First-token check — must be SELECT.
    first_token = sql.split()[0].lower()
    if first_token != 'select':
        return {
            'error': (
                'Only SELECT statements are allowed in the sandbox. '
                f'Got: {first_token.upper()}'
            )
        }

    # Secondary pattern scan for dangerous keywords anywhere in the query.
    if _FORBIDDEN.search(sql):
        return {
            'error': 'Query contains a forbidden keyword. Only SELECT statements are allowed.'
        }

    db_path = _get_db_path()

    if not os.path.exists(db_path):
        return {
            'error': (
                'Sandbox database has not been initialised. '
                'Run: python manage.py seed_sandbox'
            )
        }

    try:
        # Open in read-only mode — SQLite enforces this at the OS level.
        uri = f'file:{db_path}?mode=ro'
        conn = sqlite3.connect(uri, uri=True, timeout=10)

        try:
            cursor = conn.cursor()
            start = time.perf_counter()
            cursor.execute(sql)
            rows = cursor.fetchall()
            elapsed_ms = round((time.perf_counter() - start) * 1000, 2)

            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            row_data = [list(row) for row in rows]

            return {
                'columns': columns,
                'rows': row_data,
                'row_count': len(row_data),
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
