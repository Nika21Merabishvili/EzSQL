from django.urls import path

from .views import ExecuteQueryView, FolderStateView, MeView, ResetSandboxView, SchemaView

urlpatterns = [
    path('execute/', ExecuteQueryView.as_view(), name='execute-query'),
    path('schema/', SchemaView.as_view(), name='schema'),
    path('me/', MeView.as_view(), name='me'),
    path('folders/', FolderStateView.as_view(), name='folder-state'),
    path('sandbox/reset/', ResetSandboxView.as_view(), name='sandbox-reset'),
]
