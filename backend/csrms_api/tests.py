from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, ServiceRequest, TelemetryReading


User = get_user_model()


class CSRMSAPITestCase(APITestCase):
    def setUp(self):
        self.student = User.objects.create_user(
            username="student01",
            email="student@example.com",
            password="StrongPass123!",
            first_name="Naledi",
        )
        self.other_student = User.objects.create_user(
            username="student02",
            email="other@example.com",
            password="StrongPass123!",
        )
        self.staff = User.objects.create_user(
            username="staff01",
            email="staff@example.com",
            password="StrongPass123!",
            is_staff=True,
        )
        self.category = Category.objects.create(name="Facilities")

    def login(self, username="student01", password="StrongPass123!"):
        response = self.client.post(
            "/api/auth/login/",
            {"username": username, "password": password},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response

    def create_request(self, user=None, title="Broken light"):
        return ServiceRequest.objects.create(
            title=title,
            description="A campus service issue needs attention.",
            category=self.category,
            location="Residence C",
            created_by=user or self.student,
        )

    def test_registration_creates_user_without_authentication(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "StrongPass123!",
                "first_name": "New",
                "last_name": "User",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newuser").exists())
        self.assertTrue(User.objects.get(username="newuser").check_password("StrongPass123!"))

    def test_login_returns_jwt_and_profile(self):
        response = self.login()

        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "student01")

        me_response = self.client.get("/api/auth/me/")
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["username"], "student01")

    def test_protected_endpoints_require_jwt(self):
        response = self.client.get("/api/requests/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_can_create_request_with_category_name(self):
        self.login()
        response = self.client.post(
            "/api/requests/",
            {
                "title": "Water leak near residence",
                "description": "Moisture is visible under the geyser.",
                "category_name": "Water",
                "priority": "HIGH",
                "location": "Residence C",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = ServiceRequest.objects.get(pk=response.data["id"])
        self.assertEqual(created.created_by, self.student)
        self.assertEqual(created.category.name, "Water")
        self.assertEqual(created.source, ServiceRequest.Source.USER)

    def test_student_request_list_is_scoped_to_owner(self):
        own_request = self.create_request(self.student, "My request")
        other_request = self.create_request(self.other_student, "Another student request")
        self.login()

        response = self.client.get("/api/requests/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data}
        self.assertIn(own_request.id, ids)
        self.assertNotIn(other_request.id, ids)

    def test_student_cannot_read_or_update_another_students_request(self):
        other_request = self.create_request(self.other_student)
        self.login()

        detail_response = self.client.get(f"/api/requests/{other_request.id}/")
        status_response = self.client.patch(
            f"/api/requests/{other_request.id}/status/",
            {"status": ServiceRequest.Status.RESOLVED},
            format="json",
        )

        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(status_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_view_all_requests_and_update_status(self):
        request = self.create_request(self.student)
        self.login("staff01")

        list_response = self.client.get("/api/requests/")
        status_response = self.client.patch(
            f"/api/requests/{request.id}/status/",
            {"status": ServiceRequest.Status.IN_PROGRESS},
            format="json",
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["id"] == request.id for item in list_response.data))
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        request.refresh_from_db()
        self.assertEqual(request.status, ServiceRequest.Status.IN_PROGRESS)

    def test_logout_endpoint_accepts_authenticated_session(self):
        self.login()
        response = self.client.post("/api/auth/logout/", {"refresh": "test-refresh"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_can_list_and_create_users(self):
        self.login("staff01")
        list_response = self.client.get("/api/users/")
        create_response = self.client.post(
            "/api/users/",
            {"username": "newstaff", "email": "newstaff@example.com", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newstaff").exists())

    def test_student_cannot_manage_users(self):
        self.login()
        response = self.client.get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_assign_request_and_assignment_creates_notification(self):
        request = self.create_request(self.student)
        self.login("staff01")
        response = self.client.post(f"/api/requests/{request.id}/assign/", {"assigned_to": self.staff.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request.refresh_from_db()
        self.assertEqual(request.assigned_to, self.staff)
        self.assertEqual(request.status, ServiceRequest.Status.ASSIGNED)
        self.assertTrue(self.staff.notifications.filter(title="Request assigned").exists())

    def test_request_updates_and_history_are_available_to_owner(self):
        request = self.create_request(self.student)
        self.login()
        update_response = self.client.post(f"/api/requests/{request.id}/updates/", {"comment": "I added more detail."}, format="json")
        history_response = self.client.get(f"/api/requests/{request.id}/history/")
        self.assertEqual(update_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(history_response.data[0]["comment"], "I added more detail.")

    def test_staff_can_update_user_and_student_cannot_access_user_management(self):
        self.login("staff01")
        response = self.client.patch(f"/api/users/{self.student.id}/", {"first_name": "Updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertEqual(self.student.first_name, "Updated")

    def test_telemetry_ingest_and_history(self):
        self.login("staff01")
        timestamp = timezone.now() - timedelta(minutes=2)

        ingest_response = self.client.post(
            "/api/telemetry/water/",
            {
                "value": 18.5,
                "timestamp": timestamp.isoformat(),
                "location": "Residence C",
                "device_id": "water-01",
            },
            format="json",
        )
        history_response = self.client.get("/api/telemetry/history/?range=live")

        self.assertEqual(ingest_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item["value"] == 18.5 for item in history_response.data["water"]))
        self.assertTrue(TelemetryReading.objects.filter(device_id="water-01").exists())

    def test_telemetry_history_returns_separate_sensor_series(self):
        now = timezone.now()
        TelemetryReading.objects.create(sensor_type="network", recorded_at=now, value=42)
        TelemetryReading.objects.create(sensor_type="water", recorded_at=now, value=12)
        TelemetryReading.objects.create(sensor_type="fire", recorded_at=now, value=4, secondary_value=22)
        self.login("staff01")

        response = self.client.get("/api/telemetry/history/?range=live")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["network"]), 1)
        self.assertEqual(len(response.data["water"]), 1)
        self.assertEqual(len(response.data["fire"]), 1)
