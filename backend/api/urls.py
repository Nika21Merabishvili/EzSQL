from django.urls import path

from .views import ExecuteQueryView, SchemaView

urlpatterns = [
    path('execute/', ExecuteQueryView.as_view(), name='execute-query'),
    path('schema/', SchemaView.as_view(), name='schema'),
]
