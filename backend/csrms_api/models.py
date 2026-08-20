import hashlib

from django.conf import settings
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class ServiceRequest(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ASSIGNED = "ASSIGNED", "Assigned"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        RESOLVED = "RESOLVED", "Resolved"
        CANCELLED = "CANCELLED", "Cancelled"

    class Source(models.TextChoices):
        USER = "USER", "User"
        SYSTEM = "SYSTEM", "System"

    reference = models.CharField(max_length=24, unique=True, blank=True)
    alert_key = models.CharField(max_length=180, null=True, blank=True)
    title = models.CharField(max_length=180)
    description = models.TextField()
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="requests")
    location = models.CharField(max_length=180)
    priority = models.CharField(max_length=12, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    source = models.CharField(max_length=8, choices=Source.choices, default=Source.USER)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="service_requests")
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_requests")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.reference:
            super().save(*args, **kwargs)
            self.reference = f"CSR-{2040 + self.pk}"
            return super().save(update_fields=["reference"])
        return super().save(*args, **kwargs)


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=160)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class RequestUpdate(models.Model):
    request = models.ForeignKey(ServiceRequest, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="request_updates")
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class TelemetryDevice(models.Model):
    device_id = models.CharField(max_length=120, unique=True)
    key_hash = models.CharField(max_length=64)
    sensor_type = models.CharField(max_length=24)
    location = models.CharField(max_length=180, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def provision(cls, device_id, sensor_type, location=""):
        import secrets
        raw_key = secrets.token_urlsafe(32)
        device = cls.objects.create(
            device_id=device_id,
            key_hash=hashlib.sha256(raw_key.encode()).hexdigest(),
            sensor_type=sensor_type,
            location=location,
        )
        return device, raw_key

    def matches_key(self, raw_key):
        return bool(raw_key) and hashlib.sha256(raw_key.encode()).hexdigest() == self.key_hash


class TelemetryReading(models.Model):
    sensor_type = models.CharField(max_length=24)
    recorded_at = models.DateTimeField()
    value = models.FloatField(default=0)
    secondary_value = models.FloatField(null=True, blank=True)
    location = models.CharField(max_length=180, blank=True)
    device_id = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["recorded_at"]
