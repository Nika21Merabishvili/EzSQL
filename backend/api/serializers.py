from rest_framework import serializers


class QueryRequestSerializer(serializers.Serializer):
    query = serializers.CharField(
        allow_blank=False,
        trim_whitespace=False,
        help_text='A SQL SELECT statement to execute against the sandbox database.',
    )
