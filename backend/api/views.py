from django.middleware.csrf import get_token

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserFolderState
from .sandbox import execute_query, get_schema, get_sandbox_path, ensure_sandbox, reset_sandbox
from .serializers import QueryRequestSerializer


class ExecuteQueryView(APIView):
    """
    POST /api/execute/

    Body:   { "query": "SELECT ..." }
    Success: { "columns": [...], "rows": [[...], ...], "row_count": N, "execution_time_ms": N }
    Error:   { "error": "..." }

    The sandbox file used depends on the caller:
      anonymous  → sandboxes/anonymous.sqlite  (shared)
      signed in  → sandboxes/user_<id>.sqlite  (private)
    """

    def post(self, request):
        serializer = QueryRequestSerializer(data=request.data)
        if not serializer.is_valid():
            first_error = next(iter(serializer.errors.values()))[0]
            return Response({'error': str(first_error)}, status=status.HTTP_400_BAD_REQUEST)

        path = get_sandbox_path(request.user)
        ensure_sandbox(path)

        result = execute_query(serializer.validated_data['query'], path)

        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class SchemaView(APIView):
    """
    GET /api/schema/

    Returns the structure of the sandbox database as JSON.
    The sandbox file used matches the one from ExecuteQueryView — both
    resolve through get_sandbox_path(request.user) to guarantee agreement.

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
        path = get_sandbox_path(request.user)
        ensure_sandbox(path)

        result = get_schema(path)
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


class FolderStateView(APIView):
    """
    GET /api/folders/
        Returns { folders, assignments, currentFolderId } for the signed-in user.
        If the user has no saved state yet, returns the empty defaults WITHOUT
        creating a row — only PUT creates one.  This lets the frontend detect
        "fresh account" trivially (empty folders list).

    PUT /api/folders/
        Overwrites the user's folder state.  Server-side sanitisation:
        - folders: list of { id, name }; drops duplicates and names == "main".
        - assignments: dict { tableName: folderId }; silently drops orphaned
          values (folderId not in folders).
        - currentFolderId: must be a valid folder id; coerced to null otherwise.

    Requires authentication — 401 for anonymous callers.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            state = request.user.folder_state
            return Response({
                'folders': state.folders,
                'assignments': state.assignments,
                'currentFolderId': state.current_folder_id,
            })
        except UserFolderState.DoesNotExist:
            return Response({
                'folders': [],
                'assignments': {},
                'currentFolderId': None,
            })

    def put(self, request):
        raw_folders = request.data.get('folders', [])
        raw_assignments = request.data.get('assignments', {})
        raw_current = request.data.get('currentFolderId', None)

        # ── Sanitise folders ───────────────────────────────────────────────────
        # Keep: list of { id, name }, no duplicate ids, name ≠ "main".
        folders = []
        valid_ids = set()
        for item in (raw_folders if isinstance(raw_folders, list) else []):
            if not isinstance(item, dict):
                continue
            fid = str(item.get('id', '')).strip()
            name = str(item.get('name', '')).strip()
            if not fid or not name:
                continue
            if fid in valid_ids:
                continue
            if name.lower() == 'main':
                continue
            valid_ids.add(fid)
            folders.append({'id': fid, 'name': name})

        # ── Sanitise assignments ───────────────────────────────────────────────
        # Keep only assignments whose folderId exists in the validated folders.
        assignments = {}
        if isinstance(raw_assignments, dict):
            for table, fid in raw_assignments.items():
                if isinstance(fid, str) and fid in valid_ids:
                    assignments[str(table)] = fid

        # ── Sanitise currentFolderId ───────────────────────────────────────────
        current_folder_id = None
        if isinstance(raw_current, str) and raw_current in valid_ids:
            current_folder_id = raw_current

        # ── Upsert ────────────────────────────────────────────────────────────
        state, _ = UserFolderState.objects.update_or_create(
            user=request.user,
            defaults={
                'folders': folders,
                'assignments': assignments,
                'current_folder_id': current_folder_id,
            },
        )

        return Response({
            'folders': state.folders,
            'assignments': state.assignments,
            'currentFolderId': state.current_folder_id,
        })


class ResetSandboxView(APIView):
    """
    POST /api/sandbox/reset/

    Wipes the current user's sandbox and re-seeds it with the sample data.
    Available to anonymous and signed-in users alike.

    anonymous  → resets sandboxes/anonymous.sqlite
    signed in  → resets sandboxes/user_<id>.sqlite

    Returns: { "reset": true }
    """

    permission_classes = [AllowAny]

    def post(self, request):
        path = get_sandbox_path(request.user)
        reset_sandbox(path)
        return Response({'reset': True}, status=status.HTTP_200_OK)
