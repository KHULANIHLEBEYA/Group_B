from django.contrib import admin
from .models import Category, Notification, ServiceRequest, TelemetryReading

admin.site.register(Category)
admin.site.register(ServiceRequest)
admin.site.register(Notification)
admin.site.register(TelemetryReading)
