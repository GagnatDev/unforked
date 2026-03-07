# Meal Planning App

Plan meals for the week: manage recipes, assign dinners by day, and export shopping lists.

- **Backend:** Kotlin, Ktor, PostgreSQL (JSONB)
- **Frontend:** React, TypeScript, Vite; production served by Node

## Run with Docker (recommended)

From the repo root:

```bash
docker compose up --build
```

- App: http://localhost:3000  
- API: http://localhost:8080  
- Postgres: localhost:5432 (user `meals`, password `meals`, db `meals`)

## Run locally (dev)

### 1. Database

Start Postgres (e.g. via Docker):

```bash
docker compose up -d postgres
```

### 2. Backend

Requires **JDK 21** and Gradle wrapper:

```bash
cd backend
./gradlew run
```

Or with env vars:

```bash
export DB_URL=jdbc:postgresql://localhost:5432/meals DB_USER=meals DB_PASSWORD=meals
./gradlew run
```

API: http://localhost:8080

**Test data (dev):** To seed sample recipes on startup when the recipe table is empty, set `SEED_TEST_DATA=true` (env or system property). With Docker: uncomment `SEED_TEST_DATA: "true"` under `backend.environment` in `docker-compose.yml`, or run the backend with `SEED_TEST_DATA=true ./gradlew run`. Do not set in production.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to the backend. App: http://localhost:3000

### Production-style frontend (optional)

```bash
cd frontend
npm run build
BACKEND_URL=http://localhost:8080 npm run start
```

## Backend tests

Uses Testcontainers (PostgreSQL). Requires Docker.

```bash
cd backend
./gradlew test
```

## Build for production

- **Backend:** `cd backend && ./gradlew shadowJar` → `build/libs/meal-planning-backend.jar`
- **Frontend:** `cd frontend && npm run build` → `dist/`; serve with `node server.js` (set `BACKEND_URL`)

## API

- `GET/POST /api/recipes` – list, create
- `GET/PUT/DELETE /api/recipes/:id` – get, update, delete
- `GET/PUT /api/meal-plans/current?week=YYYY-Wnn` – current week plan
- `GET /api/shopping-lists?week=YYYY-Wnn` – computed list for week
- `GET /health` – health check
