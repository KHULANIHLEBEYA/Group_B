from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Category, Notification, RequestUpdate, ServiceRequest, TelemetryDevice, TelemetryReading
from .serializers import CategorySerializer, NotificationSerializer, RequestUpdateSerializer, ServiceRequestSerializer, TelemetryReadingSerializer, UserCreateSerializer, UserSerializer

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


class LogoutView(APIView):
    def post(self, request):
        return Response({"detail": "Signed out successfully."}, status=status.HTTP_204_NO_CONTENT)


class UserListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == "POST" else UserSerializer


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer


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


class RequestAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]

    def post(self, request, pk):
        item = get_object_or_404(ServiceRequest, pk=pk)
        assignee = get_object_or_404(User, pk=request.data.get("assigned_to"))
        item.assigned_to = assignee
        item.status = ServiceRequest.Status.ASSIGNED
        item.save(update_fields=["assigned_to", "status", "updated_at"])
        Notification.objects.create(user=assignee, title="Request assigned", message=f"{item.reference}: {item.title}")
        return Response(ServiceRequestSerializer(item).data)


class RequestUpdatesView(APIView):
    def post(self, request, pk):
        item = get_object_or_404(ServiceRequest, pk=pk)
        if not request.user.is_staff and item.created_by_id != request.user.id:
            return Response({"detail": "You do not have permission to update this request."}, status=status.HTTP_403_FORBIDDEN)
        serializer = RequestUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update = serializer.save(request=item, author=request.user)
        return Response(RequestUpdateSerializer(update).data, status=status.HTTP_201_CREATED)


class RequestHistoryView(generics.ListAPIView):
    serializer_class = RequestUpdateSerializer

    def get_queryset(self):
        item = get_object_or_404(ServiceRequest, pk=self.kwargs["pk"])
        if not self.request.user.is_staff and item.created_by_id != self.request.user.id:
            return RequestUpdate.objects.none()
        return item.updates.select_related("author").order_by("created_at")


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


def _create_threshold_request(reading, device):
    sensor_type = reading.sensor_type
    network_threshold = getattr(settings, "CSRMS_NETWORK_LATENCY_THRESHOLD_MS", 250)
    network_failures = getattr(settings, "CSRMS_NETWORK_FAILURE_COUNT", 3)
    water_threshold = getattr(settings, "CSRMS_WATER_MOISTURE_THRESHOLD", 70)
    fire_smoke_threshold = getattr(settings, "CSRMS_FIRE_SMOKE_THRESHOLD", 40)
    fire_temperature_threshold = getattr(settings, "CSRMS_FIRE_TEMPERATURE_THRESHOLD", 45)

    if sensor_type == "network":
        recent = TelemetryReading.objects.filter(device_id=device.device_id, sensor_type="network").order_by("-recorded_at")[:network_failures]
        triggered = len(recent) >= network_failures and all(item.value >= network_threshold for item in recent)
        title = "Network gateway degradation detected"
        detail = f"{network_failures} consecutive readings reached {network_threshold} ms or higher. Latest: {reading.value} ms."
        priority = ServiceRequest.Priority.HIGH
    elif sensor_type == "water":
        triggered = reading.value >= water_threshold
        title = "Water leak threshold exceeded"
        detail = f"Moisture reading reached {reading.value}, above the threshold of {water_threshold}."
        priority = ServiceRequest.Priority.HIGH
    elif sensor_type == "fire":
        triggered = reading.value >= fire_smoke_threshold or (reading.secondary_value or 0) >= fire_temperature_threshold
        title = "Fire and smoke threshold exceeded"
        detail = f"Smoke: {reading.value}; temperature: {reading.secondary_value or 0}."
        priority = ServiceRequest.Priority.CRITICAL
    else:
        return None

    if not triggered:
        return None

    category, _ = Category.objects.get_or_create(name="IoT Monitoring")
    alert_key = f"iot:{device.device_id}:{sensor_type}:{device.location or reading.location}"
    active_statuses = [ServiceRequest.Status.PENDING, ServiceRequest.Status.ASSIGNED, ServiceRequest.Status.IN_PROGRESS]
    if ServiceRequest.objects.filter(alert_key=alert_key, status__in=active_statuses).exists():
        return None

    system_request = ServiceRequest.objects.create(
        alert_key=alert_key,
        title=title,
        description=detail,
        category=category,
        location=device.location or reading.location,
        priority=priority,
        source=ServiceRequest.Source.SYSTEM,
    )
    for staff_user in User.objects.filter(is_staff=True, is_active=True):
        Notification.objects.create(user=staff_user, title="Automatic IoT service request", message=f"{system_request.reference}: {system_request.title}")
    return system_request


class TelemetryIngestView(APIView):
    permission_classes = [permissions.AllowAny]
    allowed_sensor_types = {"network", "water", "fire"}

    def post(self, request, sensor_type):
        if sensor_type not in self.allowed_sensor_types:
            return Response({"detail": "Unsupported sensor type."}, status=status.HTTP_400_BAD_REQUEST)
        payload = request.data
        device_id = payload.get("device_id")
        device_key = request.headers.get("X-Device-Key")
        device = TelemetryDevice.objects.filter(device_id=device_id, active=True).first()
        if not device or device.sensor_type != sensor_type or not device.matches_key(device_key):
            return Response({"detail": "A valid device key is required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            value = float(payload.get("value", payload.get("latency_ms", payload.get("moisture", payload.get("smoke", 0)))))
            secondary = payload.get("temperature", payload.get("temperature_c"))
            secondary = float(secondary) if secondary is not None else None
        except (TypeError, ValueError):
            return Response({"detail": "Telemetry values must be numeric."}, status=status.HTTP_400_BAD_REQUEST)
        reading = TelemetryReading.objects.create(sensor_type=sensor_type, recorded_at=payload.get("timestamp", timezone.now()), value=value, secondary_value=secondary, location=payload.get("location", device.location), device_id=device.device_id)
        _create_threshold_request(reading, device)
        return Response(TelemetryReadingSerializer(reading).data, status=status.HTTP_201_CREATED)
