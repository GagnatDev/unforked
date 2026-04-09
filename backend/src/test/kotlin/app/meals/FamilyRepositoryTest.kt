package app.meals

import app.meals.auth.DevAuth
import app.meals.storage.DatabaseFactory
import app.meals.storage.FamilyRepository
import io.ktor.client.request.get
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import java.util.UUID

@ExtendWith(DatabaseExtension::class)
class FamilyRepositoryTest {

    @Test
    fun `deleteIfEmpty returns false when family has members`() = testWithApp {
        client.get("/health")
        val familyId = UUID.fromString(DevAuth.FAMILY_ID)
        val result = FamilyRepository.deleteIfEmpty(familyId)
        assertFalse(result)
        assertNotNull(FamilyRepository.findById(familyId))
    }

    @Test
    fun `deleteIfEmpty removes empty family`() = testWithApp {
        client.get("/health")
        val emptyFamilyId = FamilyRepository.insert()
        assertNotNull(FamilyRepository.findById(emptyFamilyId))
        assertTrue(FamilyRepository.deleteIfEmpty(emptyFamilyId))
        assertNull(FamilyRepository.findById(emptyFamilyId))
    }

    @Test
    fun `deleteIfEmptyConn returns false when family has members`() = testWithApp {
        client.get("/health")
        val familyId = UUID.fromString(DevAuth.FAMILY_ID)
        val result = DatabaseFactory.transaction { conn ->
            FamilyRepository.deleteIfEmptyConn(conn, familyId)
        }
        assertFalse(result)
        assertNotNull(FamilyRepository.findById(familyId))
    }
}
