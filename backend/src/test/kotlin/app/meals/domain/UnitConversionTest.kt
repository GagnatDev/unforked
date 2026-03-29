package app.meals.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class UnitConversionTest {

    @Test
    fun `normalizeUnit recognizes English weight aliases`() {
        assertEquals(UnitFamily.WEIGHT, normalizeUnit("g")!!.family)
        assertEquals(UnitFamily.WEIGHT, normalizeUnit("GRAM")!!.family)
        assertEquals(UnitFamily.WEIGHT, normalizeUnit("kilogram")!!.family)
        assertEquals(UnitFamily.WEIGHT, normalizeUnit("kg")!!.family)
        assertEquals(1000.0, normalizeUnit("kg")!!.toBase)
        assertEquals(UnitFamily.WEIGHT, normalizeUnit("hg")!!.family)
        assertEquals(100.0, normalizeUnit("hectogram")!!.toBase)
    }

    @Test
    fun `normalizeUnit recognizes volume aliases`() {
        assertEquals(UnitFamily.VOLUME, normalizeUnit("ml")!!.family)
        assertEquals(UnitFamily.VOLUME, normalizeUnit("dl")!!.family)
        assertEquals(100.0, normalizeUnit("dl")!!.toBase)
        assertEquals(UnitFamily.VOLUME, normalizeUnit("l")!!.family)
        assertEquals(1000.0, normalizeUnit("L")!!.toBase)
        assertEquals(UnitFamily.VOLUME, normalizeUnit("tsp")!!.family)
        assertEquals(5.0, normalizeUnit("tsp")!!.toBase)
        assertEquals(UnitFamily.VOLUME, normalizeUnit("tbsp")!!.family)
        assertEquals(15.0, normalizeUnit("tbsp")!!.toBase)
    }

    @Test
    fun `normalizeUnit recognizes Norwegian abbreviations`() {
        assertEquals(5.0, normalizeUnit("ts")!!.toBase)
        assertEquals(15.0, normalizeUnit("ss")!!.toBase)
        assertEquals("tsp", normalizeUnit("teskje")!!.canonical)
        assertEquals("tbsp", normalizeUnit("spiseskje")!!.canonical)
    }

    @Test
    fun `normalizeUnit returns null for unknown or compound units`() {
        assertNull(normalizeUnit(""))
        assertNull(normalizeUnit("   "))
        assertNull(normalizeUnit("cloves"))
        assertNull(normalizeUnit("g can"))
        assertNull(normalizeUnit("medium"))
    }

    @Test
    fun `bestDisplayUnit weight uses g below 1000 and kg from 1000`() {
        assertEquals(500.0 to "g", bestDisplayUnit(500.0, UnitFamily.WEIGHT))
        assertEquals(1.5 to "kg", bestDisplayUnit(1500.0, UnitFamily.WEIGHT))
        assertEquals(1.0 to "kg", bestDisplayUnit(1000.0, UnitFamily.WEIGHT))
    }

    @Test
    fun `bestDisplayUnit volume uses ml dl and l thresholds`() {
        assertEquals(50.0 to "ml", bestDisplayUnit(50.0, UnitFamily.VOLUME))
        assertEquals(99.0 to "ml", bestDisplayUnit(99.0, UnitFamily.VOLUME))
        assertEquals(1.0 to "dl", bestDisplayUnit(100.0, UnitFamily.VOLUME))
        assertEquals(9.99 to "dl", bestDisplayUnit(999.0, UnitFamily.VOLUME))
        assertEquals(1.2 to "l", bestDisplayUnit(1200.0, UnitFamily.VOLUME))
        assertEquals(1.0 to "l", bestDisplayUnit(1000.0, UnitFamily.VOLUME))
    }
}
