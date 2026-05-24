-- EzSQL sandbox seed data
-- This file is executed each time a new user sandbox is created.
-- Tables: departments, employees, orders

-- ── departments ───────────────────────────────────────────────────────────────

CREATE TABLE departments (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    location TEXT
);

INSERT INTO departments VALUES (1, 'Engineering', 'New York');
INSERT INTO departments VALUES (2, 'Marketing',   'Los Angeles');
INSERT INTO departments VALUES (3, 'Finance',      'Chicago');

-- ── employees ─────────────────────────────────────────────────────────────────

CREATE TABLE employees (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    department_id INTEGER,
    salary        REAL,
    hire_date     TEXT
);

INSERT INTO employees VALUES (1,  'Alice Johnson', 1, 95000.00, '2020-03-15');
INSERT INTO employees VALUES (2,  'Bob Smith',     2, 72000.00, '2019-07-22');
INSERT INTO employees VALUES (3,  'Carol White',   1, 88000.00, '2021-01-10');
INSERT INTO employees VALUES (4,  'David Lee',     3, 105000.00,'2018-11-05');
INSERT INTO employees VALUES (5,  'Eva Martinez',  2, 68000.00, '2022-04-18');
INSERT INTO employees VALUES (6,  'Frank Brown',   1, 91000.00, '2020-09-01');
INSERT INTO employees VALUES (7,  'Grace Kim',     3, 78000.00, '2021-06-30');
INSERT INTO employees VALUES (8,  'Henry Wilson',  2, 75000.00, '2019-12-14');
INSERT INTO employees VALUES (9,  'Iris Chen',     1, 98000.00, '2017-08-23');
INSERT INTO employees VALUES (10, 'Jack Davis',    3, 112000.00,'2016-02-28');
INSERT INTO employees VALUES (11, 'Karen Moore',   2, 64000.00, '2023-01-09');
INSERT INTO employees VALUES (12, 'Leo Torres',    1, 85000.00, '2022-08-17');

-- ── orders ────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
    id          INTEGER PRIMARY KEY,
    employee_id INTEGER,
    product     TEXT,
    amount      REAL,
    order_date  TEXT
);

INSERT INTO orders VALUES (1, 1,  'Laptop',     1299.99, '2024-01-15');
INSERT INTO orders VALUES (2, 3,  'Monitor',     599.99, '2024-01-22');
INSERT INTO orders VALUES (3, 5,  'Keyboard',    149.99, '2024-02-01');
INSERT INTO orders VALUES (4, 2,  'Mouse',        79.99, '2024-02-10');
INSERT INTO orders VALUES (5, 7,  'Headset',     249.99, '2024-02-15');
INSERT INTO orders VALUES (6, 4,  'Webcam',      129.99, '2024-03-01');
INSERT INTO orders VALUES (7, 6,  'Desk Chair',  449.99, '2024-03-12');
INSERT INTO orders VALUES (8, 9,  'Docking Station', 299.99, '2024-03-20');
