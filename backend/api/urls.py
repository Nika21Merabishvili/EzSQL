from django.urls import path

from .views import ExecuteQueryView, MeView, SchemaView

urlpatterns = [
    path('execute/', ExecuteQueryView.as_view(), name='execute-query'),
    path('schema/', SchemaView.as_view(), name='schema'),
    path('me/', MeView.as_view(), name='me'),
]
