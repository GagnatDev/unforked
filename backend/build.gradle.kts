plugins {
    kotlin("jvm") version "1.9.24"
    kotlin("plugin.serialization") version "1.9.24"
    application
    id("com.github.johnrengelman.shadow") version "8.1.1"
    id("org.jetbrains.kotlinx.kover") version "0.9.1"
}

group = "app.meals"
version = "0.0.1"

application {
    mainClass.set("app.meals.ApplicationKt")
}

repositories {
    mavenCentral()
}


dependencies {
    implementation("io.ktor:ktor-server-core-jvm:2.3.9")
    implementation("io.ktor:ktor-server-netty-jvm:2.3.9")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:2.3.9")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:2.3.9")
    implementation("io.ktor:ktor-server-cors-jvm:2.3.9")
    implementation("io.ktor:ktor-server-status-pages-jvm:2.3.9")
    implementation("io.ktor:ktor-server-auth-jvm:2.3.9")
    implementation("io.ktor:ktor-server-auth-jwt-jvm:2.3.9")
    implementation("io.ktor:ktor-client-core-jvm:2.3.9")
    implementation("io.ktor:ktor-client-cio-jvm:2.3.9")
    implementation("at.favre.lib:bcrypt:0.10.2")
    implementation("com.auth0:java-jwt:4.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("org.jsoup:jsoup:1.17.2")
    implementation("org.postgresql:postgresql:42.7.3")
    implementation("org.flywaydb:flyway-core:10.14.0")
    implementation("org.flywaydb:flyway-database-postgresql:10.14.0")

    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testImplementation("io.ktor:ktor-server-test-host-jvm:2.3.9")
    testImplementation("io.ktor:ktor-client-content-negotiation-jvm:2.3.9")
    testImplementation("io.ktor:ktor-serialization-kotlinx-json-jvm:2.3.9")
    testImplementation("org.testcontainers:testcontainers:1.19.7")
    testImplementation("org.testcontainers:junit-jupiter:1.19.7")
    testImplementation("org.testcontainers:postgresql:1.19.7")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.2")
}

tasks.test {
    useJUnitPlatform()
    environment("JWT_SECRET", "test-secret")
    environment("JWT_ISSUER", "test-issuer")
    environment("JWT_AUDIENCE", "test-audience")
    environment("DISABLE_AUTH", "true")
}

tasks.register<JavaExec>("runE2eBackend") {
    group = "verification"
    description = "Run backend against Testcontainers PostgreSQL for Playwright e2e"
    classpath = sourceSets["test"].runtimeClasspath
    mainClass.set("app.meals.E2eBackendMainKt")
    // Ensure child JVM sees this even when the Gradle daemon was started without it.
    environment("DISABLE_AUTH", "true")
}

kotlin {
    jvmToolchain(21)
}
// OpenJDK 21 LTS; Docker build uses eclipse-temurin:21

tasks.shadowJar {
    archiveBaseName.set("meal-planning-backend")
    archiveClassifier.set("")
    archiveVersion.set("")
    manifest {
        attributes["Main-Class"] = "app.meals.ApplicationKt"
    }
    mergeServiceFiles()
}
