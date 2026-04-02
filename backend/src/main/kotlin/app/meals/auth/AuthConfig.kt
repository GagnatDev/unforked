package app.meals.auth

/** Must match the default in `application.conf` before `${?JWT_SECRET}` override. */
const val INSECURE_JWT_SECRET_PLACEHOLDER = "change-me-in-production-use-env"

object AuthConfig {
    // These are initialized from environment/config in configureAuthentication.
    var jwtSecret: String = ""
    var issuer: String = ""
    var audience: String = ""
    var authDisabled: Boolean = false

    fun initFromEnvironment(
        jwtSecret: String,
        issuer: String,
        audience: String,
        authDisabled: Boolean
    ) {
        this.jwtSecret = jwtSecret
        this.issuer = issuer
        this.audience = audience
        this.authDisabled = authDisabled
    }

    fun createToken(userId: String, role: String, expiresInMs: Long = 7 * 24 * 60 * 60 * 1000L): String {
        return com.auth0.jwt.JWT.create()
            .withSubject(userId)
            .withIssuer(issuer)
            .withAudience(audience)
            .withClaim("role", role)
            .withExpiresAt(java.util.Date(System.currentTimeMillis() + expiresInMs))
            .sign(com.auth0.jwt.algorithms.Algorithm.HMAC256(jwtSecret))
    }
}
