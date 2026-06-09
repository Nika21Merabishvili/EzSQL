from pathlib import Path
import os
import dj_database_url
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file (if it exists).
load_dotenv(BASE_DIR.parent / '.env')

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-dev-key-change-in-production-please')

DEBUG = True

ALLOWED_HOSTS = ['*']

# ── Installed apps ─────────────────────────────────────────────────────────────
# django.contrib.sessions / messages / sites are required by allauth.
# django.contrib.admin is included because allauth.account.admin imports from it.

INSTALLED_APPS = [
    # Django core
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.sites',
    'django.contrib.staticfiles',
    # Third-party
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'rest_framework',
    'corsheaders',
    # Local
    'api',
]

SITE_ID = 1

# ── Middleware ─────────────────────────────────────────────────────────────────
# Order matters:
#   CorsMiddleware must be before CommonMiddleware.
#   SessionMiddleware must be before AuthenticationMiddleware.
#   AccountMiddleware (allauth) must be last.

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'allauth.account.middleware.AccountMiddleware',
]

ROOT_URLCONF = 'ezsql_project.urls'

# ── Templates ─────────────────────────────────────────────────────────────────
# APP_DIRS=True so allauth can find its own templates.
# 'request' context processor is required by allauth.

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ezsql_project.wsgi.application'

# ── Databases ──────────────────────────────────────────────────────────────────
# The default DB (db.sqlite3) stores Django internals: users, sessions, sites,
# social accounts, etc.  The sandbox DB (sandbox.db) is a separate file used
# only for query execution — see SANDBOX_DB_PATH below.

DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}'
    )
}

# ── Authentication ─────────────────────────────────────────────────────────────

AUTHENTICATION_BACKENDS = [
    # Default backend — needed for Django admin and superuser login.
    'django.contrib.auth.backends.ModelBackend',
    # allauth backend — handles social (Google) login.
    'allauth.account.auth_backends.AuthenticationBackend',
]

# ── allauth ────────────────────────────────────────────────────────────────────

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': os.environ.get('GOOGLE_CLIENT_ID', ''),
            'secret': os.environ.get('GOOGLE_CLIENT_SECRET', ''),
            'key': '',
        },
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
    }
}

# After a successful sign-in or sign-out, redirect to the React app root.
LOGIN_REDIRECT_URL = '/'
ACCOUNT_LOGOUT_REDIRECT_URL = '/'

# Skip the "Continue" confirmation page before Google OAuth redirect.
SOCIALACCOUNT_LOGIN_ON_GET = True
# Immediately log out on GET /accounts/logout/ — no confirmation page.
ACCOUNT_LOGOUT_ON_GET = True

# Email: Google already verifies the user's email — skip allauth's own verification.
ACCOUNT_EMAIL_VERIFICATION = 'none'
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
SOCIALACCOUNT_AUTO_SIGNUP = True

# ── Django REST Framework ──────────────────────────────────────────────────────
# SessionAuthentication: the browser sends the Django session cookie, and DRF
# enforces CSRF on state-changing requests for logged-in users.
# AllowAny: endpoints stay open in phase 1 — no per-user data yet.

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
    ],
}

# ── CORS ───────────────────────────────────────────────────────────────────────
# During development the Vite proxy makes the browser see a single origin
# (localhost:5173), so no CORS issues arise.  The headers below are still
# needed for direct calls (e.g. if VITE_API_BASE is set) and for production.

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_CREDENTIALS = True   # Required when the frontend sends cookies.

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

# ── CSRF ───────────────────────────────────────────────────────────────────────
# The Vite dev proxy forwards /api and /accounts from localhost:5173 to
# localhost:8000.  Django sees the request coming from the proxy (localhost),
# but the browser's cookies are scoped to localhost:5173.  We need to tell
# Django that requests originating from the Vite origin are trusted.

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
]

# ── Internationalisation ───────────────────────────────────────────────────────

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = False
USE_TZ = True

# ── Static files ───────────────────────────────────────────────────────────────

STATIC_URL = '/static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Sandbox DB ─────────────────────────────────────────────────────────────────
# Path to the sandboxed SQLite database used for query execution.
# Kept separate from the Django application database above.

SANDBOX_DB_PATH = os.environ.get('SANDBOX_DB_PATH', str(BASE_DIR / 'sandbox.db'))
