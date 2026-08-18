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
