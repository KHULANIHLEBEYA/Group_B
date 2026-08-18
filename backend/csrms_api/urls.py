from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import CategoryListView, DashboardView, LoginView, MeView, NotificationListView, RegisterView, RequestDetailView, RequestListCreateView, RequestStatusView, TelemetryHistoryView, TelemetryIngestView

urlpatterns = [
    path("auth/login/", LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/register/", RegisterView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("dashboard/", DashboardView.as_view()),
    path("categories/", CategoryListView.as_view()),
    path("requests/", RequestListCreateView.as_view()),
    path("requests/<int:pk>/", RequestDetailView.as_view()),
    path("requests/<int:pk>/status/", RequestStatusView.as_view()),
    path("notifications/", NotificationListView.as_view()),
    path("telemetry/history/", TelemetryHistoryView.as_view()),
    path("telemetry/<str:sensor_type>/", TelemetryIngestView.as_view()),
]
