#!/bin/bash
set -e

echo "==> Seeding sandbox database..."
python manage.py seed_sandbox

echo "==> Starting Django development server..."
exec python manage.py runserver 0.0.0.0:8000
