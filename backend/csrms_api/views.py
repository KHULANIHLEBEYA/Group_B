from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Category, Notification, ServiceRequest, TelemetryReading
from .serializers import CategorySerializer, NotificationSerializer, ServiceRequestSerializer, TelemetryReadingSerializer, UserSerializer

User = get_user_model()


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        username = request.data.get("username")
        password = request.data.get("password")
        if not username or not password:
            return Response({"detail": "username and password are required"}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({"detail": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=username, password=password, email=request.data.get("email", ""), first_name=request.data.get("first_name", ""), last_name=request.data.get("last_name", ""))
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class DashboardView(APIView):
    def get(self, request):
        qs = ServiceRequest.objects.all()
        return Response({
            "pending": qs.filter(status=ServiceRequest.Status.PENDING).count(),
            "assigned": qs.filter(status=ServiceRequest.Status.ASSIGNED).count(),
            "in_progress": qs.filter(status=ServiceRequest.Status.IN_PROGRESS).count(),
            "resolved": qs.filter(status=ServiceRequest.Status.RESOLVED).count(),
        })


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.filter(active=True)
    serializer_class = CategorySerializer


class RequestListCreateView(generics.ListCreateAPIView):
    serializer_class = ServiceRequestSerializer

    def get_queryset(self):
        if self.request.user.is_staff:
            return ServiceRequest.objects.select_related("category", "created_by", "assigned_to").all()
        return ServiceRequest.objects.select_related("category", "created_by", "assigned_to").filter(created_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, source=ServiceRequest.Source.USER)


class RequestDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ServiceRequestSerializer

    def get_queryset(self):
        queryset = ServiceRequest.objects.select_related("category", "created_by", "assigned_to")
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(created_by=self.request.user)


class RequestStatusView(APIView):
    def patch(self, request, pk):
        item = get_object_or_404(ServiceRequest, pk=pk)
        if not request.user.is_staff and item.created_by_id != request.user.id:
            return Response({"detail": "You do not have permission to update this request."}, status=status.HTTP_403_FORBIDDEN)
        item.status = request.data.get("status", item.status)
        item.save(update_fields=["status", "updated_at"])
        return Response(ServiceRequestSerializer(item).data)


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")


class TelemetryHistoryView(APIView):
    def get(self, request):
        range_name = request.query_params.get("range", "live")
        hours = {"live": 12, "24_hours": 24, "7_days": 24 * 7}.get(range_name, 12)
        since = timezone.now() - timedelta(hours=hours)
        readings = TelemetryReading.objects.filter(recorded_at__gte=since).order_by("recorded_at")
        grouped = defaultdict(list)
        for reading in TelemetryReadingSerializer(readings, many=True).data:
            grouped[reading["sensor_type"]].append(reading)
        return Response({"network": grouped.get("network", []), "water": grouped.get("water", []), "fire": grouped.get("fire", [])})


class TelemetryIngestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, sensor_type):
        payload = request.data
        value = payload.get("value", payload.get("latency_ms", payload.get("moisture", payload.get("smoke", 0))))
        secondary = payload.get("temperature", payload.get("temperature_c"))
        reading = TelemetryReading.objects.create(sensor_type=sensor_type, recorded_at=payload.get("timestamp", timezone.now()), value=value, secondary_value=secondary, location=payload.get("location", ""), device_id=payload.get("device_id", ""))
        return Response(TelemetryReadingSerializer(reading).data, status=status.HTTP_201_CREATED)
