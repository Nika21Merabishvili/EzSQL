from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        """Connect signals after the app registry is fully populated."""
        from django.contrib.auth import get_user_model
        from django.db.models.signals import post_delete

        from .sandbox import SANDBOX_DIR

        User = get_user_model()

        def _delete_user_sandbox(sender, instance, **kwargs):
            """Remove the user's private sandbox file when their account is deleted."""
            sandbox_path = SANDBOX_DIR / f'user_{instance.id}.sqlite'
            if sandbox_path.exists():
                try:
                    sandbox_path.unlink()
                except OSError:
                    pass  # file already gone — not an error

        post_delete.connect(_delete_user_sandbox, sender=User, weak=False)
