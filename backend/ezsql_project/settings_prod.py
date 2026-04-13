import os
from .settings import *  # noqa: F401, F403

DEBUG = False

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '').split(',') if h.strip()]

# Production database via DATABASE_URL environment variable (PostgreSQL expected).
DATABASES = {
    'default': dj_database_url.config(  # noqa: F405
        default='postgres://user:password@localhost:5432/ezsql',
        conn_max_age=600,
        ssl_require=True,
    )
}

CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()
]

# Security hardening
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
