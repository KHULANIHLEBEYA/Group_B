from django.contrib.auth import get_user_model
from rest_framework import serializers
from .models import Category, Notification, ServiceRequest, TelemetryReading

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role"]

    def get_role(self, obj):
        if obj.is_superuser or obj.is_staff:
            return "ADMIN"
        return "STAFF" if obj.groups.filter(name__iexact="staff").exists() else "STUDENT"


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "active"]


class ServiceRequestSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    assigned_to = UserSerializer(read_only=True)
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=Category.objects.all(), write_only=True)

    class Meta:
        model = ServiceRequest
        fields = ["id", "reference", "title", "description", "category", "category_id", "location", "priority", "status", "source", "created_by", "assigned_to", "created_at", "updated_at"]
        read_only_fields = ["reference", "created_by", "assigned_to", "created_at", "updated_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "message", "is_read", "created_at"]


class TelemetryReadingSerializer(serializers.ModelSerializer):
    timestamp = serializers.DateTimeField(source="recorded_at")
    sensor_type = serializers.CharField()
    value = serializers.FloatField()
    temperature = serializers.SerializerMethodField()
    smoke = serializers.SerializerMethodField()
    moisture = serializers.SerializerMethodField()
    latency_ms = serializers.SerializerMethodField()

    class Meta:
        model = TelemetryReading
        fields = ["timestamp", "sensor_type", "value", "temperature", "smoke", "moisture", "latency_ms", "location", "device_id"]

    def get_temperature(self, obj):
        return obj.secondary_value if obj.sensor_type == "fire" else None

    def get_smoke(self, obj):
        return obj.value if obj.sensor_type == "fire" else None

    def get_moisture(self, obj):
        return obj.value if obj.sensor_type == "water" else None

    def get_latency_ms(self, obj):
        return obj.value if obj.sensor_type == "network" else None
