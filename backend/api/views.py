from django.middleware.csrf import get_token

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .sandbox import execute_query, get_schema
from .serializers import QueryRequestSerializer


class ExecuteQueryView(APIView):
    """
    POST /api/execute/

    Body:   { "query": "SELECT ..." }
    Success: { "columns": [...], "rows": [[...], ...], "row_count": N, "execution_time_ms": N }
    Error:   { "error": "..." }
    """

    def post(self, request):
        serializer = QueryRequestSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = next(iter(serializer.errors.values()))[0]
            return Response({'error': str(first_error)}, status=status.HTTP_400_BAD_REQUEST)

        result = execute_query(serializer.validated_data['query'])

        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class SchemaView(APIView):
    """
    GET /api/schema/

    Returns the structure of the sandbox database as JSON.

    Shape:
        {
          "schemas": [
            {
              "name": "main",
              "tables": [
                {
                  "name": "employees",
                  "type": "table",
                  "columns": [
                    {"name": "id",   "type": "INTEGER", "pk": true,  "nullable": false},
                    {"name": "name", "type": "TEXT",    "pk": false, "nullable": true}
                  ]
                }
              ]
            }
          ]
        }
    """

    def get(self, request):
        result = get_schema()
        return Response(result, status=status.HTTP_200_OK)


class MeView(APIView):
    """
    GET /api/me/

    Returns the current user's authentication state.

    Signed in:
        {
          "authenticated": true,
          "email": "nika@example.com",
          "name": "Nika Merabishvili",
          "avatar_url": "https://...googleusercontent.com/..."
        }

    Anonymous:
        { "authenticated": false }

    Side-effect: ensures the CSRF cookie is set on every response so that the
    React frontend can read it and attach it to subsequent POST requests
    (required by DRF's SessionAuthentication).
    """

    def get(self, request):
        # Force the CSRF cookie to be included in the response.
        # DRF views are @csrf_exempt by default, so CsrfViewMiddleware won't
        # set the cookie automatically — we call get_token() ourselves.
        get_token(request)

        if request.user.is_authenticated:
            avatar_url = None
            try:
                social = request.user.socialaccount_set.filter(
                    provider='google'
                ).first()
                if social:
                    avatar_url = social.extra_data.get('picture')
            except Exception:
                pass

            return Response({
                'authenticated': True,
                'email': request.user.email,
                'name': request.user.get_full_name() or request.user.email,
                'avatar_url': avatar_url,
            })

        return Response({'authenticated': False})
