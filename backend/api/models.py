from django.conf import settings
from django.db import models


class UserFolderState(models.Model):
    """
    Per-user folder organisation state.

    Mirrors the shape stored in localStorage for anonymous users so the
    frontend can swap backends without changing any of the data structures.

    Fields
    ------
    folders          JSON list of { "id": "f_...", "name": "Sales" }
    assignments      JSON dict   { "employees": "f_...", "orders": "f_..." }
    current_folder_id  Active folder id, or NULL when "main" is selected
    updated_at       Auto-updated on every PUT
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='folder_state',
    )
    folders = models.JSONField(default=list)
    assignments = models.JSONField(default=dict)
    current_folder_id = models.CharField(max_length=64, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'user folder state'

    def __str__(self):
        return f'FolderState({self.user_id})'
