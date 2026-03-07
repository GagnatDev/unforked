# Build stage: OpenJDK 21 LTS
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app

# Copy Gradle wrapper and build config
COPY gradlew .
COPY gradle gradle
COPY build.gradle.kts settings.gradle.kts gradle.properties ./

# Download dependencies (cached unless build files change)
RUN ./gradlew dependencies --no-daemon || true

# Copy source and build fat JAR
COPY src src
RUN ./gradlew shadowJar --no-daemon

# Run stage: minimal JRE
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN adduser -D -g "" appuser
USER appuser

COPY --from=build /app/build/libs/meal-planning-backend.jar app.jar

EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["sh", "-c", "exec java -jar app.jar"]
