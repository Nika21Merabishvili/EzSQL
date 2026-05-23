from django.urls import path, include

urlpatterns = [
    path('api/', include('api.urls')),
    # allauth handles /accounts/google/login/, /accounts/google/login/callback/,
    # /accounts/logout/, and all other OAuth + session management URLs.
    path('accounts/', include('allauth.urls')),
]
