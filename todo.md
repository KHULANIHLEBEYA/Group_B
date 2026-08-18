# Live telemetry integration

- [x] Define the historical telemetry endpoint and response normalization contract.
- [x] Add typed live telemetry history loading to the CSRMS API client.
- [x] Bind live network, water, fire, and temperature data to the charts.
- [x] Bind latest live readings and connection state to the sensor cards.
- [x] Add loading, API error, and demo fallback states.
- [x] Run type checking, production build, and browser verification.
- [x] Save the live telemetry checkpoint.

# Production readiness and CI

- [x] Inspect frontend and backend components in Group_B.
- [x] Identify current build, test, dependency, and deployment configuration.
- [x] Run the frontend production build and checks.
- [x] Run Django checks/build checks if a backend is present.
- [x] Add GitHub Actions CI for available components.
- [x] Verify CI files and repository status.

# Django backend scaffold

- [x] Define the backend scope from the documented CSRMS API contract.
- [x] Create Django project settings, URLs, and health endpoint.
- [x] Add CSRMS models, serializers, JWT auth, and REST endpoints.
- [x] Add backend dependency and CI checks.
- [x] Run Django checks and frontend checks together.
- [x] Commit and push the backend scaffold to Group_B.

# Local Django endpoint verification

- [x] Activate backend/.venv and apply migrations.
- [x] Start the Django development server.
- [x] Verify health, auth, request, dashboard, notification, and telemetry endpoints.
- [x] Stop the temporary server and record results.

# Frontend to Django connection verification

- [x] Inspect VITE_CSRMS_API_BASE_URL and telemetry history configuration.
- [x] Confirm Django CORS origins and backend health response.
- [x] Test frontend-origin preflight and authenticated API requests.
- [x] Document local Windows and deployed URL configuration.

# Frontend .env.local and dev-server test

- [x] Test VITE_CSRMS_API_BASE_URL with the local Django API.
- [x] Start the Vite development server with the API environment injected.
- [x] Verify the frontend server responds and report Windows .env.local setup.

# Browser console error fixes

- [x] Inspect broken manus-storage asset references and analytics script configuration.
- [x] Replace asset URLs with repository-safe frontend asset references.
- [x] Guard analytics loading when the endpoint is not configured.
- [x] Run frontend type check and production build.
- [x] Verify the corrected frontend requests and commit the fix.

# LAN CORS login fix

- [x] Add http://192.168.0.250:3000 to Django CORS_ALLOWED_ORIGINS.
- [x] Verify OPTIONS preflight for /api/auth/login/.
- [x] Verify backend health and commit/push the configuration fix.
