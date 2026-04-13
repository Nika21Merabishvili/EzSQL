"""
Management command: seed_sandbox

Creates sandbox.db (if it doesn't exist) and populates it with three sample
tables — employees, departments, and orders — so users can query immediately
on first load.

Usage:
    python manage.py seed_sandbox

The command is idempotent: if the tables already contain data it exits early
without modifying anything.
"""

import sqlite3

from django.conf import settings
from django.core.management.base import BaseCommand


_DDL = """
CREATE TABLE IF NOT EXISTS departments (
    id       INTEGER PRIMARY KEY,
    name     TEXT    NOT NULL,
    location TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    salary        REAL    NOT NULL,
    hire_date     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id),
    product     TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    order_date  TEXT    NOT NULL
);
"""

_DEPARTMENTS = [
    (1, 'Engineering',  'San Francisco'),
    (2, 'Marketing',    'New York'),
    (3, 'Sales',        'Chicago'),
    (4, 'Human Resources', 'Austin'),
    (5, 'Finance',      'Boston'),
]

_EMPLOYEES = [
    (1,  'Alice Johnson',   1, 95000.00, '2019-03-15'),
    (2,  'Bob Smith',       1, 88000.00, '2020-07-01'),
    (3,  'Carol White',     2, 72000.00, '2018-11-20'),
    (4,  'David Lee',       3, 65000.00, '2021-01-10'),
    (5,  'Eva Martinez',    3, 70000.00, '2020-05-22'),
    (6,  'Frank Brown',     4, 60000.00, '2019-09-01'),
    (7,  'Grace Kim',       1, 102000.00,'2017-06-14'),
    (8,  'Henry Davis',     5, 90000.00, '2018-03-28'),
    (9,  'Iris Wilson',     2, 68000.00, '2022-02-14'),
    (10, 'Jack Taylor',     3, 75000.00, '2021-08-30'),
    (11, 'Karen Moore',     5, 85000.00, '2019-12-05'),
    (12, 'Liam Anderson',   1, 97000.00, '2020-03-17'),
    (13, 'Mia Thomas',      2, 63000.00, '2021-06-01'),
    (14, 'Noah Jackson',    4, 58000.00, '2022-09-20'),
    (15, 'Olivia Harris',   3, 71000.00, '2018-07-11'),
]

_ORDERS = [
    (1,  1,  'Laptop',          1299.99, '2023-01-15'),
    (2,  2,  'Monitor',          499.99, '2023-02-01'),
    (3,  3,  'Keyboard',          89.99, '2023-02-10'),
    (4,  4,  'Mouse',             45.00, '2023-03-05'),
    (5,  5,  'Headphones',       199.99, '2023-03-20'),
    (6,  6,  'Webcam',            79.99, '2023-04-02'),
    (7,  7,  'Standing Desk',    749.00, '2023-04-18'),
    (8,  8,  'Ergonomic Chair',  599.00, '2023-05-01'),
    (9,  9,  'USB Hub',           39.99, '2023-05-15'),
    (10, 10, 'Laser Printer',    349.00, '2023-06-01'),
    (11, 1,  'SSD Drive',        129.99, '2023-06-10'),
    (12, 2,  'RAM Module',        89.99, '2023-07-01'),
    (13, 3,  'HDMI Cable',        19.99, '2023-07-15'),
    (14, 4,  'Desk Lamp',         49.99, '2023-08-01'),
    (15, 5,  'Notebook Set',      12.99, '2023-08-20'),
    (16, 6,  'Phone Stand',       24.99, '2023-09-05'),
    (17, 7,  'Cable Organiser',   15.99, '2023-09-18'),
    (18, 8,  'Whiteboard',        89.99, '2023-10-01'),
    (19, 9,  'Sticky Notes Pack',  9.99, '2023-10-15'),
    (20, 10, 'Laptop Bag',        69.99, '2023-11-01'),
    (21, 11, 'Docking Station',  249.99, '2023-11-15'),
    (22, 12, 'Mechanical Keyboard', 159.99, '2023-12-01'),
    (23, 13, 'Monitor Stand',     59.99, '2024-01-10'),
    (24, 14, 'Wireless Mouse',    49.99, '2024-01-22'),
    (25, 15, 'Noise-Cancelling Headphones', 299.99, '2024-02-05'),
]


class Command(BaseCommand):
    help = 'Create and seed the sandbox SQLite database with sample tables and data.'

    def handle(self, *args, **options):
        db_path = getattr(settings, 'SANDBOX_DB_PATH', 'sandbox.db')

        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()

            # Create tables (idempotent).
            cursor.executescript(_DDL)
            conn.commit()

            # Skip seeding if data already present.
            cursor.execute('SELECT COUNT(*) FROM departments')
            if cursor.fetchone()[0] > 0:
                self.stdout.write(self.style.SUCCESS(
                    f'Sandbox already seeded at {db_path}. Nothing to do.'
                ))
                return

            cursor.executemany(
                'INSERT INTO departments VALUES (?, ?, ?)', _DEPARTMENTS
            )
            cursor.executemany(
                'INSERT INTO employees VALUES (?, ?, ?, ?, ?)', _EMPLOYEES
            )
            cursor.executemany(
                'INSERT INTO orders VALUES (?, ?, ?, ?, ?)', _ORDERS
            )
            conn.commit()

        finally:
            conn.close()

        self.stdout.write(self.style.SUCCESS(
            f'Sandbox seeded successfully at {db_path}\n'
            f'  departments : {len(_DEPARTMENTS)} rows\n'
            f'  employees   : {len(_EMPLOYEES)} rows\n'
            f'  orders      : {len(_ORDERS)} rows'
        ))
