# CSRMS Django backend

This directory contains the initial Django REST backend scaffold for the CSRMS frontend. It provides JWT authentication, request and category resources, dashboard summaries, notifications, telemetry ingestion, and the historical telemetry endpoint consumed by the Sensors view.

## Local setup

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

The API is served under `http://127.0.0.1:8000/api/`, with a health endpoint at `/health/`. Set `CORS_ALLOWED_ORIGINS` to the frontend origin before connecting a deployed frontend.

The telemetry history endpoint is `GET /api/telemetry/history/?range=live`, with `range=24_hours` and `range=7_days` also supported. Telemetry ingestion routes are `POST /api/telemetry/network/`, `/api/telemetry/water/`, and `/api/telemetry/fire/`.

This is a development scaffold. Before production deployment, set a strong `DJANGO_SECRET_KEY`, configure `DJANGO_ALLOWED_HOSTS`, use a managed database, and restrict device ingestion with a validated device-key policy.

## Secure telemetry ingestion

Provision a device from the backend virtual environment. The command prints the raw key once; store it securely and send it in the `X-Device-Key` header with the matching `device_id`.

```powershell
python manage.py provision_device water-01 water --location "Residence C"
python manage.py provision_device fire-01 fire --location "Science Block"
python manage.py provision_device network-01 network --location "Core network room"
```

Telemetry ingestion rejects missing, incorrect, inactive, or mismatched device keys. Supported sensor types are `network`, `water`, and `fire`. Thresholds are configured in `csrms_backend/settings.py`: network alerts require three consecutive readings at or above 250 ms; water alerts trigger at moisture 70 or above; and fire alerts trigger at smoke 40 or temperature 45 or above.

A threshold crossing creates a `SYSTEM` service request and staff notifications. Active alerts are deduplicated by device and sensor until the existing request is resolved or cancelled.
