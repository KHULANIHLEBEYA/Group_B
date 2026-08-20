from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Category, Notification, RequestUpdate, ServiceRequest, TelemetryDevice, TelemetryReading
from .serializers import CategorySerializer, NotificationSerializer, RequestUpdateSerializer, ServiceRequestSerializer, TelemetryReadingSerializer, UserCreateSerializer, UserSerializer

User = get_user_model()


def is_admin_user(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.is_staff))


def is_staff_user(user):
    return bool(user and user.is_authenticated and (is_admin_user(user) or user.groups.filter(name__iexact="staff").exists()))


def can_operate_request(user, item):
    return is_admin_user(user) or (is_staff_user(user) and (item.assigned_to_id in {None, user.id} or item.source == ServiceRequest.Source.SYSTEM))


class IsStaffOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_staff_user(request.user)


class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_admin_user(request.user)


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
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({"detail": "Signed out successfully."}, status=status.HTTP_204_NO_CONTENT)


class UserListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == "POST" else UserSerializer


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class DashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = ServiceRequest.objects.all()
        if not is_admin_user(request.user) and not is_staff_user(request.user):
            qs = qs.filter(created_by=request.user)
        elif is_staff_user(request.user) and not is_admin_user(request.user):
            qs = qs.filter(assigned_to=request.user) | qs.filter(source=ServiceRequest.Source.SYSTEM)
        return Response({
            "pending": qs.filter(status=ServiceRequest.Status.PENDING).count(),
            "assigned": qs.filter(status=ServiceRequest.Status.ASSIGNED).count(),
            "in_progress": qs.filter(status=ServiceRequest.Status.IN_PROGRESS).count(),
            "resolved": qs.filter(status=ServiceRequest.Status.RESOLVED).count(),
        })


class CategoryListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    queryset = Category.objects.filter(active=True)
    serializer_class = CategorySerializer


class RequestListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ServiceRequestSerializer

    def get_queryset(self):
        if is_staff_user(self.request.user):
            return ServiceRequest.objects.select_related("category", "created_by", "assigned_to").all()
        return ServiceRequest.objects.select_related("category", "created_by", "assigned_to").filter(created_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, source=ServiceRequest.Source.USER)


class RequestDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ServiceRequestSerializer

    def get_queryset(self):
        queryset = ServiceRequest.objects.select_related("category", "created_by", "assigned_to")
        if is_staff_user(self.request.user):
            return queryset
        return queryset.filter(created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        item = self.get_object()
        allowed_fields = {"title", "description", "location", "priority", "category_id", "category_name"}
        if not (is_admin_user(request.user) or can_operate_request(request.user, item)) and set(request.data) - allowed_fields:
            raise PermissionDenied("Students may not edit workflow or assignment fields.")
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save()


class RequestAssignView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def post(self, request, pk):
        item = get_object_or_404(ServiceRequest, pk=pk)
        if not is_admin_user(request.user) and item.assigned_to_id not in {None, request.user.id} and item.source != ServiceRequest.Source.SYSTEM:
            return Response({"detail": "You do not have permission to assign this request."}, status=status.HTTP_403_FORBIDDEN)
        assignee = get_object_or_404(User, pk=request.data.get("assigned_to"))
        item.assigned_to = assignee
        item.status = ServiceRequest.Status.ASSIGNED
        item.save(update_fields=["assigned_to", "status", "updated_at"])
        Notification.objects.create(user=assignee, title="Request assigned", message=f"{item.reference}: {item.title}")
        return Response(ServiceRequestSerializer(item).data)


class RequestUpdatesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        item = get_object_or_404(ServiceRequest, pk=pk)
        if not (item.created_by_id == request.user.id or can_operate_request(request.user, item)):
            return Response({"detail": "You do not have permission to update this request."}, status=status.HTTP_403_FORBIDDEN)
        serializer = RequestUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update = serializer.save(request=item, author=request.user)
        return Response(RequestUpdateSerializer(update).data, status=status.HTTP_201_CREATED)


class RequestHistoryView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RequestUpdateSerializer

    def get_queryset(self):
        item = get_object_or_404(ServiceRequest, pk=self.kwargs["pk"])
        if not (item.created_by_id == self.request.user.id or can_operate_request(self.request.user, item)):
            raise PermissionDenied("You do not have permission to view this request history.")
        return item.updates.select_related("author").order_by("created_at")


class RequestStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        item = get_object_or_404(ServiceRequest, pk=pk)
        requested_status = request.data.get("status", item.status)
        if not (is_admin_user(request.user) or can_operate_request(request.user, item) or (item.created_by_id == request.user.id and requested_status == ServiceRequest.Status.CANCELLED)):
            return Response({"detail": "You do not have permission to change this request status."}, status=status.HTTP_403_FORBIDDEN)
        item.status = requested_status
        item.save(update_fields=["status", "updated_at"])
        return Response(ServiceRequestSerializer(item).data)


class NotificationListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")


class TelemetryHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

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
