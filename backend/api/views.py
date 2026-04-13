from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .sandbox import execute_query
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
