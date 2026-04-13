# EzSQL — Browser-Based SQL Interface

A full-stack web application that lets you write, run, and explore SQL queries
directly in the browser. No local database setup required.

- **Frontend**: React + CodeMirror 6 + Vite
- **Backend**: Django + Django REST Framework
- **Query engine**: sandboxed SQLite with read-only enforcement
- **Containerised**: single `docker-compose up` starts everything

---

## Quick Start (Docker)

```bash
git clone https://github.com/Nika21Merabishvili/EzSQL.git
cd EzSQL
docker-compose up
```

Open **http://localhost:5173** in your browser.

The backend seeds the sandbox database automatically on first startup.

---

## Manual Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py seed_sandbox
python manage.py runserver
```

Backend runs at **http://localhost:8000**.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**.

---

## API Reference

### `POST /api/execute/`

Execute a SQL SELECT statement against the sandbox database.

**Request body**

```json
{ "query": "SELECT * FROM employees LIMIT 5" }
```

**Success response** `200 OK`

```json
{
  "columns": ["id", "name", "department_id", "salary", "hire_date"],
  "rows": [
    [1, "Alice Johnson", 1, 95000.0, "2019-03-15"]
  ],
  "row_count": 1,
  "execution_time_ms": 0.42
}
```

**Error response** `400 Bad Request`

```json
{ "error": "Only SELECT statements are allowed in the sandbox." }
```

---

## Sandbox Tables

Three sample tables are pre-loaded and ready to query:

| Table         | Columns                                          | Rows |
|---------------|--------------------------------------------------|------|
| `departments` | id, name, location                               | 5    |
| `employees`   | id, name, department_id, salary, hire_date       | 15   |
| `orders`      | id, employee_id, product, amount, order_date     | 25   |

### Example queries

```sql
-- All employees with their department name
SELECT e.name, d.name AS department, e.salary
FROM employees e
JOIN departments d ON e.department_id = d.id
ORDER BY e.salary DESC;

-- Total spend per department
SELECT d.name, SUM(o.amount) AS total_spent
FROM orders o
JOIN employees e ON o.employee_id = e.id
JOIN departments d ON e.department_id = d.id
GROUP BY d.name
ORDER BY total_spent DESC;
```

---

## Adding New Tables to the Sandbox

1. Open `backend/api/management/commands/seed_sandbox.py`.
2. Add a `CREATE TABLE IF NOT EXISTS` block to the `_DDL` string.
3. Add data tuples to a new list constant (e.g. `_PRODUCTS = [...]`).
4. Call `cursor.executemany(...)` inside the `handle` method.
5. Re-run the seed command:

```bash
# Docker
docker-compose run backend python manage.py seed_sandbox

# Manual
python manage.py seed_sandbox
```

---

## Production Deployment

Set the following environment variables and use `settings_prod.py`:

| Variable              | Description                            |
|-----------------------|----------------------------------------|
| `DJANGO_SETTINGS_MODULE` | `ezsql_project.settings_prod`       |
| `SECRET_KEY`          | Long random string                     |
| `DATABASE_URL`        | PostgreSQL connection URL              |
| `ALLOWED_HOSTS`       | Comma-separated hostnames              |
| `CORS_ALLOWED_ORIGINS`| Comma-separated frontend origins       |
| `SANDBOX_DB_PATH`     | Absolute path to `sandbox.db`          |

Use `gunicorn ezsql_project.wsgi` as the application server.
