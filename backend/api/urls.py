from django.urls import path

from .views import ExecuteQueryView

urlpatterns = [
    path('execute/', ExecuteQueryView.as_view(), name='execute-query'),
]
