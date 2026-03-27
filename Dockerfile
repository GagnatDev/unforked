# -----------------------------------------------------------------------------
# Stage 1: Build frontend (React/Vite)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS frontend-build
WORKDIR /app

RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .
RUN pnpm run build

# -----------------------------------------------------------------------------
# Stage 2: Build backend (Kotlin/Gradle)
# -----------------------------------------------------------------------------
FROM eclipse-temurin:21-jdk-alpine AS backend-build
WORKDIR /app

COPY backend/gradlew .
COPY backend/gradle gradle
COPY backend/build.gradle.kts backend/settings.gradle.kts backend/gradle.properties ./
RUN ./gradlew dependencies --no-daemon || true

COPY backend/src src
RUN ./gradlew shadowJar --no-daemon

# -----------------------------------------------------------------------------
# Stage 3: Run (JRE + JAR + static frontend)
# -----------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN adduser -D -g "" appuser
USER appuser

COPY --from=backend-build /app/build/libs/meal-planning-backend.jar app.jar
COPY --from=frontend-build /app/dist web

EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["sh", "-c", "exec java -jar app.jar"]
